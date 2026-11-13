import { PDFArray, PDFDict, PDFDocument, PDFName, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPdf, preparePdf, type PdfAnnotation, type PdfEditState } from "./index";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Three pages of different widths so order is observable, with a form. */
async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const width of [600, 610, 620]) {
    const page = doc.addPage([width, 800]);
    page.drawText(`Page width ${width}. Confidential settlement terms.`, { x: 50, y: 700, size: 12, font });
  }
  const form = doc.getForm();
  const name = form.createTextField("client.name");
  name.addToPage(doc.getPage(0), { x: 50, y: 600, width: 200, height: 20 });
  const agree = form.createCheckBox("agree");
  agree.addToPage(doc.getPage(1), { x: 50, y: 600, width: 14, height: 14 });
  const venue = form.createDropdown("venue");
  venue.addOptions(["London", "New York"]);
  venue.addToPage(doc.getPage(0), { x: 50, y: 550, width: 150, height: 20 });
  // An annotation made by another program must survive untouched.
  const foreign = doc.context.obj({ Type: "Annot", Subtype: "Square", Rect: [10, 10, 40, 40], C: [1, 0, 0] });
  doc.getPage(2).node.addAnnot(doc.context.register(foreign));
  return doc.save();
}

const base = { color: "#ffd400", comment: "", author: "Tester", createdAt: Date.UTC(2026, 9, 22) };
const annotations: PdfAnnotation[] = [
  { ...base, id: "h1", kind: "highlight", page: 0, rect: [50, 695, 200, 712], rects: [[50, 695, 200, 712]], quote: "Page width", comment: "Check this" },
  { ...base, id: "n1", kind: "note", page: 0, rect: [500, 700, 520, 720], comment: "Ask the client" },
  { ...base, id: "i1", kind: "ink", page: 1, rect: [99, 99, 201, 151], paths: [[[100, 100], [150, 150], [200, 120]]], width: 2, color: "#d32f2f" },
  { ...base, id: "t1", kind: "text", page: 2, rect: [60, 500, 260, 540], text: "Approved — subject to (signature)", fontSize: 12, color: "#1e3a5f" },
  { ...base, id: "s1", kind: "signature", page: 2, rect: [60, 300, 240, 360], image: PNG },
];

function annotsOf(doc: PDFDocument, index: number): PDFDict[] {
  const arr = doc.getPage(index).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  return (arr?.asArray() ?? []).map((ref) => doc.context.lookup(ref, PDFDict));
}

describe("PDF save pipeline", () => {
  it("prepares an unedited PDF and reads its form fields", async () => {
    const prepared = await preparePdf(await samplePdf());
    expect(prepared.encrypted).toBe(false);
    expect(prepared.pageCount).toBe(3);
    expect(prepared.state.pages).toEqual([0, 1, 2].map((source) => ({ source, rotation: 0 })));
    expect(prepared.state.annotations).toEqual([]);
    expect(prepared.fields.map((f) => [f.name, f.type, f.widgets[0]!.page])).toEqual([
      ["client.name", "text", 0],
      ["agree", "checkbox", 1],
      ["venue", "dropdown", 0],
    ]);
    expect(prepared.fields[2]!.options).toEqual(["London", "New York"]);
  });

  it("writes real PDF annotations with appearance streams", async () => {
    const prepared = await preparePdf(await samplePdf());
    const state: PdfEditState = { ...prepared.state, annotations };
    const out = await PDFDocument.load(await buildPdf(prepared.base, state));
    const subtypes = [0, 1, 2].flatMap((i) => annotsOf(out, i).map((d) => d.get(PDFName.of("Subtype"))?.toString()));
    expect(subtypes.sort()).toEqual(["/FreeText", "/Highlight", "/Ink", "/Square", "/Stamp", "/Text", "/Widget", "/Widget", "/Widget"].sort());
    for (const dict of [0, 1, 2].flatMap((i) => annotsOf(out, i))) {
      if (dict.get(PDFName.of("OctoData"))) expect(dict.get(PDFName.of("AP"))).toBeDefined();
    }
  });

  it("reopens its own annotations as editable state", async () => {
    const prepared = await preparePdf(await samplePdf());
    const saved = await buildPdf(prepared.base, { ...prepared.state, annotations });
    const reopened = await preparePdf(saved);
    expect(reopened.state.annotations).toEqual(annotations);
    // Our annotations are lifted out of the base; the foreign one stays.
    const baseDoc = await PDFDocument.load(reopened.base);
    expect(annotsOf(baseDoc, 2).map((d) => d.get(PDFName.of("Subtype"))?.toString())).toEqual(["/Square"]);
  });

  it("reorders, rotates and deletes pages, moving annotations with them", async () => {
    const prepared = await preparePdf(await samplePdf());
    const state: PdfEditState = {
      ...prepared.state,
      annotations,
      pages: [
        { source: 2, rotation: 90 },
        { source: 0, rotation: 0 },
      ],
    };
    const out = await PDFDocument.load(await buildPdf(prepared.base, state));
    expect(out.getPageCount()).toBe(2);
    expect(out.getPages().map((p) => p.getWidth())).toEqual([620, 600]);
    expect(out.getPage(0).getRotation().angle).toBe(90);
    const reopened = await preparePdf(await out.save());
    // Annotations from deleted page 1 are gone; the others follow their pages.
    expect(reopened.state.annotations.map((a) => [a.id, a.page]).sort()).toEqual([
      ["h1", 1],
      ["n1", 1],
      ["s1", 0],
      ["t1", 0],
    ]);
    // Form fields still work after reordering.
    expect(reopened.fields.find((f) => f.name === "client.name")!.widgets[0]!.page).toBe(1);
  });

  it("fills form fields", async () => {
    const prepared = await preparePdf(await samplePdf());
    const out = await buildPdf(prepared.base, { ...prepared.state, formValues: { "client.name": "Acme Ltd", agree: true, venue: "London" } });
    const form = (await PDFDocument.load(out)).getForm();
    expect(form.getTextField("client.name").getText()).toBe("Acme Ltd");
    expect(form.getCheckBox("agree").isChecked()).toBe(true);
    expect(form.getDropdown("venue").getSelected()).toEqual(["London"]);
    const reopened = await preparePdf(out);
    expect(reopened.fields.find((f) => f.name === "client.name")!.value).toBe("Acme Ltd");
  });

  it("rejects files that are not PDFs", async () => {
    await expect(preparePdf(new TextEncoder().encode("%PDF-1.7 garbage"))).rejects.toThrow();
  });
});

describe("deleted pages", () => {
  it("are removed from the file, not just hidden", async () => {
    const prepared = await preparePdf(await samplePdf());
    const out = await PDFDocument.load(await buildPdf(prepared.base, { ...prepared.state, pages: [{ source: 0, rotation: 0 }] }));
    const pageObjects = out.context
      .enumerateIndirectObjects()
      .filter(([, obj]) => obj instanceof PDFDict && obj.get(PDFName.of("Type"))?.toString() === "/Page");
    expect(pageObjects).toHaveLength(1);
    expect(out.getPage(0).getWidth()).toBe(600);
  });
});
