import type { JSONContent } from "@tiptap/core";
import { DEFAULT_PAGE, PAPER_SIZES, type OctoDocument, type PageSetup, type PaperSize } from "../model";

// ---------------------------------------------------------------------------
// Reading RTF

interface CharState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sup: boolean;
  sub: boolean;
  /** Half-points. */
  size: number;
  color: number;
  highlight: number;
  font: number;
}

interface ParaState {
  align: "left" | "center" | "right" | "justify";
  indent: number;
  firstLine: number;
  spaceBefore: number | null;
  spaceAfter: number | null;
  lineHeight: number | null;
  outline: number | null;
  inTable: boolean;
  list: "bullet" | "ordered" | null;
  borderBottom: boolean;
}

const defaultChar = (): CharState => ({ bold: false, italic: false, underline: false, strike: false, sup: false, sub: false, size: 24, color: 0, highlight: 0, font: 0 });
const defaultPara = (): ParaState => ({ align: "left", indent: 0, firstLine: 0, spaceBefore: null, spaceAfter: null, lineHeight: null, outline: null, inTable: false, list: null, borderBottom: false });

const SKIP_DESTINATIONS = new Set(["fonttbl", "colortbl", "stylesheet", "info", "listtable", "listoverridetable", "rsidtbl", "generator", "xmlnstbl", "themedata", "colorschememapping", "latentstyles", "datastore", "mmathPr", "pgdsctbl", "footnote", "headerl", "headerr", "headerf", "footerl", "footerr", "footerf", "fldinst", "bkmkstart", "bkmkend", "pntext", "listtext", "pntxta", "pntxtb", "object", "objdata", "nonshppict", "shp"]);

interface Group {
  char: CharState;
  skip: boolean;
  destination: string | null;
  uc: number;
}

export interface RtfResult {
  doc: OctoDocument;
  warnings: string[];
}

