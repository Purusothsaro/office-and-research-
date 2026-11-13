import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Opens a PDF for display. XFA and scripting are disabled, so documents
 * can't run code in the page.
 */
export function openPdf(bytes: Uint8Array): PDFDocumentLoadingTask {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  return getDocument({ data: bytes.slice(), enableXfa: false, stopAtErrors: false });
}

/** An open PDF that can be closed (pdf.js closes documents through their loading task). */
export type OpenPdf = PDFDocumentProxy & { destroy(): Promise<void> };

export async function loadPdf(bytes: Uint8Array): Promise<OpenPdf> {
  const task = openPdf(bytes);
  const doc = await task.promise;
  return Object.assign(doc, { destroy: () => task.destroy() });
}

/** OCR engine files, served by this app (see vite.config.ts). */
export const OCR_ASSETS = {
  workerPath: `${import.meta.env.BASE_URL}ocr/worker.min.js`,
  corePath: `${import.meta.env.BASE_URL}ocr/core`,
  langPath: `${import.meta.env.BASE_URL}ocr/lang`,
};
