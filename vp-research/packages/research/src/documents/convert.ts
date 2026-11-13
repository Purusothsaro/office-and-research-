import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import type { JSONContent } from "@tiptap/core";

/** A styled piece of text inside a block. */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
}

export interface Block {
  kind: "heading" | "paragraph" | "list-item" | "quote" | "code" | "table-row" | "rule";
  level?: number;
  /** List marker, e.g. "•" or "3." */
  marker?: string;
  depth?: number;
  runs: Run[];
}

export interface ConvertResult {
  pdf: Uint8Array;
  pageCount: number;
  warnings: string[];
}

// ---- Source formats to blocks ----------------------------------------------

/** Plain text: blank lines separate paragraphs; single line breaks are kept. */
export function textToBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = para.split("\n");
    for (const line of lines) blocks.push({ kind: "paragraph", runs: [{ text: line.replace(/\t/g, "    ") }], ...(lines.length > 1 ? { level: 1 } : {}) });
    blocks.push({ kind: "paragraph", runs: [] });
  }
  return blocks;
}

const runsOf = (node: JSONContent, inherited: Omit<Run, "text"> = {}): Run[] => {
  if (node.type === "text") {
    const marks = new Set((node.marks ?? []).map((m) => m.type));
    return [{ text: node.text ?? "", ...inherited, ...(marks.has("bold") ? { bold: true } : {}), ...(marks.has("italic") ? { italic: true } : {}), ...(marks.has("code") ? { mono: true } : {}) }];
  }
  if (node.type === "hardBreak") return [{ text: "\n" }];
  if (node.type === "mathematics" || node.type === "inlineMath") return [{ text: String(node.attrs?.latex ?? ""), mono: true }];
  return (node.content ?? []).flatMap((c) => runsOf(c, inherited));
};

/** Editor document JSON (from DOCX or Markdown import) to blocks. */
export function editorJsonToBlocks(doc: JSONContent): Block[] {
  const out: Block[] = [];
  const walk = (node: JSONContent, depth: number, list?: { ordered: boolean; n: number }) => {
    switch (node.type) {
      case "heading":
        out.push({ kind: "heading", level: Number(node.attrs?.level ?? 1), runs: runsOf(node) });
        return;
      case "paragraph":
        out.push({ kind: node.attrs?.styleName === "title" ? "heading" : "paragraph", ...(node.attrs?.styleName === "title" ? { level: 0 } : {}), runs: runsOf(node) });
        return;
      case "blockquote":
        for (const c of node.content ?? []) out.push({ kind: "quote", runs: runsOf(c) });
        return;
      case "codeBlock":
        for (const line of runsOf(node).map((r) => r.text).join("").split("\n")) out.push({ kind: "code", runs: [{ text: line, mono: true }] });
        return;
      case "horizontalRule":
        out.push({ kind: "rule", runs: [] });
        return;
      case "bulletList":
      case "orderedList":
      case "taskList": {
        const ordered = node.type === "orderedList";
        let n = Number(node.attrs?.start ?? 1);
        for (const item of node.content ?? []) walk(item, depth + 1, { ordered, n: n++ });
        return;
      }
      case "listItem":
      case "taskItem": {
        let first = true;
        for (const c of node.content ?? []) {
          if (c.type === "paragraph" && first) {
            const checked = node.type === "taskItem" ? (node.attrs?.checked ? "☒" : "☐") : null;
            out.push({ kind: "list-item", depth, marker: checked ?? (list?.ordered ? `${list.n}.` : "•"), runs: runsOf(c) });
            first = false;
          } else walk(c, depth);
        }
        return;
      }
      case "table":
        for (const row of node.content ?? []) {
          const cells = (row.content ?? []).map((cell) => runsOf(cell).map((r) => r.text).join(" ").trim());
          out.push({ kind: "table-row", runs: [{ text: cells.join("  |  "), bold: (row.content ?? []).some((c) => c.type === "tableHeader") }] });
        }
        out.push({ kind: "paragraph", runs: [] });
        return;
      case "image":
        out.push({ kind: "paragraph", runs: [{ text: `[Image${node.attrs?.alt ? `: ${node.attrs.alt}` : ""}]`, italic: true }] });
        return;
      default:
        for (const c of node.content ?? []) walk(c, depth, list);
    }
  };
  walk(doc, 0);
  return out;
}

// ---- Layout ------------------------------------------------------------------

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}

const W = 612;
const H = 792;
const M = 72;

/**
 * Lays blocks out as US Letter pages with real (selectable, searchable) text.
 * Characters the standard PDF fonts can't encode are replaced with "?" and reported.
 */
