import type { JSONContent } from "@tiptap/core";
import JSZip from "jszip";
import { isAllowedLink } from "../extensions";
import { DEFAULT_PAGE, PAPER_SIZES, type OctoDocument, type PageSetup, type PaperSize } from "../model";
import { EMBED_PATH, sha256Hex } from "./shared";

export interface ImportResult {
  doc: OctoDocument;
  /** Features that could not be represented and will be lost on save. */
  warnings: string[];
  /** True when the embedded editor source was used (lossless). */
  fromEmbedded: boolean;
}

const EMU_PER_PX = 9525;

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: "#ffff00",
  green: "#00ff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  blue: "#0000ff",
  red: "#ff0000",
  darkBlue: "#000080",
  darkCyan: "#008080",
  darkGreen: "#008000",
  darkMagenta: "#800080",
  darkRed: "#800000",
  darkYellow: "#808000",
  darkGray: "#808080",
  lightGray: "#c0c0c0",
  black: "#000000",
  white: "#ffffff",
};

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

type El = Element;

const kids = (el: El | null | undefined, name?: string): El[] => (el ? Array.from(el.children).filter((c) => !name || c.localName === name) : []);
const kid = (el: El | null | undefined, name: string): El | undefined => kids(el, name)[0];
const attr = (el: El | null | undefined, name: string): string | null => {
  if (!el) return null;
  return el.getAttribute(`w:${name}`) ?? el.getAttribute(name);
};
const num = (v: string | null) => (v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const on = (el: El | undefined) => {
  if (!el) return false;
  const v = attr(el, "val");
  return v === null || !["false", "0", "off", "none"].includes(v);
};
const descendants = (el: El, name: string): El[] => Array.from(el.getElementsByTagName("*")).filter((e) => e.localName === name);

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

interface Rel {
  target: string;
  external: boolean;
}

interface Ctx {
  zip: JSZip;
  rels: Map<string, Rel>;
  numbering: Map<string, { levels: Map<number, { ordered: boolean; start: number }> }>;
  styles: Map<string, string>;
  footnotes: Map<string, string>;
  endnotes: Map<string, string>;
  warnings: Set<string>;
  images: Map<string, string>;
}

async function readRels(zip: JSZip, path: string): Promise<Map<string, Rel>> {
  const map = new Map<string, Rel>();
  const file = zip.file(path);
  if (!file) return map;
  const xml = parseXml(await file.async("string"));
  for (const rel of Array.from(xml.getElementsByTagName("Relationship"))) {
    map.set(rel.getAttribute("Id") ?? "", { target: rel.getAttribute("Target") ?? "", external: rel.getAttribute("TargetMode") === "External" });
  }
  return map;
}

async function readNumbering(zip: JSZip): Promise<Ctx["numbering"]> {
  const result: Ctx["numbering"] = new Map();
  const file = zip.file("word/numbering.xml");
  if (!file) return result;
  const xml = parseXml(await file.async("string")).documentElement;
  const abstract = new Map<string, Map<number, { ordered: boolean; start: number }>>();
  for (const a of kids(xml, "abstractNum")) {
    const levels = new Map<number, { ordered: boolean; start: number }>();
    for (const lvl of kids(a, "lvl")) {
      const format = attr(kid(lvl, "numFmt"), "val") ?? "bullet";
      levels.set(Number(attr(lvl, "ilvl") ?? 0), { ordered: format !== "bullet" && format !== "none", start: num(attr(kid(lvl, "start"), "val")) ?? 1 });
    }
    abstract.set(attr(a, "abstractNumId") ?? "", levels);
  }
  for (const n of kids(xml, "num")) {
    const levels = new Map(abstract.get(attr(kid(n, "abstractNumId"), "val") ?? "") ?? []);
    for (const override of kids(n, "lvlOverride")) {
      const start = num(attr(kid(override, "startOverride"), "val"));
      const ilvl = Number(attr(override, "ilvl") ?? 0);
      const level = levels.get(ilvl);
      if (level && start !== null) levels.set(ilvl, { ...level, start });
    }
    result.set(attr(n, "numId") ?? "", { levels });
  }
  return result;
}

async function readStyles(zip: JSZip): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const file = zip.file("word/styles.xml");
  if (!file) return map;
  const xml = parseXml(await file.async("string")).documentElement;
  for (const style of kids(xml, "style")) map.set(attr(style, "styleId") ?? "", (attr(kid(style, "name"), "val") ?? "").toLowerCase());
  return map;
}

