import { beginText, endText, PDFDocument, popGraphicsState, pushGraphicsState, setCharacterSqueeze, setFontAndSize, setTextMatrix, setTextRenderingMode, showText, StandardFonts, TextRenderingMode } from "@cantoo/pdf-lib";

/** A recognised word with its box in PDF user space (y grows upwards). */
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}

export interface OcrPage {
  /** 0-based page index in the original PDF. */
  page: number;
  words: OcrWord[];
  /** Mean word confidence, 0–100. */
  confidence: number;
}

/**
 * Builds a searchable copy of a scanned PDF: the original pages, unchanged,
 * with the recognised words added as invisible text positioned over the
 * page images. pdf.js then selects and searches that text like native text.
 */
export async function buildSearchablePdf(original: Uint8Array, pages: OcrPage[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(original, { ignoreEncryption: false, updateMetadata: false });
  const out = await PDFDocument.create();
  out.setCreator("OctoGenie Research (OCR copy)");
  out.setTitle(src.getTitle() ?? "OCR copy");
  const font = await out.embedFont(StandardFonts.Helvetica);
  const copied = await out.copyPages(src, src.getPageIndices());
  const byPage = new Map(pages.map((p) => [p.page, p]));
  copied.forEach((page, i) => {
    out.addPage(page);
    const ocr = byPage.get(i);
    if (!ocr?.words.length) return;
    const fontKey = page.node.newFontDictionary(font.name, font.ref);
    const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
    for (const w of ocr.words) {
      let text = "";
      for (const ch of w.text) {
        try {
          font.encodeText(ch);
          text += ch;
        } catch {
          text += "?";
        }
      }
      if (!text.trim()) continue;
      const height = Math.max(4, w.y1 - w.y0);
      const size = height * 0.9;
      const natural = font.widthOfTextAtSize(`${text} `, size);
      // Stretch each word to the width it occupies on the image so selections line up.
      const squeeze = natural > 0 ? Math.max(10, Math.min(500, ((w.x1 - w.x0) / font.widthOfTextAtSize(text, size)) * 100)) : 100;
      ops.push(setFontAndSize(fontKey, size), setCharacterSqueeze(squeeze), setTextMatrix(1, 0, 0, 1, w.x0, w.y0 + height * 0.18), showText(font.encodeText(`${text} `)));
    }
    ops.push(endText(), popGraphicsState());
    page.pushOperators(...ops);
  });
  return out.save();
}
