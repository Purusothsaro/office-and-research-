// Helpers for tests running in Node: pdf.js (legacy build) and sample PDFs.
import { PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib";
import { indexPdf } from "./documents/extract";
import type { DocumentIndex } from "./search/text-index";

export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

export async function openInNode(bytes: Uint8Array) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true });
  const doc = await task.promise;
  // Closing goes through the loading task.
  return Object.assign(doc, { destroy: () => task.destroy() });
}

export async function indexBytes(bytes: Uint8Array, documentId = "d1", viewFileId = "f1", viewRevision = 1): Promise<DocumentIndex> {
  const doc = await openInNode(bytes);
  try {
    // The legacy build's proxy is structurally the same as the main build's.
    return await indexPdf(doc as never, { documentId, viewFileId, viewRevision });
  } finally {
    await doc.destroy();
  }
}

/** A PDF whose pages each contain the given lines of text. */
export async function makePdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    lines.forEach((t, i) => page.drawText(t, { x: 72, y: 700 - i * 20, size: 12, font, color: rgb(0, 0, 0) }));
  }
  return doc.save();
}