export async function blocksToPdf(blocks: Block[], title: string): Promise<ConvertResult> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("OctoGenie Research (converted copy)");
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
  let replaced = 0;
  const encodable = new Map<string, boolean>();
  const safe = (font: PDFFont, s: string) => {
    let out = "";
    for (const ch of s) {
      const key = `${font.name}:${ch}`;
      let ok = encodable.get(key);
      if (ok === undefined) {
        try {
          font.encodeText(ch);
          ok = true;
        } catch {
          ok = false;
        }
        encodable.set(key, ok);
      }
      if (ok) out += ch;
      else {
        out += "?";
        replaced++;
      }
    }
    return out;
  };
  const fontFor = (r: Run, forceBold = false) => (r.mono ? fonts.mono : (r.bold || forceBold) && r.italic ? fonts.boldItalic : r.bold || forceBold ? fonts.bold : r.italic ? fonts.italic : fonts.regular);

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };

  for (const block of blocks) {
    if (block.kind === "rule") {
      if (y < M + 20) newPage();
      page.drawLine({ start: { x: M, y: y - 8 }, end: { x: W - M, y: y - 8 }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });
      y -= 20;
      continue;
    }
    const heading = block.kind === "heading";
    const size = heading ? [22, 18, 15, 13, 12, 12, 12][block.level ?? 1] ?? 12 : block.kind === "code" ? 9.5 : 11.5;
    const lead = size * 1.35;
    const indent = block.kind === "list-item" ? 18 * (block.depth ?? 1) : block.kind === "quote" ? 24 : 0;
    const before = heading ? size * 0.6 : 0;
    const after = heading ? 6 : block.kind === "list-item" || block.kind === "code" || block.kind === "table-row" || block.level === 1 ? 2 : 6;
    if (!block.runs.length || !block.runs.some((r) => r.text.trim())) {
      y -= block.runs.length || block.kind === "paragraph" ? lead * 0.5 : 0;
      continue;
    }
    y -= before;
    // Words with their fonts, wrapped to the text width.
    const words: { text: string; font: PDFFont; space: boolean; br?: boolean }[] = [];
    for (const r of block.runs) {
      const font = fontFor(r, heading);
      const parts = r.text.split(/(\n| +)/);
      for (const part of parts) {
        if (part === "\n") words.push({ text: "", font, space: false, br: true });
        else if (/^ +$/.test(part)) {
          const last = words[words.length - 1];
          if (last) last.space = true;
        } else if (part) words.push({ text: safe(font, part), font, space: false });
      }
    }
    const max = W - 2 * M - indent;
    const lines: { text: string; font: PDFFont; x: number; space: boolean }[][] = [[]];
    let x = 0;
    for (const w of words) {
      if (w.br) {
        lines.push([]);
        x = 0;
        continue;
      }
      const width = w.font.widthOfTextAtSize(w.text, size);
      if (x + width > max && x > 0) {
        lines.push([]);
        x = 0;
      }
      lines[lines.length - 1]!.push({ text: w.text, font: w.font, x, space: w.space });
      x += width + (w.space ? w.font.widthOfTextAtSize(" ", size) : 0);
    }
    lines.forEach((line, i) => {
      if (y - size < M) newPage();
      if (i === 0 && block.marker) page.drawText(safe(fonts.regular, block.marker), { x: M + indent - 14, y: y - size, size, font: fonts.regular });
      if (block.kind === "quote") page.drawLine({ start: { x: M + 8, y: y + 2 }, end: { x: M + 8, y: y - lead + 2 }, thickness: 2, color: rgb(0.75, 0.75, 0.8) });
      // Consecutive words in one font are drawn together so text extraction keeps the spaces.
      let k = 0;
      while (k < line.length) {
        const start = line[k]!;
        let text = start.text;
        let j = k + 1;
        while (j < line.length && line[j]!.font === start.font) {
          text += `${line[j - 1]!.space ? " " : ""}${line[j]!.text}`;
          j++;
        }
        page.drawText(text, { x: M + indent + start.x, y: y - size, size, font: start.font, color: rgb(0.08, 0.08, 0.1) });
        k = j;
      }
      y -= lead;
    });
    y -= after;
  }
  const warnings = replaced ? [`${replaced} character${replaced === 1 ? "" : "s"} couldn't be shown in the converted copy and appear as “?”. The original file is unchanged.`] : [];
  return { pdf: await pdf.save(), pageCount: pdf.getPageCount(), warnings };
}