async function readNotes(zip: JSZip, path: string, tag: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const file = zip.file(path);
  if (!file) return map;
  const xml = parseXml(await file.async("string")).documentElement;
  for (const note of kids(xml, tag)) {
    const type = attr(note, "type");
    if (type === "separator" || type === "continuationSeparator" || type === "continuationNotice") continue;
    const text = kids(note, "p")
      .map((p) => descendants(p, "t").map((t) => t.textContent ?? "").join(""))
      .join(" ")
      .trim();
    map.set(attr(note, "id") ?? "", text);
  }
  return map;
}

function fieldValue(instr: string): string | null {
  if (/\bNUMPAGES\b/.test(instr)) return "{PAGES}";
  if (/\bPAGE\b/.test(instr)) return "{PAGE}";
  return null;
}

/** Text of a header/footer paragraph with PAGE/NUMPAGES fields as {PAGE}/{PAGES}. */
function fieldAwareText(el: El, state = { mode: "none" as "none" | "instr" | "result", instr: "", known: false }): string {
  let out = "";
  for (const child of kids(el)) {
    switch (child.localName) {
      case "r":
        for (const part of kids(child)) {
          if (part.localName === "fldChar") {
            const type = attr(part, "fldCharType");
            if (type === "begin") Object.assign(state, { mode: "instr", instr: "", known: false });
            else if (type === "separate") {
              const value = fieldValue(state.instr);
              state.mode = "result";
              state.known = value !== null;
              out += value ?? "";
            } else if (type === "end") state.mode = "none";
          } else if (part.localName === "instrText") state.instr += part.textContent ?? "";
          else if (part.localName === "t" && state.mode !== "instr" && !(state.mode === "result" && state.known)) out += part.textContent ?? "";
          else if (part.localName === "tab") out += " ";
        }
        break;
      case "fldSimple":
        out += fieldValue(attr(child, "instr") ?? "") ?? fieldAwareText(child, state);
        break;
      case "hyperlink":
      case "sdt":
      case "sdtContent":
      case "ins":
      case "smartTag":
        out += fieldAwareText(child, state);
        break;
    }
  }
  return out;
}

async function headerFooterText(ctx: Ctx, rid: string | null): Promise<string> {
  if (!rid) return "";
  const rel = ctx.rels.get(rid);
  const file = rel && ctx.zip.file(`word/${rel.target.replace(/^\/?word\//, "")}`);
  if (!file) return "";
  const xml = parseXml(await file.async("string")).documentElement;
  return descendants(xml, "p")
    .map((p) => fieldAwareText(p).trim())
    .filter(Boolean)
    .join(" ");
}

async function image(ctx: Ctx, drawing: El): Promise<JSONContent | null> {
  const uri = descendants(drawing, "graphicData")[0]?.getAttribute("uri") ?? "";
  if (uri.includes("chart")) {
    ctx.warnings.add("Charts aren't supported yet and were removed.");
    return null;
  }
  if (uri.includes("diagram")) {
    ctx.warnings.add("SmartArt diagrams aren't supported and were removed.");
    return null;
  }
  if (descendants(drawing, "txbx").length || descendants(drawing, "txbxContent").length) {
    ctx.warnings.add("Text boxes aren't supported; their text was removed.");
    return null;
  }
  const blip = descendants(drawing, "blip")[0];
  const rid = blip?.getAttribute("r:embed");
  if (!rid) {
    ctx.warnings.add("Some drawings or shapes aren't supported and were removed.");
    return null;
  }
  if (kid(drawing, "anchor")) ctx.warnings.add("Floating images were placed in line with the text.");
  let src = ctx.images.get(rid);
  if (!src) {
    const rel = ctx.rels.get(rid);
    const path = rel ? `word/${rel.target.replace(/^\/?word\//, "")}` : "";
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const file = path && ctx.zip.file(path);
    if (!file || !IMAGE_MIME[ext]) {
      ctx.warnings.add("Some images use formats that aren't supported (for example EMF or TIFF) and were removed.");
      return null;
    }
    src = `data:${IMAGE_MIME[ext]};base64,${toBase64(await file.async("uint8array"))}`;
    ctx.images.set(rid, src);
  }
  const extent = descendants(drawing, "extent")[0];
  const width = Math.round(Number(extent?.getAttribute("cx") ?? 0) / EMU_PER_PX) || null;
  const height = Math.round(Number(extent?.getAttribute("cy") ?? 0) / EMU_PER_PX) || null;
  const alt = descendants(drawing, "docPr")[0]?.getAttribute("descr") ?? null;
  return { type: "image", attrs: { src, width, height, alt } };
}

