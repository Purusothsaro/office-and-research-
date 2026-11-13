/** Rectangle in PDF user space: [x1, y1, x2, y2] with y growing upwards. */
export type PdfRect = [number, number, number, number];
export type PdfPoint = [number, number];

export type AnnotationKind = "highlight" | "note" | "ink" | "text" | "signature";

interface BaseAnnotation {
  id: string;
  kind: AnnotationKind;
  /** Index of the page in the original (base) document. */
  page: number;
  /** Bounding box in PDF user space. */
  rect: PdfRect;
  /** Hex colour, e.g. #ffd400. */
  color: string;
  /** Comment attached to the annotation. */
  comment: string;
  author: string;
  createdAt: number;
}

export interface HighlightAnnotation extends BaseAnnotation {
  kind: "highlight";
  /** One rectangle per highlighted line (or one for an area highlight). */
  rects: PdfRect[];
  /** Text under the highlight, when it came from a text selection. */
  quote: string;
}

export interface NoteAnnotation extends BaseAnnotation {
  kind: "note";
}

export interface InkAnnotation extends BaseAnnotation {
  kind: "ink";
  paths: PdfPoint[][];
  width: number;
}

export interface TextAnnotation extends BaseAnnotation {
  kind: "text";
  text: string;
  fontSize: number;
}

export interface SignatureAnnotation extends BaseAnnotation {
  kind: "signature";
  /** PNG data URL of the drawn signature. */
  image: string;
}

export type PdfAnnotation = HighlightAnnotation | NoteAnnotation | InkAnnotation | TextAnnotation | SignatureAnnotation;

export interface PageEntry {
  /** Index of the page in the base document. */
  source: number;
  /** Extra clockwise rotation applied here: 0, 90, 180 or 270. */
  rotation: number;
}

export type FormValue = string | boolean | string[];

export type FontFamily = "sans" | "serif" | "mono";

/** A replaced line of the PDF's own text. */
export interface TextEdit {
  id: string;
  /** Base-document page index. */
  page: number;
  /** pdf.js text item transform [a, b, c, d, x, y] in user space. */
  transform: [number, number, number, number, number, number];
  /** Width of the original run in user space. */
  width: number;
  /** Font size in user space. */
  size: number;
  original: string;
  /** New text; empty deletes the run. */
  text: string;
  font: { family: FontFamily; bold: boolean; italic: boolean };
  /** Hex colour for the new text; null uses the original colour when known. */
  color: string | null;
}

export interface PdfEditState {
  version: 1;
  /** Page order after reordering/deleting; deleted pages are absent. */
  pages: PageEntry[];
  annotations: PdfAnnotation[];
  /** Form field values keyed by fully qualified field name. */
  formValues: Record<string, FormValue>;
  /** Edits to the PDF's existing text (optional for drafts made before this existed). */
  textEdits?: TextEdit[];
}

export type FormFieldType = "text" | "checkbox" | "radio" | "dropdown" | "optionlist" | "signature" | "button";

export interface FormWidget {
  page: number;
  rect: PdfRect;
  /** For radio buttons and checkboxes: the value this widget represents. */
  exportValue?: string;
}

export interface FormFieldInfo {
  name: string;
  type: FormFieldType;
  widgets: FormWidget[];
  value: FormValue;
  options: string[];
  multiline: boolean;
  readOnly: boolean;
  maxLength?: number;
}

export function initialState(pageCount: number): PdfEditState {
  return { version: 1, pages: Array.from({ length: pageCount }, (_, i) => ({ source: i, rotation: 0 })), annotations: [], formValues: {}, textEdits: [] };
}

export function normalizeRect([x1, y1, x2, y2]: PdfRect): PdfRect {
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

export function unionRects(rects: PdfRect[]): PdfRect {
  return rects.reduce<PdfRect>(
    (acc, r) => {
      const n = normalizeRect(r);
      return [Math.min(acc[0], n[0]), Math.min(acc[1], n[1]), Math.max(acc[2], n[2]), Math.max(acc[3], n[3])];
    },
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

export function inkBounds(paths: PdfPoint[][], width: number): PdfRect {
  const pts = paths.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = width / 2 + 1;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}

/** Moves an annotation by (dx, dy) in PDF units. */
export function translateAnnotation<T extends PdfAnnotation>(a: T, dx: number, dy: number): T {
  const move = (r: PdfRect): PdfRect => [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
  const next = { ...a, rect: move(a.rect) };
  if (next.kind === "highlight") (next as HighlightAnnotation).rects = (a as HighlightAnnotation).rects.map(move);
  if (next.kind === "ink") (next as InkAnnotation).paths = (a as InkAnnotation).paths.map((path) => path.map(([x, y]) => [x + dx, y + dy] as PdfPoint));
  return next;
}

const HEX = /^#[0-9a-f]{6}$/i;
export function hexToRgb(hex: string): [number, number, number] {
  const h = HEX.test(hex) ? hex : "#ffd400";
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
}

export const ANNOTATION_COLORS = ["#ffd400", "#5fd35f", "#4fc3f7", "#ff8a80", "#ce93d8", "#1e3a5f", "#d32f2f", "#000000"];

/** Approximate rectangle (PDF space) covered by a text run. */
export function textRunRect(transform: TextEdit["transform"], width: number, size: number): PdfRect {
  const [a, b, c, d, x, y] = transform;
  const ul = Math.hypot(a, b) || 1;
  const vl = Math.hypot(c, d) || 1;
  const u: PdfPoint = [a / ul, b / ul];
  const v: PdfPoint = [c / vl, d / vl];
  const corners: PdfPoint[] = [
    [x - v[0] * size * 0.25, y - v[1] * size * 0.25],
    [x + u[0] * width - v[0] * size * 0.25, y + u[1] * width - v[1] * size * 0.25],
    [x + v[0] * size * 0.95, y + v[1] * size * 0.95],
    [x + u[0] * width + v[0] * size * 0.95, y + u[1] * width + v[1] * size * 0.95],
  ];
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Picks a standard font family and style from an embedded font's name. */
export function guessFont(name: string, genericFamily = ""): TextEdit["font"] {
  const n = name.replace(/^[A-Z]{6}\+/, "");
  const family: FontFamily = /courier|mono|consol/i.test(n) || genericFamily === "monospace"
    ? "mono"
    : /times|serif|roman|garamond|georgia|cambria|book|minion|palatino|caslon/i.test(n) && !/sans/i.test(n)
      ? "serif"
      : genericFamily === "serif" && !/sans|arial|helvetica|calibri|verdana/i.test(n)
        ? "serif"
        : "sans";
  return { family, bold: /bold|black|heavy|semibold|demi/i.test(n), italic: /italic|oblique/i.test(n) };
}
