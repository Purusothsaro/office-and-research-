import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "@cantoo/pdf-lib";
import type { JSONContent } from "@tiptap/core";
import type { Report, ReportEntry } from "../model/report";

const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, ...(marks ? { marks } : {}) });
const para = (content: JSONContent[], attrs?: Record<string, unknown>): JSONContent => ({ type: "paragraph", ...(attrs ? { attrs } : {}), content: content.filter((c) => c.text) });
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

function caseLines(r: Report): [string, string][] {
  const p = r.project;
  if (!p) return [];
  return (
    [
      ["Case", p.caseName],
      ["Reference", p.reference],
      ["Court", p.court],
      ["Jurisdiction", p.jurisdiction],
    ] as [string, string][]
  ).filter(([, v]) => v.trim());
}

function relationLines(e: ReportEntry): [string, string[]][] {
  return ([["Supported by / supports", e.supports], ["Contradicted by / contradicts", e.contradicts], ["References", e.references]] as [string, string[]][]).filter(([, v]) => v.length);
}

/** The report as editor JSON, written to DOCX by the document package. */
export function reportDocument(r: Report): JSONContent {
  const content: JSONContent[] = [para([t(r.title)], { styleName: "title" })];
  for (const [k, v] of caseLines(r)) content.push(para([t(`${k}: `, [{ type: "bold" }]), t(v)]));
  if (r.project?.description.trim()) content.push(para([t(r.project.description.trim(), [{ type: "italic" }])]));
  for (const s of r.sections) {
    content.push({ type: "heading", attrs: { level: 1 }, content: [t(s.title)] });
    if (s.subtitle) content.push(para([t(s.subtitle, [{ type: "italic" }])]));
    for (const e of s.entries) {
      if (e.kind === "note") content.push(para([t("Note: ", [{ type: "bold" }]), t(flat(e.text))]));
      else {
        content.push(para([t(`“${flat(e.quote ?? e.text)}”`, [{ type: "italic" }])], { indent: 720 }));
        content.push(para([t(`— ${e.citation}${e.ocr ? " (text recognised by OCR)" : ""}`)], { indent: 720 }));
        if (e.edited && flat(e.text)) content.push(para([t("Card wording: ", [{ type: "bold" }]), t(flat(e.text))], { indent: 720 }));
        if (e.warning) content.push(para([t("Check source: ", [{ type: "bold" }]), t(e.warning)], { indent: 720 }));
      }
      const meta = [e.status ? `Status: ${e.status}` : "", e.tags.length ? `Tags: ${e.tags.join(", ")}` : ""].filter(Boolean).join(" · ");
      if (meta) content.push(para([t(meta, [{ type: "italic" }])], { indent: 720 }));
      for (const [label, items] of relationLines(e)) content.push(para([t(`${label}: `, [{ type: "bold" }]), t(items.join("; "))], { indent: 720 }));
      content.push(para([]));
    }
  }
  if (r.sources.length) {
    content.push({ type: "heading", attrs: { level: 1 }, content: [t("Source documents")] });
    for (const s of r.sources) content.push(para([t(`${s.name} — ${s.format}, ${s.pages} page${s.pages === 1 ? "" : "s"}${s.textMode === "ocr" ? ", text recognised by OCR" : s.textMode === "converted" ? ", converted for reading" : ""}`)]));
  }
  content.push(para([t(r.disclaimer, [{ type: "italic" }])]));
  return { type: "doc", content };
}

export async function reportToDocx(r: Report): Promise<Uint8Array> {
  const { exportDocx, DEFAULT_PAGE } = await import("@octo/editor-document");
  return (await exportDocx({ version: 1, page: structuredClone(DEFAULT_PAGE), content: reportDocument(r) })).bytes;
}

/** Keeps characters the standard PDF fonts can encode. */
function encodable(font: PDFFont, value: string): string {
  let out = "";
  for (const ch of flat(value)) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** The report as a PDF (US Letter, 1" margins, page numbers). */
export async function reportToPdf(r: Report): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(r.title);
  pdf.setCreator("OctoGenie Research");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const W = 612;
  const H = 792;
  const M = 72;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.38, 0.4, 0.45);
  const accent = rgb(0.32, 0.16, 0.62);
  const write = (value: string, font: PDFFont, size: number, indent = 0, color: RGB = ink, after = 4) => {
    const words = encodable(font, value).split(" ");
    const max = W - 2 * M - indent;
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    for (const l of lines) {
      if (y < M + size) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      page.drawText(l, { x: M + indent, y: y - size, size, font, color });
      y -= size * 1.35;
    }
    y -= after;
  };
  write(r.title, bold, 20, 0, rgb(0.12, 0.16, 0.3), 8);
  for (const [k, v] of caseLines(r)) write(`${k}: ${v}`, regular, 10.5, 0, muted, 1);
  if (r.project?.description.trim()) write(r.project.description, italic, 10.5, 0, muted, 4);
  y -= 8;
  for (const s of r.sections) {
    write(s.title, bold, 14, 0, accent, s.subtitle ? 1 : 6);
    if (s.subtitle) write(s.subtitle, italic, 9.5, 0, muted, 6);
    for (const e of s.entries) {
      if (e.kind === "note") write(`Note: ${e.text}`, regular, 11, 0, ink, 3);
      else {
        write(`“${e.quote ?? e.text}”`, italic, 11, 16, ink, 2);
        write(`— ${e.citation}${e.ocr ? " (text recognised by OCR)" : ""}`, regular, 9.5, 16, muted, 2);
        if (e.edited && flat(e.text)) write(`Card wording: ${e.text}`, regular, 10, 16, ink, 2);
        if (e.warning) write(`Check source: ${e.warning}`, bold, 9.5, 16, rgb(0.7, 0.1, 0.1), 2);
      }
      const meta = [e.status ? `Status: ${e.status}` : "", e.tags.length ? `Tags: ${e.tags.join(", ")}` : ""].filter(Boolean).join(" · ");
      if (meta) write(meta, italic, 9, 16, muted, 2);
      for (const [label, items] of relationLines(e)) write(`${label}: ${items.join("; ")}`, regular, 9.5, 16, ink, 2);
      y -= 8;
    }
  }
  if (r.sources.length) {
    write("Source documents", bold, 14, 0, accent, 6);
    for (const s of r.sources) write(`${s.name} — ${s.format}, ${s.pages} page${s.pages === 1 ? "" : "s"}${s.textMode === "ocr" ? ", text recognised by OCR" : s.textMode === "converted" ? ", converted for reading" : ""}`, regular, 10, 0, ink, 2);
    y -= 8;
  }
  write(r.disclaimer, italic, 9, 0, muted, 0);
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W / 2 - 28, y: 36, size: 8.5, font: regular, color: muted }));
  return pdf.save();
}