function runMarks(rPr: El | undefined): JSONContent["marks"] {
  if (!rPr) return [];
  const marks: NonNullable<JSONContent["marks"]> = [];
  if (on(kid(rPr, "b"))) marks.push({ type: "bold" });
  if (on(kid(rPr, "i"))) marks.push({ type: "italic" });
  const u = kid(rPr, "u");
  if (u && attr(u, "val") !== "none") marks.push({ type: "underline" });
  if (on(kid(rPr, "strike")) || on(kid(rPr, "dstrike"))) marks.push({ type: "strike" });
  const vert = attr(kid(rPr, "vertAlign"), "val");
  if (vert === "superscript") marks.push({ type: "superscript" });
  if (vert === "subscript") marks.push({ type: "subscript" });
  const highlight = attr(kid(rPr, "highlight"), "val");
  const shd = attr(kid(rPr, "shd"), "fill");
  if (highlight && HIGHLIGHT_COLORS[highlight]) marks.push({ type: "highlight", attrs: { color: HIGHLIGHT_COLORS[highlight] } });
  else if (shd && /^[0-9a-f]{6}$/i.test(shd)) marks.push({ type: "highlight", attrs: { color: `#${shd.toLowerCase()}` } });
  const style: Record<string, string> = {};
  const color = attr(kid(rPr, "color"), "val");
  if (color && /^[0-9a-f]{6}$/i.test(color) && color !== "000000") style.color = `#${color.toLowerCase()}`;
  const size = num(attr(kid(rPr, "sz"), "val"));
  if (size) style.fontSize = `${size / 2}pt`;
  const font = kid(rPr, "rFonts");
  const family = font && (font.getAttribute("w:ascii") ?? font.getAttribute("w:hAnsi"));
  if (family) style.fontFamily = family;
  if (Object.keys(style).length) marks.push({ type: "textStyle", attrs: style });
  return marks;
}

/** Output of a paragraph: inline runs, plus block nodes that split it. */
type Piece = { kind: "inline"; node: JSONContent } | { kind: "block"; node: JSONContent };

