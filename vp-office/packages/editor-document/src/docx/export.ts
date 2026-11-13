import type { JSONContent } from "@tiptap/core";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Math as DocxMath,
  MathRun,
  Packer,
  PageBreak as DocxPageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  SectionType,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ISectionOptions,
  type ParagraphChild,
} from "docx";
import JSZip from "jszip";
import { shapeSvg, normalizeShape, type ShapeAttrs } from "../extensions/nodes";
import { PAPER_SIZES, type OctoDocument, type PageSetup } from "../model";
import { EMBED_PATH, sha256Hex } from "./shared";

export interface ExportOptions {
  /** Rasterises SVG (shapes) to PNG for Word versions without SVG support. */
  rasterize?: (svg: string, width: number, height: number) => Promise<Uint8Array>;
}

// 1×1 transparent PNG used as an SVG fallback when no rasteriser is available.
const BLANK_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
  (c) => c.charCodeAt(0),
);

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

const hex = (color: unknown) => (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1).toUpperCase() : undefined);

function dataUrlBytes(src: string): { type: "png" | "jpg" | "gif"; data: Uint8Array } | null {
  const match = /^data:image\/(png|jpeg|gif|webp);base64,(.*)$/i.exec(src);
  if (!match) return null;
  const kind = match[1]!.toLowerCase();
  // docx has no WebP type; Word reads WebP inside PNG-typed parts poorly, so skip it.
  if (kind === "webp") return null;
  const data = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
  return { type: kind === "jpeg" ? "jpg" : (kind as "png" | "gif"), data };
}

interface Ctx {
  footnotes: Record<number, { children: Paragraph[] }>;
  nextFootnote: number;
  listInstance: number;
  options: ExportOptions;
  warnings: Set<string>;
}

function runOptions(marks: JSONContent["marks"]) {
  const o: Record<string, unknown> = {};
  let link: string | undefined;
  for (const mark of marks ?? []) {
    const a = mark.attrs ?? {};
    switch (mark.type) {
      case "bold":
        o.bold = true;
        break;
      case "italic":
        o.italics = true;
        break;
      case "underline":
        o.underline = {};
        break;
      case "strike":
        o.strike = true;
        break;
      case "subscript":
        o.subScript = true;
        break;
      case "superscript":
        o.superScript = true;
        break;
      case "highlight": {
        const fill = hex(a.color) ?? "FFFF00";
        o.shading = { type: ShadingType.CLEAR, fill, color: "auto" };
        break;
      }
      case "textStyle": {
        if (hex(a.color)) o.color = hex(a.color);
        if (typeof a.fontFamily === "string" && a.fontFamily) o.font = a.fontFamily.split(",")[0]!.replace(/["']/g, "").trim();
        const size = typeof a.fontSize === "string" ? parseFloat(a.fontSize) : NaN;
        if (Number.isFinite(size)) o.size = Math.round((a.fontSize as string).endsWith("px") ? size * 1.5 : size * 2);
        break;
      }
      case "link":
        if (typeof a.href === "string") link = a.href;
        break;
    }
  }
  return { o, link };
}

async function inlineChildren(nodes: JSONContent[] | undefined, ctx: Ctx): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case "text": {
        const { o, link } = runOptions(node.marks);
        // Tabs become real tab stops in Word.
        const parts = (node.text ?? "").split("\t");
        const runs = (style?: string) =>
          parts.map((text, i) => new TextRun({ ...o, ...(style ? { style } : {}), children: i === 0 ? [text] : [new Tab(), text] }));
        if (link) out.push(new ExternalHyperlink({ link, children: runs("Hyperlink") }));
        else out.push(...runs());
        break;
      }
      case "hardBreak":
        out.push(new TextRun({ break: 1 }));
        break;
      case "footnote": {
        const id = ctx.nextFootnote++;
        ctx.footnotes[id] = { children: [new Paragraph({ children: [new TextRun(String(node.attrs?.text ?? ""))] })] };
        out.push(new FootnoteReferenceRun(id));
        break;
      }
      case "inlineMath":
        out.push(new DocxMath({ children: [new MathRun(String(node.attrs?.latex ?? ""))] }));
        break;
    }
  }
  return out;
}

function paragraphProps(attrs: Record<string, unknown> | undefined): Partial<IParagraphOptions> {
  const a = attrs ?? {};
  const p: Record<string, unknown> = {};
  if (typeof a.textAlign === "string" && ALIGN[a.textAlign]) p.alignment = ALIGN[a.textAlign];
  const indent: Record<string, number> = {};
  if (typeof a.indent === "number") indent.left = a.indent;
  if (typeof a.firstLine === "number") {
    if (a.firstLine < 0) indent.hanging = -a.firstLine;
    else indent.firstLine = a.firstLine;
  }
  if (Object.keys(indent).length) p.indent = indent;
  const spacing: Record<string, number> = {};
  if (typeof a.spaceBefore === "number") spacing.before = a.spaceBefore;
  if (typeof a.spaceAfter === "number") spacing.after = a.spaceAfter;
  if (typeof a.lineHeight === "number") spacing.line = Math.round(a.lineHeight * 240);
  if (Object.keys(spacing).length) p.spacing = spacing;
  const line = { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 1 };
  if (a.border === "box") p.border = { top: line, bottom: line, left: line, right: line };
  if (a.border === "top") p.border = { top: line };
  if (a.border === "bottom") p.border = { bottom: line };
  if (hex(a.shading)) p.shading = { type: ShadingType.CLEAR, fill: hex(a.shading), color: "auto" };
  if (a.styleName === "title") p.heading = HeadingLevel.TITLE;
  if (a.styleName === "subtitle") p.style = "Subtitle";
  return p as Partial<IParagraphOptions>;
}

