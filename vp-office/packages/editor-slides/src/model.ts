/** Positions and sizes are in inches; font sizes in points. */

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  size?: number;
  font?: string;
}

export interface Paragraph {
  runs: TextRun[];
  align?: "left" | "center" | "right" | "justify";
  bullet?: boolean;
  /** Indent level for bullets, 0-based. */
  level?: number;
}

export interface TextBody {
  paragraphs: Paragraph[];
  /** Vertical anchoring inside the box. */
  valign?: "top" | "middle" | "bottom";
}

interface ElementBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees clockwise. */
  rotation?: number;
  /** Elements sharing a group id move and select together. */
  groupId?: string;
}

export interface TextElement extends ElementBase {
  kind: "text";
  body: TextBody;
  /** Role used for theme styling and layout placeholders. */
  role?: "title" | "subtitle" | "body";
}

export type ShapeKind = "rect" | "roundRect" | "ellipse" | "triangle" | "line" | "arrow";

export interface ShapeElement extends ElementBase {
  kind: "shape";
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  body?: TextBody;
}

export interface ImageElement extends ElementBase {
  kind: "image";
  /** PNG/JPEG/GIF data URL. */
  src: string;
  alt?: string;
}

export interface TableElement extends ElementBase {
  kind: "table";
  rows: string[][];
  header: boolean;
}

export type SlideElement = TextElement | ShapeElement | ImageElement | TableElement;

export type LayoutId = "title" | "titleContent" | "section" | "twoContent" | "titleOnly" | "blank";

export interface Slide {
  id: string;
  layout: LayoutId;
  background?: string;
  elements: SlideElement[];
  notes: string;
  hidden?: boolean;
}

export type ThemeId = "light" | "navy" | "slate" | "teal";

export interface Theme {
  id: ThemeId;
  label: string;
  background: string;
  title: string;
  text: string;
  accent: string;
  font: string;
  /** Background for title and section slides. */
  titleBackground: string;
  titleSlideText: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  light: { id: "light", label: "Light", background: "#ffffff", title: "#1e3a5f", text: "#1f2937", accent: "#0f9f8f", font: "Calibri", titleBackground: "#ffffff", titleSlideText: "#1e3a5f" },
  navy: { id: "navy", label: "Navy", background: "#ffffff", title: "#1e3a5f", text: "#1f2937", accent: "#1e4f8a", font: "Calibri", titleBackground: "#1e3a5f", titleSlideText: "#ffffff" },
  slate: { id: "slate", label: "Slate", background: "#f1f5f9", title: "#0f172a", text: "#334155", accent: "#6366f1", font: "Segoe UI", titleBackground: "#0f172a", titleSlideText: "#f8fafc" },
  teal: { id: "teal", label: "Teal", background: "#ffffff", title: "#115e59", text: "#1f2937", accent: "#0d9488", font: "Georgia", titleBackground: "#ccfbf1", titleSlideText: "#115e59" },
};

export interface Deck {
  version: 1;
  /** Slide size in inches (16:9 is 13.333 × 7.5). */
  width: number;
  height: number;
  theme: ThemeId;
  slides: Slide[];
}

export const LAYOUTS: Record<LayoutId, string> = {
  title: "Title slide",
  titleContent: "Title and content",
  section: "Section header",
  twoContent: "Two content",
  titleOnly: "Title only",
  blank: "Blank",
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export const textBody = (text: string, opts: Partial<TextRun> & { align?: Paragraph["align"]; bullet?: boolean } = {}): TextBody => {
  const { align, bullet, ...run } = opts;
  return {
    paragraphs: text.split("\n").map((line) => ({ runs: [{ ...run, text: line }], ...(align ? { align } : {}), ...(bullet ? { bullet } : {}) })),
  };
};

export function plainText(body: TextBody | undefined): string {
  return (body?.paragraphs ?? []).map((p) => p.runs.map((r) => r.text).join("")).join("\n");
}

/** Placeholder elements for a new slide with the given layout. */
export function layoutElements(layout: LayoutId, deck: Pick<Deck, "width" | "height">): SlideElement[] {
  const W = deck.width;
  const H = deck.height;
  const m = 0.6;
  const title = (y: number, h: number, size: number, align: Paragraph["align"] = "left", text = "Click to add title"): TextElement => ({
    id: newId(), kind: "text", role: "title", x: m, y, w: W - 2 * m, h, body: { ...textBody(text, { size, bold: true, align }), valign: "middle" },
  });
  const body = (x: number, w: number, text = "Click to add text"): TextElement => ({
    id: newId(), kind: "text", role: "body", x, y: 1.6, w, h: H - 2.2, body: textBody(text, { size: 20, bullet: true }),
  });
  switch (layout) {
    case "title":
      return [
        title(H * 0.3, 1.4, 40, "center"),
        { id: newId(), kind: "text", role: "subtitle", x: m * 2, y: H * 0.3 + 1.5, w: W - 4 * m, h: 0.8, body: textBody("Click to add subtitle", { size: 22, align: "center" }) },
      ];
    case "titleContent":
      return [title(0.4, 1, 32), body(m, W - 2 * m)];
    case "section":
      return [title(H * 0.38, 1.3, 40, "left", "Section title")];
    case "twoContent":
      return [title(0.4, 1, 32), body(m, (W - 3 * m) / 2), body(m * 2 + (W - 3 * m) / 2, (W - 3 * m) / 2)];
    case "titleOnly":
      return [title(0.4, 1, 32)];
    case "blank":
      return [];
  }
}

export function newSlide(layout: LayoutId, deck: Pick<Deck, "width" | "height">): Slide {
  return { id: newId(), layout, elements: layoutElements(layout, deck), notes: "" };
}

export function emptyDeck(): Deck {
  const deck: Deck = { version: 1, width: 13.333, height: 7.5, theme: "navy", slides: [] };
  deck.slides.push(newSlide("title", deck));
  return deck;
}

/** Background colour of a slide after theme defaults. */
export function slideBackground(deck: Deck, slide: Slide): string {
  if (slide.background) return slide.background;
  const theme = THEMES[deck.theme];
  return slide.layout === "title" || slide.layout === "section" ? theme.titleBackground : theme.background;
}

/** Default text colour for an element on a slide. */
export function defaultTextColor(deck: Deck, slide: Slide, el: TextElement | ShapeElement): string {
  const theme = THEMES[deck.theme];
  const titleish = slide.layout === "title" || slide.layout === "section";
  if (el.kind === "text" && (el.role === "title" || el.role === "subtitle")) return titleish ? theme.titleSlideText : theme.title;
  return titleish && !slide.background ? theme.titleSlideText : theme.text;
}