async function runPieces(ctx: Ctx, el: El, link: string | null, pieces: Piece[], field: { depth: number; inResult: boolean[] }): Promise<void> {
  for (const child of kids(el)) {
    switch (child.localName) {
      case "r": {
        const marks = [...(runMarks(kid(child, "rPr")) ?? [])];
        if (link) marks.push({ type: "link", attrs: { href: link } });
        for (const part of kids(child)) {
          switch (part.localName) {
            case "t":
              if (field.depth > 0 && !field.inResult[field.depth - 1]) break;
              if (part.textContent) pieces.push({ kind: "inline", node: { type: "text", text: part.textContent, ...(marks.length ? { marks } : {}) } });
              break;
            case "tab":
              pieces.push({ kind: "inline", node: { type: "text", text: "\t", ...(marks.length ? { marks } : {}) } });
              break;
            case "br":
              if (attr(part, "type") === "page") pieces.push({ kind: "block", node: { type: "pageBreak" } });
              else pieces.push({ kind: "inline", node: { type: "hardBreak" } });
              break;
            case "cr":
              pieces.push({ kind: "inline", node: { type: "hardBreak" } });
              break;
            case "drawing": {
              const img = await image(ctx, part);
              if (img) pieces.push({ kind: "block", node: img });
              break;
            }
            case "pict":
            case "object":
              ctx.warnings.add("Embedded objects and legacy drawings aren't supported and were removed.");
              break;
            case "footnoteReference":
            case "endnoteReference": {
              const id = attr(part, "id") ?? "";
              const text = (part.localName === "footnoteReference" ? ctx.footnotes : ctx.endnotes).get(id) ?? "";
              if (part.localName === "endnoteReference") ctx.warnings.add("Endnotes were converted to footnotes.");
              pieces.push({ kind: "inline", node: { type: "footnote", attrs: { text } } });
              break;
            }
            case "fldChar": {
              const type = attr(part, "fldCharType");
              if (type === "begin") {
                field.depth++;
                field.inResult.push(false);
                ctx.warnings.add("Fields (such as dates or cross-references) were converted to plain text.");
              } else if (type === "separate" && field.depth > 0) field.inResult[field.depth - 1] = true;
              else if (type === "end" && field.depth > 0) {
                field.depth--;
                field.inResult.pop();
              }
              break;
            }
            case "AlternateContent": {
              const drawing = descendants(part, "drawing")[0];
              const img = drawing ? await image(ctx, drawing) : null;
              if (img) pieces.push({ kind: "block", node: img });
              else if (!drawing) ctx.warnings.add("Some drawings or shapes aren't supported and were removed.");
              break;
            }
          }
        }
        break;
      }
      case "hyperlink": {
        const rid = child.getAttribute("r:id");
        const target = rid ? ctx.rels.get(rid)?.target ?? null : null;
        await runPieces(ctx, child, target && isAllowedLink(target) ? target : null, pieces, field);
        break;
      }
      case "ins":
        ctx.warnings.add("Tracked changes were accepted.");
        await runPieces(ctx, child, link, pieces, field);
        break;
      case "del":
      case "moveFrom":
        ctx.warnings.add("Tracked changes were accepted.");
        break;
      case "moveTo":
      case "smartTag":
      case "customXml":
      case "fldSimple":
        if (child.localName === "fldSimple") ctx.warnings.add("Fields (such as dates or cross-references) were converted to plain text.");
        await runPieces(ctx, child, link, pieces, field);
        break;
      case "sdt":
        await runPieces(ctx, kid(child, "sdtContent")!, link, pieces, field);
        break;
      case "commentRangeStart":
      case "commentReference":
        ctx.warnings.add("Comments aren't supported yet and were removed.");
        break;
      case "oMath":
      case "oMathPara": {
        const latex = descendants(child, "t")
          .filter((t) => t.namespaceURI?.includes("math"))
          .map((t) => t.textContent ?? "")
          .join("");
        pieces.push(
          child.localName === "oMathPara" ? { kind: "block", node: { type: "blockMath", attrs: { latex } } } : { kind: "inline", node: { type: "inlineMath", attrs: { latex } } },
        );
        break;
      }
    }
  }
}

interface ParagraphInfo {
  kind: "paragraph" | "heading" | "quote";
  level?: number;
  attrs: Record<string, unknown>;
  list?: { numId: string; ilvl: number; ordered: boolean; start: number };
  pageBreakBefore: boolean;
  sectPr?: El;
  /** Paragraph with only a bottom border and no text: a horizontal rule. */
  rule: boolean;
}

