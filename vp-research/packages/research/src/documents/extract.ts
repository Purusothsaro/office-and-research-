import type { PDFDocumentProxy } from "pdfjs-dist";
import { pageIndexFromItems, type DocumentIndex, type PageIndex } from "../search/text-index";
import type { OcrPage, OcrWord } from "./ocr";

/** Extracts the text of every page (on demand, one page at a time) into a search index. */
export async function indexPdf(
  doc: PDFDocumentProxy,
  ids: { documentId: string; viewFileId: string; viewRevision: number },
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<DocumentIndex> {
  const pages: PageIndex[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(pageIndexFromItems(i - 1, content.items));
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  return { ...ids, pages };
}

/** Where the OCR engine's files are served from (same origin; nothing is fetched from third parties). */
export interface OcrAssets {
  workerPath: string;
  corePath: string;
  langPath: string;
}

/**
 * Recognises text on each page image in the browser with Tesseract (WebAssembly).
 * The document never leaves the device. Returns words in PDF coordinates.
 */
export async function recognizePdf(doc: PDFDocumentProxy, assets: OcrAssets, onProgress?: (fraction: number, page: number) => void, signal?: AbortSignal): Promise<OcrPage[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, { ...assets, gzip: true, workerBlobURL: false, cacheMethod: "none" });
  const out: OcrPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      // About 250 dpi for a Letter page, capped for very large pages.
      const scale = Math.min(3.5, 3000 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
      const words: OcrWord[] = [];
      for (const block of data.blocks ?? [])
        for (const para of block.paragraphs)
          for (const line of para.lines)
            for (const w of line.words) {
              if (!w.text.trim() || w.confidence < 20) continue;
              const [ax, ay] = viewport.convertToPdfPoint(w.bbox.x0, w.bbox.y1) as [number, number];
              const [bx, by] = viewport.convertToPdfPoint(w.bbox.x1, w.bbox.y0) as [number, number];
              words.push({ text: w.text, x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by), confidence: w.confidence });
            }
      out.push({ page: i - 1, words, confidence: words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : 0 });
      canvas.width = canvas.height = 0;
      page.cleanup();
      onProgress?.(i / doc.numPages, i);
    }
  } finally {
    await worker.terminate();
  }
  return out;
}