/** Parses the common subset of RTF written by Word, WordPad, TextEdit and LibreOffice. */
export function rtfToDocument(rtf: string): RtfResult {
  if (!rtf.trimStart().startsWith("{\\rtf")) throw new Error("This file is not RTF.");
  const warnings = new Set<string>();
  const fonts = new Map<number, string>();
  const colors: (string | null)[] = [];
  const page: PageSetup = structuredClone(DEFAULT_PAGE);
  let paperW = 0;
  let paperH = 0;
  let landscape = false;

  const blocks: JSONContent[] = [];
  let runs: JSONContent[] = [];
  let para = defaultPara();
  let listMarker: string | null = null;
  // Table assembly.
  let tableRows: JSONContent[][][] = [];
  let currentRow: JSONContent[][] = [];
  let cellBlocks: JSONContent[] = [];
  // Special destinations captured as text.
  let headerText = "";
  let footerText = "";
  let fontName = "";
  let colorParts: [number, number, number] = [0, 0, 0];
  let colorSet = false;
  let pictHex = "";
  let pictType: "png" | "jpeg" | null = null;
  let pictSize: [number, number] = [0, 0];
  let fieldIsPage: "PAGE" | "NUMPAGES" | null = null;
  // Size set at the top level before any text is the document default, not formatting.
  let baseSize = 24;

  const stack: Group[] = [];
  let group: Group = { char: defaultChar(), skip: false, destination: null, uc: 1 };
  let pendingSkip = 0;

  const marksOf = (c: CharState): JSONContent["marks"] => {
    const marks: NonNullable<JSONContent["marks"]> = [];
    if (c.bold) marks.push({ type: "bold" });
    if (c.italic) marks.push({ type: "italic" });
    if (c.underline) marks.push({ type: "underline" });
    if (c.strike) marks.push({ type: "strike" });
    if (c.sup) marks.push({ type: "superscript" });
    if (c.sub) marks.push({ type: "subscript" });
    const style: Record<string, string> = {};
    const color = colors[c.color];
    const sizeIsDefault = c.size === baseSize;
    if (c.color && color && color !== "#000000") style.color = color;
    if (!sizeIsDefault) style.fontSize = `${c.size / 2}pt`;
    const font = fonts.get(c.font);
    if (font && c.font !== 0) style.fontFamily = font;
    if (Object.keys(style).length) marks.push({ type: "textStyle", attrs: style });
    const hl = colors[c.highlight];
    if (c.highlight && hl) marks.push({ type: "highlight", attrs: { color: hl } });
    return marks;
  };

  const addText = (text: string) => {
    if (!text) return;
    if (group.destination === "header") return void (headerText += text);
    if (group.destination === "footer") return void (footerText += text);
    if (group.destination === "fonttbl") return void (fontName += text);
    if (group.destination === "pntext" || group.destination === "listtext") return void (listMarker = (listMarker ?? "") + text);
    if (group.skip) return;
    const marks = marksOf(group.char);
    const last = runs[runs.length - 1];
    if (last?.type === "text" && JSON.stringify(last.marks ?? []) === JSON.stringify(marks ?? [])) last.text += text;
    else runs.push({ type: "text", text, ...(marks?.length ? { marks } : {}) });
  };

  const paragraphNode = (): JSONContent => {
    const attrs: Record<string, unknown> = {};
    if (para.align !== "left") attrs.textAlign = para.align;
    if (para.indent && !para.list) attrs.indent = para.indent;
    if (para.firstLine && !para.list) attrs.firstLine = para.firstLine;
    if (para.spaceBefore !== null) attrs.spaceBefore = para.spaceBefore;
    if (para.spaceAfter !== null) attrs.spaceAfter = para.spaceAfter;
    if (para.lineHeight) attrs.lineHeight = para.lineHeight;
    if (para.borderBottom) attrs.border = "bottom";
    const content = runs.length ? { content: runs } : {};
    if (para.outline !== null && para.outline < 6) return { type: "heading", attrs: { ...attrs, level: para.outline + 1 }, ...content };
    return { type: "paragraph", attrs, ...content };
  };

  const pushBlock = (node: JSONContent, list: ParaState["list"]) => {
    if (list) {
      const type = list === "bullet" ? "bulletList" : "orderedList";
      const last = blocks[blocks.length - 1];
      const item = { type: "listItem", content: [node] };
      if (last?.type === type) last.content!.push(item);
      else blocks.push({ type, content: [item] });
    } else blocks.push(node);
  };

  const flushTable = () => {
    if (!tableRows.length) return;
    const width = Math.max(...tableRows.map((r) => r.length));
    blocks.push({
      type: "table",
      content: tableRows.map((row, ri) => ({
        type: "tableRow",
        content: Array.from({ length: width }, (_, ci) => ({
          type: ri === 0 ? "tableHeader" : "tableCell",
          attrs: { colspan: 1, rowspan: 1, colwidth: null },
          content: row[ci]?.length ? row[ci] : [{ type: "paragraph" }],
        })),
      })),
    });
    tableRows = [];
  };

  const endParagraph = () => {
    // Word marks list items with a "listtext"/"pntext" group holding the bullet or number.
    const marker = listMarker?.trim();
    const list: ParaState["list"] = marker ? (/^\d+[.)]?$|^[a-z][.)]$/i.test(marker) ? "ordered" : "bullet") : para.list;
    listMarker = null;
    // Writers also put the marker in the visible text for readers without list support; drop it.
    if (marker && runs[0]?.type === "text") {
      const first = runs[0];
      const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      first.text = (first.text ?? "").replace(new RegExp(`^\\s*${escaped}\\t?`), "");
      if (!first.text) runs.shift();
    }
    if (para.inTable) {
      cellBlocks.push(paragraphNode());
    } else {
      flushTable();
      pushBlock(paragraphNode(), list);
    }
    runs = [];
  };

  const control = (word: string, param: number | null) => {
    // Destinations.
    if (word === "*") {
      group.skip = true;
      group.destination = group.destination ?? "*";
      return;
    }
    if (SKIP_DESTINATIONS.has(word)) {
      group.destination = word;
      if (word !== "pntext" && word !== "listtext" && word !== "fonttbl") group.skip = true;
      if (word === "footnote") warnings.add("Footnotes were removed.");
      if (word === "object" || word === "shp") warnings.add("Embedded objects and drawings were removed.");
      return;
    }
    if (word === "header" || word === "footer") {
      group.destination = word;
      return;
    }
    if (word === "pict") {
      group.destination = "pict";
      group.skip = true;
      pictHex = "";
      pictType = null;
      pictSize = [0, 0];
      return;
    }
    if (group.destination === "pict") {
      if (word === "pngblip") pictType = "png";
      else if (word === "jpegblip") pictType = "jpeg";
      else if (word === "picwgoal" && param) pictSize[0] = param;
      else if (word === "pichgoal" && param) pictSize[1] = param;
      return;
    }
    if (group.destination === "colortbl") {
      if (word === "red") colorParts[0] = param ?? 0;
      else if (word === "green") colorParts[1] = param ?? 0;
      else if (word === "blue") colorParts[2] = param ?? 0;
      colorSet = true;
      return;
    }
    if (group.destination === "fonttbl") {
      if (word === "f") {
        fontName = "";
        group.char.font = param ?? 0;
      }
      return;
    }
    const c = group.char;
    switch (word) {
      case "par":
        return endParagraph();
      case "line":
        return void runs.push({ type: "hardBreak" });
      case "tab":
        return addText("\t");
      case "page":
        endParagraph();
        return void blocks.push({ type: "pageBreak" });
      case "pard":
        para = defaultPara();
        return;
      case "plain":
        group.char = { ...defaultChar() };
        return;
      case "b":
        c.bold = param !== 0;
        return;
      case "i":
        c.italic = param !== 0;
        return;
      case "ul":
        c.underline = param !== 0;
        return;
      case "ulnone":
        c.underline = false;
        return;
      case "strike":
        c.strike = param !== 0;
        return;
      case "super":
        c.sup = true;
        c.sub = false;
        return;
      case "sub":
        c.sub = true;
        c.sup = false;
        return;
      case "nosupersub":
        c.sup = c.sub = false;
        return;
      case "fs":
        c.size = param ?? 24;
        if (stack.length <= 1 && !blocks.length && !runs.length) baseSize = c.size;
        return;
      case "field":
        fieldIsPage = null;
        return;
      case "fldrslt":
        // The cached result of a page-number field is replaced by the live field.
        if (fieldIsPage) {
          group.destination = "fldrslt-skip";
          group.skip = true;
        }
        return;
      case "cf":
        c.color = param ?? 0;
        return;
      case "highlight":
      case "cb":
        c.highlight = param ?? 0;
        return;
      case "f":
        c.font = param ?? 0;
        return;
      case "qc":
        para.align = "center";
        return;
      case "qr":
        para.align = "right";
        return;
      case "qj":
        para.align = "justify";
        return;
      case "ql":
        para.align = "left";
        return;
      case "li":
        para.indent = param ?? 0;
        return;
      case "fi":
        para.firstLine = param ?? 0;
        return;
      case "sb":
        para.spaceBefore = param ?? 0;
        return;
      case "sa":
        para.spaceAfter = param ?? 0;
        return;
      case "sl":
        if (param && param > 0) para.lineHeight = Math.round((param / 240) * 100) / 100;
        return;
      case "outlinelevel":
        para.outline = param ?? 0;
        return;
      case "intbl":
        para.inTable = true;
        return;
      case "brdrb":
        para.borderBottom = true;
        return;
      case "cell":
        if (runs.length || para.inTable) cellBlocks.push(paragraphNode());
        runs = [];
        currentRow.push(cellBlocks);
        cellBlocks = [];
        return;
      case "row":
        tableRows.push(currentRow);
        currentRow = [];
        return;
      case "trowd":
        currentRow = [];
        return;
      case "paperw":
        paperW = param ?? 0;
        return;
      case "paperh":
        paperH = param ?? 0;
        return;
      case "landscape":
        landscape = true;
        return;
      case "margl":
        page.margins.left = param ?? page.margins.left;
        return;
      case "margr":
        page.margins.right = param ?? page.margins.right;
        return;
      case "margt":
        page.margins.top = param ?? page.margins.top;
        return;
      case "margb":
        page.margins.bottom = param ?? page.margins.bottom;
        return;
      case "uc":
        group.uc = param ?? 1;
        return;
      case "u": {
        let code = param ?? 63;
        if (code < 0) code += 65536;
        addText(String.fromCharCode(code));
        pendingSkip = group.uc;
        return;
      }
      case "emdash":
        return addText("—");
      case "endash":
        return addText("–");
      case "bullet":
        return addText("•");
      case "lquote":
        return addText("‘");
      case "rquote":
        return addText("’");
      case "ldblquote":
        return addText("“");
      case "rdblquote":
        return addText("”");
      case "chpgn":
        if (group.destination === "header") headerText += "{PAGE}";
        else if (group.destination === "footer") footerText += "{PAGE}";
        return;
    }
  };

  let i = 0;
  const n = rtf.length;
  let text = "";
  const flushText = () => {
    if (text) {
      if (group.destination === "pict") pictHex += text.replace(/[^0-9a-f]/gi, "");
      else if (group.destination === "fldinst") fieldIsPage = /\bNUMPAGES\b/.test(text) ? "NUMPAGES" : /\bPAGE\b/.test(text) ? "PAGE" : fieldIsPage;
      else addText(text);
      text = "";
    }
  };
  while (i < n) {
    const ch = rtf[i]!;
    if (ch === "{") {
      flushText();
      stack.push(group);
      group = { char: { ...group.char }, skip: group.skip, destination: group.destination, uc: group.uc };
      i++;
      continue;
    }
    if (ch === "}") {
      flushText();
      const closing = group;
      if (closing.destination === "fonttbl" && fontName) {
        fonts.set(closing.char.font, fontName.replace(/;\s*$/, "").trim());
        fontName = "";
      }
      if (closing.destination === "pict" && pictType && pictHex && stack[stack.length - 1]?.destination !== "pict") {
        const bytes = new Uint8Array(pictHex.length / 2);
        for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(pictHex.slice(k * 2, k * 2 + 2), 16);
        let binary = "";
        for (let k = 0; k < bytes.length; k += 0x8000) binary += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
        const width = pictSize[0] ? Math.round(pictSize[0] / 15) : null;
        const height = pictSize[1] ? Math.round(pictSize[1] / 15) : null;
        if (runs.length) endParagraph();
        blocks.push({ type: "image", attrs: { src: `data:image/${pictType};base64,${btoa(binary)}`, width, height, alt: null } });
        pictHex = "";
      } else if (closing.destination === "pict" && !pictType && stack[stack.length - 1]?.destination !== "pict") {
        warnings.add("Some pictures use formats that aren't supported (for example WMF or EMF) and were removed.");
      }
      if (closing.destination === "fldinst" && fieldIsPage) {
        const parent = stack[stack.length - 1];
        if (parent?.destination === "header") headerText += `{${fieldIsPage === "PAGE" ? "PAGE" : "PAGES"}}`;
        else if (parent?.destination === "footer") footerText += `{${fieldIsPage === "PAGE" ? "PAGE" : "PAGES"}}`;
      }
      group = stack.pop() ?? group;
      i++;
      continue;
    }
    if (ch === "\\") {
      flushText();
      const next = rtf[i + 1] ?? "";
      if (next === "'") {
        const code = parseInt(rtf.slice(i + 2, i + 4), 16);
        i += 4;
        if (pendingSkip > 0) {
          pendingSkip--;
          continue;
        }
        if (group.destination === "colortbl") continue;
        // Windows-1252 for the common range.
        addText(new TextDecoder("windows-1252").decode(new Uint8Array([code])));
        continue;
      }
      if (next === "\\" || next === "{" || next === "}") {
        text += next;
        i += 2;
        continue;
      }
      if (next === "~") {
        text += "\u00a0";
        i += 2;
        continue;
      }
      if (next === "-" || next === "_") {
        i += 2;
        continue;
      }
      if (next === "*") {
        control("*", null);
        i += 2;
        continue;
      }
      if (next === "\n" || next === "\r") {
        endParagraph();
        i += 2;
        continue;
      }
      const m = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(rtf.slice(i + 1, i + 50));
      if (m) {
        control(m[1]!, m[2] !== undefined ? Number(m[2]) : null);
        i += 1 + m[0].length;
      } else i += 2;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      i++;
      continue;
    }
    if (group.destination === "colortbl" && ch === ";") {
      colors.push(colorSet ? `#${colorParts.map((v) => v.toString(16).padStart(2, "0")).join("")}` : null);
      colorParts = [0, 0, 0];
      colorSet = false;
      i++;
      continue;
    }
    if (pendingSkip > 0) {
      pendingSkip--;
      i++;
      continue;
    }
    text += ch;
    i++;
  }
  flushText();
  if (runs.length) endParagraph();
  flushTable();

  if (paperW && paperH) {
    const isLandscape = landscape || paperW > paperH;
    const [w, h] = isLandscape ? [paperH, paperW] : [paperW, paperH];
    page.orientation = isLandscape ? "landscape" : "portrait";
    const match = (Object.entries(PAPER_SIZES) as [PaperSize, { width: number; height: number }][]).find(([, s]) => Math.abs(s.width - w) < 60 && Math.abs(s.height - h) < 60);
    page.size = match ? match[0] : "letter";
  }
  const pageNumbers = /Page \{PAGE\} of \{PAGES\}\s*$/;
  page.header = { text: headerText.trim(), align: "center" };
  if (pageNumbers.test(footerText.trim())) {
    page.pageNumbers = true;
    page.footer = { text: footerText.trim().replace(pageNumbers, "").trim(), align: "center" };
  } else page.footer = { text: footerText.trim(), align: "center" };

  return { doc: { version: 1, page, content: { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] } }, warnings: [...warnings] };
}