function paragraphInfo(ctx: Ctx, p: El): ParagraphInfo {
  const pPr = kid(p, "pPr");
  const info: ParagraphInfo = { kind: "paragraph", attrs: {}, pageBreakBefore: on(kid(pPr, "pageBreakBefore")), rule: false };
  const styleId = attr(kid(pPr, "pStyle"), "val") ?? "";
  const styleName = ctx.styles.get(styleId) ?? styleId.toLowerCase();
  const heading = /^heading\s*([1-6])$/.exec(styleName) ?? /^heading([1-6])$/i.exec(styleId);
  if (heading) {
    info.kind = "heading";
    info.level = Number(heading[1]);
  } else if (styleName === "title") info.attrs.styleName = "title";
  else if (styleName === "subtitle") info.attrs.styleName = "subtitle";
  else if (styleName === "quote" || styleName === "intense quote") info.kind = "quote";

  const jc = attr(kid(pPr, "jc"), "val");
  const align = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : jc === "both" || jc === "distribute" ? "justify" : null;
  if (align) info.attrs.textAlign = align;
  const ind = kid(pPr, "ind");
  const left = num(attr(ind, "left") ?? attr(ind, "start"));
  const firstLine = num(attr(ind, "firstLine"));
  const hanging = num(attr(ind, "hanging"));
  const numPr = kid(pPr, "numPr");
  if (left && !numPr && info.kind !== "quote") info.attrs.indent = left;
  if (firstLine && !numPr) info.attrs.firstLine = firstLine;
  if (hanging && !numPr) info.attrs.firstLine = -hanging;
  const spacing = kid(pPr, "spacing");
  const before = num(attr(spacing, "before"));
  const after = num(attr(spacing, "after"));
  const line = num(attr(spacing, "line"));
  if (before !== null) info.attrs.spaceBefore = before;
  if (after !== null) info.attrs.spaceAfter = after;
  if (line && (attr(spacing, "lineRule") ?? "auto") === "auto") info.attrs.lineHeight = Math.round((line / 240) * 100) / 100;
  const borders = kid(pPr, "pBdr");
  if (borders) {
    const has = (side: string) => {
      const b = kid(borders, side);
      return !!b && attr(b, "val") !== "none" && attr(b, "val") !== "nil";
    };
    if (has("top") && has("bottom") && has("left") && has("right")) info.attrs.border = "box";
    else if (has("top")) info.attrs.border = "top";
    else if (has("bottom")) info.attrs.border = "bottom";
  }
  const shd = attr(kid(pPr, "shd"), "fill");
  if (shd && /^[0-9a-f]{6}$/i.test(shd)) info.attrs.shading = `#${shd.toLowerCase()}`;

  if (numPr) {
    const numId = attr(kid(numPr, "numId"), "val") ?? "";
    const ilvl = Number(attr(kid(numPr, "ilvl"), "val") ?? 0);
    const level = ctx.numbering.get(numId)?.levels.get(ilvl);
    if (numId !== "0" && level) info.list = { numId, ilvl: Math.min(ilvl, 8), ordered: level.ordered, start: level.start };
  }
  info.sectPr = kid(pPr, "sectPr");
  const hasText = descendants(p, "t").some((t) => t.textContent) || descendants(p, "drawing").length > 0;
  info.rule = info.attrs.border === "bottom" && !hasText && Object.keys(info.attrs).length === 1;
  return info;
}

async function paragraphBlocks(ctx: Ctx, p: El, info: ParagraphInfo): Promise<JSONContent[]> {
  const pieces: Piece[] = [];
  await runPieces(ctx, p, null, pieces, { depth: 0, inResult: [] });
  // A paragraph holding only one equation is a display equation.
  const only = pieces.length === 1 ? pieces[0]! : null;
  if (only?.kind === "inline" && only.node.type === "inlineMath") return [{ type: "blockMath", attrs: only.node.attrs }];
  const make = (inline: JSONContent[]): JSONContent => {
    const content = inline.length ? { content: inline } : {};
    if (info.kind === "heading") return { type: "heading", attrs: { ...info.attrs, level: info.level }, ...content };
    return { type: "paragraph", attrs: info.attrs, ...content };
  };
  const out: JSONContent[] = [];
  if (info.pageBreakBefore) out.push({ type: "pageBreak" });
  let inline: JSONContent[] = [];
  let produced = false;
  for (const piece of pieces) {
    if (piece.kind === "inline") inline.push(piece.node);
    else {
      if (inline.length) out.push(make(inline));
      inline = [];
      out.push(piece.node);
      produced = true;
    }
  }
  if (inline.length || !produced) out.push(make(inline));
  return out;
}

interface ListFrame {
  list: JSONContent;
  numId: string;
}

/** Builds nested Tiptap lists from flat numbered paragraphs. */
class ListBuilder {
  private stack: ListFrame[] = [];
  constructor(private readonly emit: (node: JSONContent) => void) {}

  add(info: NonNullable<ParagraphInfo["list"]>, blocksForItem: JSONContent[]) {
    const level = info.ilvl;
    if (this.stack.length && level === 0 && this.stack[0]!.numId !== info.numId) this.flush();
    while (this.stack.length > level + 1) this.stack.pop();
    while (this.stack.length < level + 1) {
      const list: JSONContent = { type: info.ordered ? "orderedList" : "bulletList", ...(info.ordered ? { attrs: { start: info.start } } : {}), content: [] };
      const parent = this.stack[this.stack.length - 1];
      if (!parent) this.emit(list);
      else {
        const items = parent.list.content!;
        if (!items.length) items.push({ type: "listItem", content: [{ type: "paragraph" }] });
        items[items.length - 1]!.content!.push(list);
      }
      this.stack.push({ list, numId: info.numId });
    }
    this.stack[level]!.list.content!.push({ type: "listItem", content: blocksForItem.length ? blocksForItem : [{ type: "paragraph" }] });
  }

