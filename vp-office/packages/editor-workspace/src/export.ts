import { DEFAULT_PAGE, exportDocx, type OctoDocument } from "@octo/editor-document";
import type { JSONContent } from "@tiptap/core";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import { citation, outline, passageCitation, type Workspace } from "./model";

const text = (t: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text: t, ...(marks ? { marks } : {}) });

/** The workspace as an issue outline: one heading per group, quotes with citations, notes as text. */
export function outlineDocument(ws: Workspace, title: string): OctoDocument {
  const content: JSONContent[] = [{ type: "paragraph", attrs: { styleName: "title" }, content: [text(title)] }];
  const docs = ws.documents.map((d) => d.name).join("; ");
  if (docs) content.push({ type: "paragraph", content: [text("Sources: ", [{ type: "bold" }]), text(docs)] });
  for (const section of outline(ws)) {
    content.push({ type: "heading", attrs: { level: 1 }, content: [text(section.title)] });
    if (!section.items.length) content.push({ type: "paragraph", content: [text("(No points yet.)", [{ type: "italic" }])] });
    for (const item of section.items) {
      if (item.type === "excerpt") {
        content.push({
          type: "paragraph",
          attrs: { indent: 720, border: null },
          content: [text(`“${item.text.replace(/\s+/g, " ").trim()}”`, [{ type: "italic" }])],
        });
        content.push({ type: "paragraph", attrs: { indent: 720, spaceAfter: 200 }, content: [text(`— ${citation(ws, item)}`)] });
      } else if (item.text.trim()) {
        content.push({ type: "paragraph", content: [text("Note: ", [{ type: "bold" }]), text(item.text.trim())] });
      }
    }
  }
  const notes = [...(ws.annotations ?? [])].sort((a, b) => a.fileId.localeCompare(b.fileId) || a.page - b.page);
  if (notes.length) {
    content.push({ type: "heading", attrs: { level: 1 }, content: [text("Highlights and comments")] });
    for (const a of notes) {
      content.push({ type: "paragraph", attrs: { indent: 720 }, content: [text(`“${a.text.replace(/\s+/g, " ").trim()}”`, [{ type: "italic" }])] });
      if (a.kind === "comment" && a.note?.trim()) content.push({ type: "paragraph", attrs: { indent: 720 }, content: [text("Comment: ", [{ type: "bold" }]), text(a.note.trim())] });
      content.push({ type: "paragraph", attrs: { indent: 720, spaceAfter: 200 }, content: [text(`— ${passageCitation(ws, a.fileId, a.page)}`)] });
    }
  }
  return { version: 1, page: structuredClone(DEFAULT_PAGE), content: { type: "doc", content } };
}

export async function exportOutlineDocx(ws: Workspace, title: string): Promise<Uint8Array> {
  return (await exportDocx(outlineDocument(ws, title))).bytes;
}

/** Keeps characters the standard PDF fonts can encode (WinAnsi). */
function safe(font: PDFFont, value: string): string {
  let out = "";
  for (const ch of value.replace(/\s+/g, " ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** The same outline as a PDF (US Letter, 1" margins), built directly with pdf-lib. */
export async function exportOutlinePdf(ws: Workspace, title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("OctoGenie Office");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const W = 612;
  const H = 792;
  const M = 72;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const write = (value: string, font: PDFFont, size: number, indent = 0, color = rgb(0.1, 0.1, 0.12), after = 4) => {
    const words = safe(font, value).split(" ");
    const max = W - 2 * M - indent;
    let line = "";
    const lines: string[] = [];
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
  write(title, bold, 22, 0, rgb(0.12, 0.23, 0.37), 10);
  const sources = ws.documents.map((d) => d.name).join("; ");
  if (sources) write(`Sources: ${sources}`, regular, 10, 0, rgb(0.35, 0.38, 0.43), 14);
  const purple = rgb(0.36, 0.13, 0.71);
  for (const section of outline(ws)) {
    write(section.title, bold, 15, 0, purple, 6);
    if (!section.items.length) write("(No points yet.)", italic, 10, 18);
    for (const item of section.items) {
      if (item.type === "excerpt") {
        write(`“${item.text}”`, italic, 11, 18, undefined, 2);
        write(`— ${citation(ws, item)}`, regular, 9.5, 18, rgb(0.35, 0.38, 0.43), 10);
      } else if (item.text.trim()) write(`Note: ${item.text.trim()}`, regular, 11, 0, undefined, 10);
    }
  }
  const notes = [...(ws.annotations ?? [])].sort((a, b) => a.fileId.localeCompare(b.fileId) || a.page - b.page);
  if (notes.length) {
    write("Highlights and comments", bold, 15, 0, purple, 6);
    for (const a of notes) {
      write(`“${a.text}”`, italic, 11, 18, undefined, 2);
      if (a.kind === "comment" && a.note?.trim()) write(`Comment: ${a.note.trim()}`, regular, 10.5, 18, undefined, 2);
      write(`— ${passageCitation(ws, a.fileId, a.page)}`, regular, 9.5, 18, rgb(0.35, 0.38, 0.43), 10);
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W / 2 - 30, y: 36, size: 9, font: regular, color: rgb(0.5, 0.5, 0.55) }));
  return pdf.save();
}