type Block = Paragraph | Table;

async function blocks(nodes: JSONContent[] | undefined, ctx: Ctx, extra: Partial<IParagraphOptions> = {}): Promise<Block[]> {
  const out: Block[] = [];
  for (const node of nodes ?? []) out.push(...(await block(node, ctx, extra)));
  return out;
}

async function listBlocks(node: JSONContent, ctx: Ctx, level: number, extra: Partial<IParagraphOptions>): Promise<Block[]> {
  const ordered = node.type === "orderedList";
  const instance = ctx.listInstance++;
  const out: Block[] = [];
  for (const item of node.content ?? []) {
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        out.push(...(await listBlocks(child, ctx, Math.min(level + 1, 8), extra)));
      } else if (child.type === "paragraph" && first) {
        out.push(
          new Paragraph({
            ...extra,
            ...paragraphProps(child.attrs),
            numbering: { reference: ordered ? "ordered" : "bullets", level, ...(ordered ? { instance } : {}) },
            children: await inlineChildren(child.content, ctx),
          }),
        );
        first = false;
      } else {
        out.push(...(await block(child, ctx, { ...extra, indent: { left: 720 * (level + 1) } })));
      }
    }
  }
  return out;
}

async function block(node: JSONContent, ctx: Ctx, extra: Partial<IParagraphOptions> = {}): Promise<Block[]> {
  switch (node.type) {
    case "paragraph":
      return [new Paragraph({ ...extra, ...paragraphProps(node.attrs), children: await inlineChildren(node.content, ctx) })];
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return [new Paragraph({ ...extra, ...paragraphProps(node.attrs), heading: HEADINGS[level - 1], children: await inlineChildren(node.content, ctx) })];
    }
    case "blockquote":
      return blocks(node.content, ctx, { ...extra, style: "Quote" });
    case "bulletList":
    case "orderedList":
      return listBlocks(node, ctx, 0, extra);
    case "horizontalRule":
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } }, children: [] })];
    case "pageBreak":
      return [new Paragraph({ children: [new DocxPageBreak()] })];
    case "blockMath":
      return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new DocxMath({ children: [new MathRun(String(node.attrs?.latex ?? ""))] })] })];
    case "image": {
      const img = dataUrlBytes(String(node.attrs?.src ?? ""));
      if (!img) {
        ctx.warnings.add("Some images use a format Word can't embed and were left out.");
        return [];
      }
      const width = Number(node.attrs?.width) || 400;
      const height = Number(node.attrs?.height) || Math.round(width * 0.75);
      return [new Paragraph({ children: [new ImageRun({ type: img.type, data: img.data, transformation: { width, height }, altText: { name: "Image", description: String(node.attrs?.alt ?? ""), title: "" } })] })];
    }
    case "shape": {
      const attrs = normalizeShape((node.attrs ?? {}) as Partial<ShapeAttrs>);
      const svg = shapeSvg(attrs);
      const fallback = ctx.options.rasterize ? await ctx.options.rasterize(svg, attrs.width, attrs.height) : BLANK_PNG;
      return [
        new Paragraph({
          children: [
            new ImageRun({
              type: "svg",
              data: new TextEncoder().encode(svg),
              fallback: { type: "png", data: fallback },
              transformation: { width: attrs.width, height: attrs.height },
            }),
          ],
        }),
      ];
    }
    case "tableOfContents":
      return [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Contents")] })];
    case "table":
      return [await table(node, ctx)];
    case "columnSection":
      // Handled at section level.
      return blocks(node.content, ctx, extra);
    default:
      return [];
  }
}

