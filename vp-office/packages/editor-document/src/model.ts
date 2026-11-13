import type { JSONContent } from "@tiptap/core";

/** Lengths are stored in twips (1/1440 inch), the unit DOCX uses. */
export const TWIPS_PER_INCH = 1440;
export const PX_PER_INCH = 96;
export const twipsToPx = (twips: number) => (twips * PX_PER_INCH) / TWIPS_PER_INCH;
export const pxToTwips = (px: number) => Math.round((px * TWIPS_PER_INCH) / PX_PER_INCH);

export type PaperSize = "letter" | "legal" | "a4";
export type Orientation = "portrait" | "landscape";

export const PAPER_SIZES: Record<PaperSize, { label: string; width: number; height: number }> = {
  letter: { label: 'Letter (8.5" × 11")', width: 12240, height: 15840 },
  legal: { label: 'Legal (8.5" × 14")', width: 12240, height: 20160 },
  a4: { label: "A4 (210 × 297 mm)", width: 11906, height: 16838 },
};

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const MARGIN_PRESETS: Record<string, { label: string; margins: Margins }> = {
  normal: { label: 'Normal (1")', margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
  narrow: { label: 'Narrow (0.5")', margins: { top: 720, right: 720, bottom: 720, left: 720 } },
  moderate: { label: 'Moderate (1" / 0.75")', margins: { top: 1440, right: 1080, bottom: 1440, left: 1080 } },
  wide: { label: 'Wide (1" / 2")', margins: { top: 1440, right: 2880, bottom: 1440, left: 2880 } },
};

export interface HeaderFooter {
  text: string;
  align: "left" | "center" | "right";
}

export interface PageSetup {
  size: PaperSize;
  orientation: Orientation;
  margins: Margins;
  header: HeaderFooter;
  footer: HeaderFooter;
  /** Footer shows "Page X of Y" when true (in addition to footer text). */
  pageNumbers: boolean;
}

export interface OctoDocument {
  version: 1;
  page: PageSetup;
  content: JSONContent;
}

export const DEFAULT_PAGE: PageSetup = {
  size: "letter",
  orientation: "portrait",
  margins: { ...MARGIN_PRESETS.normal!.margins },
  header: { text: "", align: "center" },
  footer: { text: "", align: "center" },
  pageNumbers: false,
};

export function emptyDocument(): OctoDocument {
  return { version: 1, page: structuredClone(DEFAULT_PAGE), content: { type: "doc", content: [{ type: "paragraph" }] } };
}

export interface PageGeometry {
  widthPx: number;
  heightPx: number;
  margins: Margins;
  marginsPx: Margins;
  contentWidthPx: number;
  contentHeightPx: number;
}

export function pageGeometry(page: PageSetup): PageGeometry {
  const paper = PAPER_SIZES[page.size];
  const [w, h] = page.orientation === "portrait" ? [paper.width, paper.height] : [paper.height, paper.width];
  const m = page.margins;
  const marginsPx = { top: twipsToPx(m.top), right: twipsToPx(m.right), bottom: twipsToPx(m.bottom), left: twipsToPx(m.left) };
  const widthPx = twipsToPx(w);
  const heightPx = twipsToPx(h);
  return {
    widthPx,
    heightPx,
    margins: m,
    marginsPx,
    contentWidthPx: widthPx - marginsPx.left - marginsPx.right,
    contentHeightPx: heightPx - marginsPx.top - marginsPx.bottom,
  };
}

/** Replaces {PAGE} and {PAGES} fields in header/footer text. */
export function fillPageFields(text: string, page: number, pages: number): string {
  return text.replace(/\{PAGE\}/g, String(page)).replace(/\{PAGES\}/g, String(pages));
}