// ---------------------------------------------------------------------------
// Writing RTF

function escapeRtf(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || ch === "{" || ch === "}") out += `\\${ch}`;
    else if (ch === "\t") out += "\\tab ";
    else if (ch === "\n") out += "\\line ";
    else if (code < 128) out += ch;
    else {
      // \uN uses a signed 16-bit value, followed by a one-character fallback.
      for (let k = 0; k < ch.length; k++) {
        const unit = ch.charCodeAt(k);
        out += `\\u${unit > 32767 ? unit - 65536 : unit}?`;
      }
    }
  }
  return out;
}

class Tables {
  fonts = ["Calibri"];
  colors: string[] = [];
  font(name: string): number {
    const clean = name.split(",")[0]!.replace(/["']/g, "").trim();
    let idx = this.fonts.indexOf(clean);
    if (idx < 0) idx = this.fonts.push(clean) - 1;
    return idx;
  }
  color(hex: string): number {
    const c = hex.toLowerCase();
    let idx = this.colors.indexOf(c);
    if (idx < 0) idx = this.colors.push(c) - 1;
    return idx + 1;
  }
}

function inline(nodes: JSONContent[] | undefined, t: Tables, warnings: Set<string>): string {
  let out = "";
  for (let node of nodes ?? []) {
    if (node.type === "text") {
      let codes = "";
      for (const mark of node.marks ?? []) {
        const a = mark.attrs ?? {};
        if (mark.type === "bold") codes += "\\b";
        if (mark.type === "italic") codes += "\\i";
        if (mark.type === "underline") codes += "\\ul";
        if (mark.type === "strike") codes += "\\strike";
        if (mark.type === "superscript") codes += "\\super";
        if (mark.type === "subscript") codes += "\\sub";
        if (mark.type === "highlight" && typeof a.color === "string") codes += `\\highlight${t.color(a.color)}`;
        if (mark.type === "textStyle") {
          if (typeof a.color === "string" && /^#[0-9a-f]{6}$/i.test(a.color)) codes += `\\cf${t.color(a.color)}`;
          const size = typeof a.fontSize === "string" ? parseFloat(a.fontSize) : NaN;
          if (Number.isFinite(size)) codes += `\\fs${Math.round(size * 2)}`;
          if (typeof a.fontFamily === "string" && a.fontFamily) codes += `\\f${t.font(a.fontFamily)}`;
        }
        if (mark.type === "link" && typeof a.href === "string") {
          out += `{\\field{\\*\\fldinst HYPERLINK "${escapeRtf(a.href)}"}{\\fldrslt{\\ul${codes ? codes : ""} ${escapeRtf(node.text ?? "")}}}}`;
          codes = "";
          node = { ...node, text: "" };
        }
      }
      if (node.text) out += codes ? `{${codes} ${escapeRtf(node.text)}}` : escapeRtf(node.text);
    } else if (node.type === "hardBreak") out += "\\line ";
    else if (node.type === "footnote") out += `{\\super\\chftn}{\\footnote\\pard\\plain{\\super\\chftn} ${escapeRtf(String(node.attrs?.text ?? ""))}}`;
    else if (node.type === "inlineMath") {
      out += `{\\i ${escapeRtf(String(node.attrs?.latex ?? ""))}}`;
      warnings.add("Equations are written as plain text in RTF.");
    }
  }
  return out;
}

function paraCodes(attrs: Record<string, unknown> | undefined): string {
  const a = attrs ?? {};
  let codes = "\\pard";
  if (a.textAlign === "center") codes += "\\qc";
  if (a.textAlign === "right") codes += "\\qr";
  if (a.textAlign === "justify") codes += "\\qj";
  if (typeof a.indent === "number") codes += `\\li${a.indent}`;
  if (typeof a.firstLine === "number") codes += `\\fi${a.firstLine}`;
  if (typeof a.spaceBefore === "number") codes += `\\sb${a.spaceBefore}`;
  codes += `\\sa${typeof a.spaceAfter === "number" ? a.spaceAfter : 160}`;
  if (typeof a.lineHeight === "number") codes += `\\sl${Math.round(a.lineHeight * 240)}\\slmult1`;
  if (a.border === "bottom" || a.border === "box") codes += "\\brdrb\\brdrs\\brdrw10";
  return codes;
}

const HEADING_SIZES = [32, 26, 24, 22, 22, 22];

function blocks(nodes: JSONContent[] | undefined, t: Tables, warnings: Set<string>, contentWidth: number): string {
  let out = "";
  for (const node of nodes ?? []) {
    switch (node.type) {
      case "paragraph":
        out += `${paraCodes(node.attrs)} ${node.attrs?.styleName === "title" ? `{\\fs56 ${inline(node.content, t, warnings)}}` : inline(node.content, t, warnings)}\\par\n`;
        break;
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
        out += `${paraCodes(node.attrs)}\\outlinelevel${level - 1}\\sb240 {\\b\\fs${HEADING_SIZES[level - 1]} ${inline(node.content, t, warnings)}}\\par\n`;
        break;
      }
      case "bulletList":
      case "orderedList": {
        let n = Number(node.attrs?.start ?? 1);
        for (const item of node.content ?? []) {
          for (const [k, child] of (item.content ?? []).entries()) {
            if (child.type === "paragraph" && k === 0) {
              const marker = node.type === "bulletList" ? "\\bullet" : `${n++}.`;
              out += `\\pard\\fi-360\\li720\\sa80{\\listtext ${marker}\\tab}${marker}\\tab ${inline(child.content, t, warnings)}\\par\n`;
            } else out += blocks([child], t, warnings, contentWidth);
          }
        }
        break;
      }
      case "blockquote":
        out += blocks(
          node.content?.map((c) => ({ ...c, attrs: { ...c.attrs, indent: 720 } })),
          t,
          warnings,
          contentWidth,
        ).replace(/\\pard/g, "\\pard\\i");
        break;
      case "pageBreak":
        out += "\\page\n";
        break;
      case "horizontalRule":
        out += "\\pard\\brdrb\\brdrs\\brdrw10\\sa160\\par\n";
        break;
      case "blockMath":
        out += `\\pard\\qc {\\i ${escapeRtf(String(node.attrs?.latex ?? ""))}}\\par\n`;
        warnings.add("Equations are written as plain text in RTF.");
        break;
      case "image": {
        const m = /^data:image\/(png|jpeg);base64,(.*)$/i.exec(String(node.attrs?.src ?? ""));
        if (!m) {
          warnings.add("Some images use a format RTF can't hold and were left out.");
          break;
        }
        const bin = atob(m[2]!);
        let hex = "";
        for (let k = 0; k < bin.length; k++) hex += bin.charCodeAt(k).toString(16).padStart(2, "0") + ((k + 1) % 64 === 0 ? "\n" : "");
        const w = Math.round((Number(node.attrs?.width) || 400) * 15);
        const h = Math.round((Number(node.attrs?.height) || 300) * 15);
        out += `\\pard{\\pict\\${m[1]!.toLowerCase() === "png" ? "pngblip" : "jpegblip"}\\picwgoal${w}\\pichgoal${h}\n${hex}}\\par\n`;
        break;
      }
      case "table": {
        for (const row of node.content ?? []) {
          const cells = row.content ?? [];
          const width = Math.floor(contentWidth / Math.max(cells.length, 1));
          out += "\\trowd\\trgaph108" + cells.map((_, ci) => `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx${width * (ci + 1)}`).join("") + "\n";
          for (const cell of cells) {
            const parts = (cell.content ?? []).map((p) => `\\pard\\intbl ${cell.type === "tableHeader" ? `{\\b ${inline(p.content, t, warnings)}}` : inline(p.content, t, warnings)}`);
            out += `${parts.join("\\par ")}\\cell\n`;
          }
          out += "\\row\n";
        }
        out += "\\pard\n";
        break;
      }
      case "columnSection":
        out += blocks(node.content, t, warnings, contentWidth);
        warnings.add("Columns aren't kept in RTF.");
        break;
      case "shape":
        warnings.add("Shapes aren't kept in RTF.");
        break;
      case "tableOfContents":
        warnings.add("The table of contents is written as a heading in RTF.");
        out += "\\pard{\\b\\fs26 Contents}\\par\n";
        break;
    }
  }
  return out;
}

function headerFooter(text: string, pageNumbers: boolean): string {
  // Fields go in after escaping, replacing the escaped {PAGE}/{PAGES} placeholders.
  let body = escapeRtf(text);
  body = body.replace(/\\\{PAGE\\\}/g, "{\\field{\\*\\fldinst PAGE}}").replace(/\\\{PAGES\\\}/g, "{\\field{\\*\\fldinst NUMPAGES}}");
  if (pageNumbers) body += `${body ? "    " : ""}Page {\\field{\\*\\fldinst PAGE}} of {\\field{\\*\\fldinst NUMPAGES}}`;
  return body;
}

/** Writes an editor document as RTF, reporting anything RTF can't hold. */
export function documentToRtf(doc: OctoDocument): { rtf: string; warnings: string[] } {
  const t = new Tables();
  const warnings = new Set<string>();
  const paper = PAPER_SIZES[doc.page.size];
  const [w, h] = doc.page.orientation === "portrait" ? [paper.width, paper.height] : [paper.height, paper.width];
  const contentWidth = w - doc.page.margins.left - doc.page.margins.right;
  const body = blocks(doc.content.content, t, warnings, contentWidth);
  const fontTable = `{\\fonttbl${t.fonts.map((f, i) => `{\\f${i}\\fnil ${f};}`).join("")}}`;
  const colorTable = `{\\colortbl ;${t.colors.map((c) => `\\red${parseInt(c.slice(1, 3), 16)}\\green${parseInt(c.slice(3, 5), 16)}\\blue${parseInt(c.slice(5, 7), 16)};`).join("")}}`;
  const m = doc.page.margins;
  const header = doc.page.header.text ? `{\\header\\pard\\qc ${headerFooter(doc.page.header.text, false)}\\par}` : "";
  const footer = doc.page.footer.text || doc.page.pageNumbers ? `{\\footer\\pard\\qc ${headerFooter(doc.page.footer.text, doc.page.pageNumbers)}\\par}` : "";
  const rtf = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1${fontTable}${colorTable}\n\\paperw${w}\\paperh${h}${doc.page.orientation === "landscape" ? "\\landscape" : ""}\\margl${m.left}\\margr${m.right}\\margt${m.top}\\margb${m.bottom}\\viewkind4\\fs22\n${header}${footer}\n${body}}`;
  return { rtf, warnings: [...warnings] };
}