async function table(node: JSONContent, ctx: Ctx): Promise<Table> {
  const rows: TableRow[] = [];
  for (const row of node.content ?? []) {
    const cells: TableCell[] = [];
    let header = false;
    for (const cell of row.content ?? []) {
      if (cell.type === "tableHeader") header = true;
      const content = await blocks(cell.content, ctx);
      const widths = cell.attrs?.colwidth as number[] | null | undefined;
      const width = widths?.every((w) => typeof w === "number") ? widths.reduce((a, b) => a + b, 0) : undefined;
      cells.push(
        new TableCell({
          children: content.length ? content : [new Paragraph("")],
          columnSpan: Number(cell.attrs?.colspan) || 1,
          rowSpan: Number(cell.attrs?.rowspan) || 1,
          ...(width ? { width: { size: Math.round(width * 15), type: WidthType.DXA } } : {}),
        }),
      );
    }
    rows.push(new TableRow({ children: cells, tableHeader: header }));
  }
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function headerFooterParagraph(text: string, align: string, pageNumbers: boolean): Paragraph {
  const children: (string | (typeof PageNumber)[keyof typeof PageNumber])[] = [];
  const pieces = text.split(/(\{PAGE\}|\{PAGES\})/);
  for (const piece of pieces) {
    if (piece === "{PAGE}") children.push(PageNumber.CURRENT);
    else if (piece === "{PAGES}") children.push(PageNumber.TOTAL_PAGES);
    else if (piece) children.push(piece);
  }
  if (pageNumbers) {
    if (children.length) children.push("    ");
    children.push("Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES);
  }
  return new Paragraph({ alignment: ALIGN[align] ?? AlignmentType.CENTER, children: [new TextRun({ children })] });
}

function pageProperties(page: PageSetup) {
  const paper = PAPER_SIZES[page.size];
  return {
    size: {
      width: paper.width,
      height: paper.height,
      orientation: page.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
    },
    margin: { ...page.margins, header: Math.round(page.margins.top / 2), footer: Math.round(page.margins.bottom / 2) },
  };
}

const LEVELS = (ordered: boolean) =>
  Array.from({ length: 9 }, (_, level) => ({
    level,
    format: ordered ? [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3]! : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : ["•", "◦", "▪"][level % 3]!,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));

/** Converts an OctoDocument into DOCX bytes. Also returns non-fatal warnings. */
export async function exportDocx(doc: OctoDocument, options: ExportOptions = {}): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const ctx: Ctx = { footnotes: {}, nextFootnote: 1, listInstance: 1, options, warnings: new Set() };
  const page = doc.page;

  // Split top-level content into sections at column blocks.
  const segments: { columns: number; nodes: JSONContent[] }[] = [];
  for (const node of doc.content.content ?? []) {
    if (node.type === "columnSection") {
      segments.push({ columns: Math.min(Math.max(Number(node.attrs?.count) || 2, 1), 4), nodes: node.content ?? [] });
    } else {
      const last = segments[segments.length - 1];
      if (last && last.columns === 1) last.nodes.push(node);
      else segments.push({ columns: 1, nodes: [node] });
    }
  }
  if (segments.length === 0) segments.push({ columns: 1, nodes: [] });

  const sections: ISectionOptions[] = [];
  for (const [i, segment] of segments.entries()) {
    const children = await blocks(segment.nodes, ctx);
    sections.push({
      properties: {
        ...(i > 0 ? { type: SectionType.CONTINUOUS } : {}),
        page: pageProperties(page),
        ...(segment.columns > 1 ? { column: { count: segment.columns, space: 720 } } : {}),
      },
      ...(i === 0
        ? {
            headers: page.header.text ? { default: new Header({ children: [headerFooterParagraph(page.header.text, page.header.align, false)] }) } : undefined,
            footers:
              page.footer.text || page.pageNumbers
                ? { default: new Footer({ children: [headerFooterParagraph(page.footer.text, page.footer.align, page.pageNumbers)] }) }
                : undefined,
          }
        : {}),
      children: children.length ? children : [new Paragraph("")],
    });
  }

  const document = new Document({
    creator: "OctoGenie Office",
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [
        { id: "Subtitle", name: "Subtitle", basedOn: "Normal", next: "Normal", run: { size: 30, color: "5A5A5A" }, paragraph: { spacing: { after: 160 } } },
        { id: "Quote", name: "Quote", basedOn: "Normal", next: "Normal", run: { italics: true, color: "404040" }, paragraph: { indent: { left: 720, right: 720 } } },
      ],
    },
    numbering: {
      config: [
        { reference: "bullets", levels: LEVELS(false) },
        { reference: "ordered", levels: LEVELS(true) },
      ],
    },
    footnotes: ctx.footnotes,
    sections,
  });

  const raw = new Uint8Array(await Packer.toArrayBuffer(document));
  return { bytes: await embedSource(raw, doc), warnings: [...ctx.warnings] };
}

/**
 * Stores the editor's own JSON inside the package with a hash of
 * word/document.xml, so documents saved here reopen losslessly. If another
 * program edits the file, the hash no longer matches and the XML is used.
 */
async function embedSource(bytes: Uint8Array, doc: OctoDocument): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  zip.file(EMBED_PATH, JSON.stringify({ hash: await sha256Hex(xml), doc }));
  const types = await zip.file("[Content_Types].xml")!.async("string");
  if (!types.includes('Extension="json"')) {
    zip.file("[Content_Types].xml", types.replace("<Types ", "<Types ").replace(/(<Types[^>]*>)/, '$1<Default Extension="json" ContentType="application/json"/>'));
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
