import { PDFArray, PDFDocument, PDFName, PDFString, type PDFDict, type PDFPage, type PDFRef } from "@cantoo/pdf-lib";
import type { PdfRect, ResearchDocument, ResearchWorkspace } from "../model/types";

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  const n = m ? parseInt(m[1]!, 16) : 0xfde047;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const f = (n: number) => Number(n.toFixed(2));

function union(rects: PdfRect[]): PdfRect {
  return [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))];
}

/** A form XObject used as an annotation's normal appearance, so every viewer draws it the same. */
function appearance(doc: PDFDocument, bbox: PdfRect, ops: string, multiply: boolean): PDFRef {
  const resources = multiply ? doc.context.obj({ ExtGState: { GS0: { Type: "ExtGState", BM: "Multiply", ca: 0.55 } } }) : doc.context.obj({});
  const stream = doc.context.stream(ops, { Type: "XObject", Subtype: "Form", BBox: bbox.map(f), Resources: resources });
  return doc.context.register(stream);
}

function addAnnot(page: PDFPage, ref: PDFRef) {
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of("Annots"), page.doc.context.obj([ref]));
}

export interface AnnotatedPdfResult {
  pdf: Uint8Array;
  written: number;
  /** Things that couldn't be carried into the PDF. */
  warnings: string[];
}

/**
 * A copy of the document's PDF with the project's highlights, underlines and
 * comments written as standard PDF annotations. The source file is not changed.
 */
export async function exportAnnotatedPdf(viewPdf: Uint8Array, ws: ResearchWorkspace, doc: ResearchDocument): Promise<AnnotatedPdfResult> {
  const pdf = await PDFDocument.load(viewPdf, { updateMetadata: false });
  const pages = pdf.getPages();
  const warnings: string[] = [];
  let written = 0;
  let stale = 0;
  for (const a of ws.annotations) {
    const src = ws.sources[a.sourceId];
    if (!src || src.documentId !== doc.id) continue;
    if (src.viewFileId !== doc.viewFileId || src.viewRevision !== doc.viewRevision) {
      stale++;
      continue;
    }
    const page = pages[src.page];
    if (!page || !src.rects.length) continue;
    const [r, g, b] = hex(a.color);
    const rect = union(src.rects);
    const quads = src.rects.flatMap(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1].map(f));
    const contents = a.note?.trim() ? a.note.trim() : a.kind === "comment" ? "" : `“${src.quote.slice(0, 500)}”`;
    const common = {
      Type: "Annot",
      Rect: rect.map(f),
      C: [r, g, b].map(f),
      Contents: PDFString.of(contents),
      T: PDFString.of("OctoGenie Research"),
      F: 4,
      NM: PDFString.of(`octo-${a.id}`),
    };
    let dict: PDFDict;
    if (a.kind === "highlight") {
      const ops = `/GS0 gs ${f(r)} ${f(g)} ${f(b)} rg ${src.rects.map(([x1, y1, x2, y2]) => `${f(x1)} ${f(y1)} ${f(x2 - x1)} ${f(y2 - y1)} re`).join(" ")} f`;
      dict = pdf.context.obj({ ...common, Subtype: "Highlight", QuadPoints: quads, CA: 0.55, AP: { N: appearance(pdf, rect, ops, true) } });
    } else if (a.kind === "underline") {
      const ops = `${f(r)} ${f(g)} ${f(b)} RG 1.2 w ${src.rects.map(([x1, y1, x2]) => `${f(x1)} ${f(y1 + 1)} m ${f(x2)} ${f(y1 + 1)} l`).join(" ")} S`;
      dict = pdf.context.obj({ ...common, Subtype: "Underline", QuadPoints: quads, AP: { N: appearance(pdf, rect, ops, false) } });
    } else {
      // A comment: the passage is underlined and a note icon sits in the margin.
      const ops = `${f(r)} ${f(g)} ${f(b)} RG 1 w ${src.rects.map(([x1, y1, x2]) => `${f(x1)} ${f(y1 + 0.5)} m ${f(x2)} ${f(y1 + 0.5)} l`).join(" ")} S`;
      const underline = pdf.context.obj({ ...common, Subtype: "Underline", QuadPoints: quads, AP: { N: appearance(pdf, rect, ops, false) } });
      addAnnot(page, pdf.context.register(underline));
      const { width } = page.getSize();
      const x = Math.min(width - 22, rect[2] + 6);
      const icon: PdfRect = [x, rect[3] - 16, x + 16, rect[3]];
      const iconOps = `${f(r)} ${f(g)} ${f(b)} rg 0 0 0 RG 0.6 w ${f(icon[0])} ${f(icon[1] + 3)} 16 13 re B ${f(icon[0] + 3)} ${f(icon[1] + 3)} m ${f(icon[0] + 3)} ${f(icon[1])} l ${f(icon[0] + 7)} ${f(icon[1] + 3)} l f`;
      dict = pdf.context.obj({ ...common, Subtype: "Text", Rect: icon.map(f), Name: "Comment", Open: false, AP: { N: appearance(pdf, icon, iconOps, false) } });
    }
    dict.set(PDFName.of("P"), page.ref);
    dict.set(PDFName.of("M"), PDFString.fromDate(new Date(a.updatedAt)));
    addAnnot(page, pdf.context.register(dict));
    written++;
  }
  if (stale) warnings.push(`${stale} annotation${stale === 1 ? "" : "s"} belong to an earlier version of this document and were left out.`);
  const excerpts = ws.cards.filter((c) => c.type === "excerpt" && ws.sources[c.sourceId]?.documentId === doc.id).length;
  if (excerpts) warnings.push(`Workspace cards, connectors and groups can't be stored in a PDF; the ${excerpts} excerpt${excerpts === 1 ? "" : "s"} from this document stay in the project only.`);
  return { pdf: await pdf.save(), written, warnings };
}
