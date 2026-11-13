import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFPageProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PdfRect } from "../model";

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Opens a PDF for display. XFA is disabled and no scripting sandbox is
 * loaded, so documents can't run code in the page.
 */
export function openPdf(bytes: Uint8Array): PDFDocumentLoadingTask {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  return getDocument({ data: bytes.slice(), enableXfa: false, stopAtErrors: false });
}

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

export interface PageText {
  text: string;
  /** For each character in `text`, the item index and offset within it (-1 for separators). */
  map: { item: number; offset: number }[];
  items: TextItemLike[];
}

export async function pageText(page: PDFPageProxy): Promise<PageText> {
  const content = await page.getTextContent();
  const items = content.items.filter((i): i is TextItemLike & typeof i => "str" in i) as unknown as TextItemLike[];
  let text = "";
  const map: PageText["map"] = [];
  items.forEach((item, index) => {
    for (let o = 0; o < item.str.length; o++) {
      text += item.str[o];
      map.push({ item: index, offset: o });
    }
    // Items on separate lines are joined by a space so phrases can match across them.
    if (item.hasEOL) {
      text += " ";
      map.push({ item: -1, offset: -1 });
    }
  });
  return { text, map, items };
}

/** Rectangles (PDF space) covering [start, end) of the page text. */
export function matchRects(pt: PageText, start: number, end: number): PdfRect[] {
  const byItem = new Map<number, [number, number]>();
  for (let i = start; i < end; i++) {
    const m = pt.map[i];
    if (!m || m.item < 0) continue;
    const range = byItem.get(m.item);
    byItem.set(m.item, range ? [range[0], m.offset + 1] : [m.offset, m.offset + 1]);
  }
  const rects: PdfRect[] = [];
  for (const [index, [a, b]] of byItem) {
    const item = pt.items[index]!;
    const [, , c, d, x, y] = item.transform as [number, number, number, number, number, number];
    const h = item.height || Math.hypot(c, d) || 10;
    const len = item.str.length || 1;
    rects.push([x + (item.width * a) / len, y - h * 0.22, x + (item.width * b) / len, y + h * 0.92]);
  }
  return rects;
}

export function findInText(pt: PageText, query: string): [number, number][] {
  if (!query) return [];
  const hay = pt.text.toLowerCase();
  const needle = query.toLowerCase();
  const out: [number, number][] = [];
  let i = hay.indexOf(needle);
  while (i >= 0) {
    out.push([i, i + needle.length]);
    i = hay.indexOf(needle, i + needle.length);
  }
  return out;
}