  flush() {
    this.stack = [];
  }
}

async function table(ctx: Ctx, tbl: El): Promise<JSONContent> {
  const gridWidths = kids(kid(tbl, "tblGrid"), "gridCol").map((c) => Math.round((num(attr(c, "w")) ?? 0) / 15));
  const rows: JSONContent[] = [];
  const origin = new Map<number, JSONContent>();
  for (const tr of kids(tbl, "tr")) {
    const header = on(kid(kid(tr, "trPr"), "tblHeader"));
    const cells: JSONContent[] = [];
    let col = num(attr(kid(kid(tr, "trPr"), "gridBefore"), "val")) ?? 0;
    for (const tc of kids(tr, "tc")) {
      const tcPr = kid(tc, "tcPr");
      const span = num(attr(kid(tcPr, "gridSpan"), "val")) ?? 1;
      const vMerge = kid(tcPr, "vMerge");
      const vMergeVal = vMerge ? attr(vMerge, "val") ?? "continue" : null;
      if (vMergeVal === "continue") {
        const top = origin.get(col);
        if (top) top.attrs!.rowspan = (top.attrs!.rowspan as number) + 1;
        col += span;
        continue;
      }
      const content = await bodyBlocks(ctx, tc);
      const widths = gridWidths.slice(col, col + span);
      const cell: JSONContent = {
        type: header ? "tableHeader" : "tableCell",
        attrs: { colspan: span, rowspan: 1, colwidth: widths.length === span && widths.every((w) => w > 0) ? widths : null },
        content: content.length ? content : [{ type: "paragraph" }],
      };
      for (let c = col; c < col + span; c++) {
        if (vMergeVal === "restart") origin.set(c, cell);
        else origin.delete(c);
      }
      cells.push(cell);
      col += span;
    }
    if (cells.length) rows.push({ type: "tableRow", content: cells });
  }
  return { type: "table", content: rows };
}

/** Converts a run of body-level elements (document body or a table cell). */
async function bodyBlocks(ctx: Ctx, container: El, onSection?: (sectPr: El, blocks: JSONContent[]) => void): Promise<JSONContent[]> {
  let out: JSONContent[] = [];
  const lists = new ListBuilder((node) => out.push(node));
  let quote: JSONContent | null = null;

  const visit = async (el: El) => {
    for (const child of kids(el)) {
      if (child.localName === "p") {
        const info = paragraphInfo(ctx, child);
        if (info.rule) {
          lists.flush();
          quote = null;
          out.push({ type: "horizontalRule" });
        } else {
          const blocks = await paragraphBlocks(ctx, child, info);
          if (info.list) {
            quote = null;
            lists.add(info.list, blocks);
          } else if (info.kind === "quote") {
            lists.flush();
            if (!quote) {
              quote = { type: "blockquote", content: [] };
              out.push(quote);
            }
            quote.content!.push(...blocks);
          } else {
            lists.flush();
            quote = null;
            out.push(...blocks);
          }
        }
        if (info.sectPr && onSection) {
          lists.flush();
          quote = null;
          onSection(info.sectPr, out);
          out = [];
        }
      } else if (child.localName === "tbl") {
        lists.flush();
        quote = null;
        out.push(await table(ctx, child));
      } else if (child.localName === "sdt") {
        await visit(kid(child, "sdtContent")!);
      } else if (child.localName === "customXml" || child.localName === "ins") {
        await visit(child);
      } else if (child.localName === "altChunk") {
        ctx.warnings.add("Embedded HTML or RTF content isn't supported and was removed.");
      }
    }
  };
  await visit(container);
  return out;
}

