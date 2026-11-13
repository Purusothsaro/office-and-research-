import {
  buildSearchablePdf,
  checkImport,
  convertToPdf,
  indexKey,
  indexPdf,
  looksScanned,
  newId,
  recognizePdf,
  type DocumentIndex,
  type LocalStore,
  type ResearchApi,
  type ResearchDocument,
} from "@octo/research";
import { loadPdf, OCR_ASSETS, type OpenPdf } from "../lib/pdf";

export type Progress = (message: string, fraction?: number) => void;

/**
 * Loads, converts, indexes and OCRs project documents. Original uploads are
 * never modified: converted and OCR'd copies are stored as separate files
 * linked to their original.
 */
export class DocumentService {
  private bytes = new Map<string, Promise<Uint8Array>>();
  private indexes = new Map<string, DocumentIndex>();

  constructor(
    private readonly api: ResearchApi,
    private readonly local: LocalStore,
  ) {}

  /** The viewer PDF of a document at an exact revision (cached in memory). */
  pdfBytes(fileId: string, revision: number): Promise<Uint8Array> {
    const key = indexKey(fileId, revision);
    let p = this.bytes.get(key);
    if (!p) {
      p = this.api.fileContent(fileId, revision);
      p.catch(() => this.bytes.delete(key));
      this.bytes.set(key, p);
    }
    return p;
  }

  async openPdf(fileId: string, revision: number): Promise<OpenPdf> {
    return loadPdf(await this.pdfBytes(fileId, revision));
  }

  /** Text index of a document's current viewer PDF: memory, then this device, then extracted. */
  async index(doc: ResearchDocument, onProgress?: (done: number, total: number) => void): Promise<DocumentIndex> {
    const key = indexKey(doc.viewFileId, doc.viewRevision);
    const cached = this.indexes.get(key) ?? (await this.local.getIndex(key).catch(() => undefined));
    if (cached) {
      const idx = { ...cached, documentId: doc.id };
      this.indexes.set(key, idx);
      return idx;
    }
    const pdf = await this.openPdf(doc.viewFileId, doc.viewRevision);
    try {
      const idx = await indexPdf(pdf, { documentId: doc.id, viewFileId: doc.viewFileId, viewRevision: doc.viewRevision }, onProgress);
      this.indexes.set(key, idx);
      void this.local.putIndex(key, idx).catch(() => undefined);
      return idx;
    } finally {
      void pdf.destroy();
    }
  }

  cachedIndex(doc: ResearchDocument): DocumentIndex | undefined {
    const idx = this.indexes.get(indexKey(doc.viewFileId, doc.viewRevision));
    return idx ? { ...idx, documentId: doc.id } : undefined;
  }

  /** Uploads a new file and returns its document entry, still "processing". */
  async upload(file: File): Promise<{ doc: ResearchDocument; bytes: Uint8Array }> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkImport(file.name, bytes);
    if (!check.ok) throw new Error(`${file.name}: ${check.reason}`);
    const info = await this.api.uploadFile(file.name, bytes);
    const doc: ResearchDocument = {
      id: newId(),
      fileId: info.id,
      revision: info.revision,
      name: info.name,
      format: check.format,
      viewFileId: info.id,
      viewRevision: info.revision,
      textMode: "none",
      pageCount: 0,
      status: "processing",
      addedAt: Date.now(),
    };
    return { doc, bytes };
  }

  /**
   * Makes a document readable and searchable: converts non-PDF formats to a
   * PDF copy, extracts text, and flags scans that need OCR.
   */
  async process(doc: ResearchDocument, bytes: Uint8Array, progress: Progress): Promise<ResearchDocument> {
    let next: ResearchDocument = { ...doc };
    delete next.error;
    if (doc.format !== "pdf") {
      progress("Converting for reading…");
      const out = await convertToPdf(doc.format, bytes, doc.name);
      const copy = await this.api.uploadFile(doc.name.replace(/\.[^.]+$/, "") + ".pdf", out.pdf, { from: doc.fileId, revision: doc.revision, kind: "converted" });
      this.bytes.set(indexKey(copy.id, copy.revision), Promise.resolve(out.pdf));
      next = { ...next, viewFileId: copy.id, viewRevision: copy.revision, textMode: "converted", pageCount: out.pageCount, ...(out.warnings.length ? { warnings: out.warnings } : {}) };
    } else {
      this.bytes.set(indexKey(doc.fileId, doc.revision), Promise.resolve(bytes));
      next = { ...next, viewFileId: doc.fileId, viewRevision: doc.revision };
    }
    progress("Reading text…", 0);
    const idx = await this.index(next, (d, t) => progress(`Reading text (page ${d} of ${t})…`, d / t));
    next.pageCount = idx.pages.length;
    if (doc.format === "pdf") {
      const scanned = looksScanned(idx.pages);
      next.textMode = scanned ? "none" : "native";
      next.status = scanned ? "needs-ocr" : "ready";
    } else next.status = "ready";
    return next;
  }

  /**
   * Recognises text on page images in this browser and stores a searchable
   * copy (original pages plus an invisible text layer). The original is kept.
   */
  async ocr(doc: ResearchDocument, progress: Progress, signal?: AbortSignal): Promise<ResearchDocument> {
    progress("Preparing OCR…", 0);
    const original = await this.pdfBytes(doc.fileId, doc.revision);
    const pdf = await loadPdf(original);
    let pages;
    try {
      pages = await recognizePdf(pdf, OCR_ASSETS, (f, page) => progress(`Recognising text (page ${page} of ${pdf.numPages})…`, f), signal);
    } finally {
      void pdf.destroy();
    }
    const words = pages.reduce((n, p) => n + p.words.length, 0);
    if (!words) throw new Error("No text was recognised in this document.");
    progress("Saving searchable copy…", 1);
    const searchable = await buildSearchablePdf(original, pages);
    const copy = await this.api.uploadFile(doc.name.replace(/\.pdf$/i, "") + " (OCR).pdf", searchable, { from: doc.fileId, revision: doc.revision, kind: "ocr" });
    this.bytes.set(indexKey(copy.id, copy.revision), Promise.resolve(searchable));
    const confidence = Math.round(pages.reduce((s, p) => s + p.confidence * p.words.length, 0) / words);
    const next: ResearchDocument = {
      ...doc,
      viewFileId: copy.id,
      viewRevision: copy.revision,
      textMode: "ocr",
      status: "ready",
      warnings: [`Text recognised by OCR (average confidence ${confidence}%). Check quotations against the page image.`],
    };
    const idx = await this.index(next);
    return { ...next, pageCount: idx.pages.length };
  }

  /** Stores a new version of the original file (the old one stays in its history). */
  async replace(doc: ResearchDocument, file: File): Promise<{ doc: ResearchDocument; bytes: Uint8Array }> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkImport(file.name, bytes);
    if (!check.ok) throw new Error(check.reason);
    if (check.format !== doc.format) throw new Error(`Choose a ${doc.format.toUpperCase()} file to replace this document.`);
    const current = await this.api.getFile(doc.fileId);
    const info = await this.api.replaceFile(doc.fileId, bytes, current.revision);
    return { doc: { ...doc, revision: info.revision, status: "processing", textMode: "none" }, bytes };
  }
}