function pageSetupFrom(sectPr: El | undefined, header: string, footer: string): PageSetup {
  const page: PageSetup = structuredClone(DEFAULT_PAGE);
  if (!sectPr) return page;
  const pgSz = kid(sectPr, "pgSz");
  const w = num(attr(pgSz, "w"));
  const h = num(attr(pgSz, "h"));
  if (w && h) {
    const landscape = attr(pgSz, "orient") === "landscape" || w > h;
    page.orientation = landscape ? "landscape" : "portrait";
    const [pw, ph] = landscape ? [h, w] : [w, h];
    const match = (Object.entries(PAPER_SIZES) as [PaperSize, { width: number; height: number }][]).find(
      ([, s]) => Math.abs(s.width - pw) < 60 && Math.abs(s.height - ph) < 60,
    );
    page.size = match ? match[0] : "letter";
  }
  const mar = kid(sectPr, "pgMar");
  if (mar) {
    page.margins = {
      top: Math.abs(num(attr(mar, "top")) ?? 1440),
      right: num(attr(mar, "right")) ?? 1440,
      bottom: Math.abs(num(attr(mar, "bottom")) ?? 1440),
      left: num(attr(mar, "left")) ?? 1440,
    };
  }
  const NUMBERS = /\s*Page \{PAGE\} of \{PAGES\}$/;
  page.header = { text: header, align: "center" };
  if (NUMBERS.test(footer)) {
    page.pageNumbers = true;
    page.footer = { text: footer.replace(NUMBERS, "").trim(), align: "center" };
  } else page.footer = { text: footer, align: "center" };
  return page;
}

/** Imports DOCX bytes into an editor document, reporting lossy features. */
export async function importDocx(bytes: Uint8Array): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("This file has no document body.");

  const embedded = zip.file(EMBED_PATH);
  if (embedded) {
    try {
      const parsed = JSON.parse(await embedded.async("string")) as { hash?: string; doc?: OctoDocument };
      if (parsed.doc?.version === 1 && parsed.hash === (await sha256Hex(documentXml))) {
        return { doc: parsed.doc, warnings: [], fromEmbedded: true };
      }
    } catch {
      // Fall through to the XML.
    }
  }

  const ctx: Ctx = {
    zip,
    rels: await readRels(zip, "word/_rels/document.xml.rels"),
    numbering: await readNumbering(zip),
    styles: await readStyles(zip),
    footnotes: await readNotes(zip, "word/footnotes.xml", "footnote"),
    endnotes: await readNotes(zip, "word/endnotes.xml", "endnote"),
    warnings: new Set(),
    images: new Map(),
  };
  if (zip.file("word/comments.xml")) ctx.warnings.add("Comments aren't supported yet and were removed.");

  const xml = parseXml(documentXml);
  if (xml.getElementsByTagName("parsererror").length) throw new Error("The document XML is malformed.");
  const body = descendants(xml.documentElement, "body")[0];
  if (!body) throw new Error("This file has no document body.");

  const sections: { sectPr: El; blocks: JSONContent[] }[] = [];
  const rest = await bodyBlocks(ctx, body, (sectPr, blocks) => sections.push({ sectPr, blocks }));
  const finalSect = kid(body, "sectPr");
  sections.push({ sectPr: finalSect!, blocks: rest });

  const content: JSONContent[] = [];
  for (const section of sections) {
    const cols = num(attr(kid(section.sectPr, "cols"), "num")) ?? 1;
    if (cols > 1 && section.blocks.length) content.push({ type: "columnSection", attrs: { count: Math.min(cols, 4) }, content: section.blocks });
    else content.push(...section.blocks);
  }
  const distinctPages = new Set(sections.map((s) => JSON.stringify([kid(s.sectPr, "pgSz")?.outerHTML, kid(s.sectPr, "pgMar")?.outerHTML])));
  if (distinctPages.size > 1) ctx.warnings.add("The document has sections with different page settings; the last section's settings now apply to the whole document.");

  // Sections without their own header inherit the previous one, so take the first defined.
  const allSects = sections.map((s) => s.sectPr).filter(Boolean);
  const firstRef = (tag: string) => allSects.map((sp) => kids(sp, tag).find((r) => attr(r, "type") === "default")).find(Boolean);
  const headerRef = firstRef("headerReference");
  const footerRef = firstRef("footerReference");
  const header = await headerFooterText(ctx, headerRef?.getAttribute("r:id") ?? null);
  const footer = await headerFooterText(ctx, footerRef?.getAttribute("r:id") ?? null);
  if (kids(finalSect, "headerReference").some((r) => attr(r, "type") !== "default") || kids(finalSect, "footerReference").some((r) => attr(r, "type") !== "default")) {
    ctx.warnings.add("Different first-page or odd/even headers and footers were simplified to one header and footer.");
  }

  return {
    doc: { version: 1, page: pageSetupFrom(finalSect, header, footer), content: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] } },
    warnings: [...ctx.warnings],
    fromEmbedded: false,
  };
}
