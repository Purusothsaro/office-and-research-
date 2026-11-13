// @vitest-environment jsdom
import { exportDocx, DEFAULT_PAGE, importDocx } from "@octo/editor-document";
import { PDFDocument, PDFName, PDFArray, PDFDict } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  addExcerpt,
  buildReport,
  buildSearchablePdf,
  checkImport,
  convertToPdf,
  emptyWorkspace,
  exportAnnotatedPdf,
  exportProjectData,
  findAll,
  findQuote,
  looksScanned,
  rectsFor,
  remapSources,
  reportToDocx,
  reportToPdf,
  search,
  upsertDocument,
  workspaceSvg,
  type ResearchDocument,
} from "./index";
import { indexBytes, makePdf } from "./test-utils";

const doc = (extra: Partial<ResearchDocument> = {}): ResearchDocument => ({
  id: "d1",
  fileId: "f1",
  revision: 1,
  name: "Hearing transcript.pdf",
  format: "pdf",
  viewFileId: "f1",
  viewRevision: 1,
  textMode: "native",
  pageCount: 2,
  status: "ready",
  addedAt: 0,
  ...extra,
});

const pages = [
  ["SETTLEMENT AGREEMENT", "This Agreement is made between Acme Holdings Ltd and Beta Corp.", "The parties agree to keep the terms Confidential."],
  ["SCHEDULE 1", "Payment of the settlement sum is due within thirty days", "of signing by both parties."],
];

describe("text extraction and search", () => {
  it("indexes each page and finds phrases across line breaks", async () => {
    const idx = await indexBytes(await makePdf(pages));
    expect(idx.pages).toHaveLength(2);
    expect(idx.pages[0]!.text).toContain("Acme Holdings Ltd");
    const hit = findAll(idx.pages[1]!, "thirty days of signing");
    expect(hit).toHaveLength(1);
    const rects = rectsFor(idx.pages[1]!, hit[0]![0], hit[0]![1]);
    // Two lines: one rectangle each, at the drawn positions (y = 680 and 660).
    expect(rects).toHaveLength(2);
    expect(rects[0]![1]).toBeGreaterThan(rects[1]![1]);
    expect(rects[0]![1]).toBeLessThan(680);
    expect(rects[0]![3]).toBeGreaterThan(680);
  });

  it("searches across documents with page, snippet and limits", async () => {
    const a = await indexBytes(await makePdf(pages), "a");
    const b = await indexBytes(await makePdf([["The settlement was never paid."], ["Settlement talks failed."]]), "b");
    const { hits } = search([a, b], "settlement");
    expect(hits.map((h) => [h.documentId, h.page])).toEqual([
      ["a", 0],
      ["a", 1],
      ["b", 0],
      ["b", 1],
    ]);
    expect(hits[1]!.match.toLowerCase()).toBe("settlement");
    expect(hits[1]!.before + hits[1]!.match + hits[1]!.after).toContain("Payment of the settlement sum");
    expect(search([a, b], "settlement", { documentIds: ["b"] }).hits).toHaveLength(2);
    expect(search([a, b], "settlement", { limit: 1 })).toMatchObject({ truncated: true });
    expect(search([a], "Ltd", { wholeWord: true }).hits).toHaveLength(1);
    expect(search([a], "x").hits).toEqual([]);
  });

  it("spots documents that need OCR", async () => {
    const blank = await PDFDocument.create();
    blank.addPage();
    blank.addPage();
    expect(looksScanned((await indexBytes(await blank.save())).pages)).toBe(true);
    expect(looksScanned((await indexBytes(await makePdf(pages))).pages)).toBe(false);
  });
});

describe("replacing a source document", () => {
  it("keeps, moves or flags each passage and keeps broken ones on the old revision", async () => {
    const v1 = await indexBytes(await makePdf(pages), "d1", "f1", 1);
    let ws = upsertDocument(emptyWorkspace(), doc());
    const passage = (page: number, quote: string) => {
      const at = findQuote(v1.pages[page]!, quote)!;
      return { documentId: "d1", page, quote, rects: rectsFor(v1.pages[page]!, at[0], at[1]), start: at[0], end: at[1] };
    };
    const [w1, kept] = addExcerpt(ws, passage(0, "Acme Holdings Ltd"));
    const [w2, moved] = addExcerpt(w1, passage(1, "due within thirty days"));
    const [w3, gone] = addExcerpt(w2, passage(0, "keep the terms Confidential"));
    ws = w3;
    // Version 2: an inserted cover page, the schedule rewritten without the confidentiality clause.
    const v2 = await indexBytes(await makePdf([["SETTLEMENT AGREEMENT", "This Agreement is made between Acme Holdings Ltd and Beta Corp."], ["Cover letter"], ["Payment is due within thirty days of signing."]]), "d1", "f1", 2);
    const { ws: next, report } = remapSources(ws, doc({ viewRevision: 2 }), v2);
    expect(report).toEqual({ ok: 1, moved: 1, broken: 1 });
    expect(next.sources[kept.sourceId]).toMatchObject({ status: "ok", viewRevision: 2, page: 0 });
    expect(next.sources[moved.sourceId]).toMatchObject({ status: "moved", viewRevision: 2, page: 2 });
    expect(next.sources[gone.sourceId]).toMatchObject({ status: "broken", viewRevision: 1, page: 0 });
    // Card text was never touched.
    expect(next.cards.map((c) => (c as { text: string }).text)).toEqual(ws.cards.map((c) => (c as { text: string }).text));
  });
});

describe("importing other formats", () => {
  it("validates files by content", () => {
    expect(checkImport("a.pdf", new TextEncoder().encode("%PDF-1.7\n%%EOF"))).toEqual({ ok: true, format: "pdf" });
    expect(checkImport("notes.md", new TextEncoder().encode("# Hi"))).toEqual({ ok: true, format: "md" });
    expect(checkImport("fake.pdf", new TextEncoder().encode("MZ not a pdf"))).toMatchObject({ ok: false });
    expect(checkImport("sheet.csv", new TextEncoder().encode("a,b"))).toMatchObject({ ok: false, reason: expect.stringContaining("PDF, Word") });
  });

  it("lays out text files as searchable pages", async () => {
    const text = Array.from({ length: 120 }, (_, i) => `Paragraph ${i + 1}. The witness said the gate was “locked” — at 9 pm.`).join("\n\n");
    const out = await convertToPdf("txt", new TextEncoder().encode(text), "Statement");
    expect(out.pageCount).toBeGreaterThan(3);
    expect(out.warnings).toEqual([]);
    const idx = await indexBytes(out.pdf);
    expect(search([idx], "Paragraph 120.").hits).toHaveLength(1);
    expect(search([idx], "gate was “locked”").hits.length).toBe(120);
  });

  it("converts Word documents with headings, lists and tables", async () => {
    const docx = await exportDocx({
      version: 1,
      page: structuredClone(DEFAULT_PAGE),
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Witness Statement of Jane Roe" }] },
          { type: "paragraph", content: [{ type: "text", text: "I saw the " }, { type: "text", text: "red car", marks: [{ type: "bold" }] }, { type: "text", text: " at the junction." }] },
          { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First point" }] }] }] },
        ],
      },
    });
    const out = await convertToPdf("docx", docx.bytes, "Statement");
    const idx = await indexBytes(out.pdf);
    expect(idx.pages[0]!.text).toContain("Witness Statement of Jane Roe");
    expect(search([idx], "I saw the red car at the junction").hits).toHaveLength(1);
    expect(idx.pages[0]!.text).toContain("First point");
  });

  it("converts Markdown without running embedded HTML", async () => {
    const md = "# Chronology\n\n- 1 March: contract signed\n- 9 April: **notice** sent\n\n<script>alert(1)</script><img src=x onerror=alert(1)>\n\n> Quoted correspondence";
    const out = await convertToPdf("md", new TextEncoder().encode(md), "Chronology");
    const idx = await indexBytes(out.pdf);
    const text = idx.pages.map((p) => p.text).join(" ");
    expect(text).toContain("Chronology");
    expect(text).toContain("9 April: notice sent");
    expect(text).toContain("Quoted correspondence");
    expect(text).not.toContain("alert");
  });
});

describe("OCR text layer", () => {
  it("adds recognised words as invisible, selectable text at their positions", async () => {
    // A "scan": a page with an image only.
    const scan = await PDFDocument.create();
    const page = scan.addPage([612, 792]);
    page.drawRectangle({ x: 60, y: 600, width: 300, height: 40, borderWidth: 1 });
    const original = await scan.save();
    const out = await buildSearchablePdf(original, [
      {
        page: 0,
        confidence: 91,
        words: [
          { text: "Exhibit", x0: 72, y0: 610, x1: 130, y1: 626, confidence: 95 },
          { text: "C-12", x0: 136, y0: 610, x1: 170, y1: 626, confidence: 88 },
        ],
      },
    ]);
    const idx = await indexBytes(out);
    const hit = findAll(idx.pages[0]!, "Exhibit C-12");
    expect(hit).toHaveLength(1);
    const [r] = rectsFor(idx.pages[0]!, hit[0]![0], hit[0]![0] + 7);
    expect(r![0]).toBeCloseTo(72, 0);
    expect(r![2]).toBeGreaterThan(120);
    expect(r![2]).toBeLessThan(140);
    // The original page content is still there, unchanged in size.
    const reopened = await PDFDocument.load(out);
    expect(reopened.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
});

describe("exports", () => {
  async function project() {
    const bytes = await makePdf(pages);
    const idx = await indexBytes(bytes);
    let ws = upsertDocument(emptyWorkspace(), doc());
    const at = findQuote(idx.pages[1]!, "due within thirty days")!;
    const passage = { documentId: "d1", page: 1, quote: "Payment of the settlement sum is due within thirty days", rects: rectsFor(idx.pages[1]!, at[0], at[1]) };
    ws = addExcerpt(ws, passage, { x: 0, y: 0 })[0];
    ws = addAnnotation(ws, "highlight", passage, "#fde047")[0];
    ws = addAnnotation(ws, "underline", { ...passage, page: 0 }, "#2563eb")[0];
    ws = addAnnotation(ws, "comment", passage, "#93c5fd", "Check against the bank records")[0];
    return { bytes, ws };
  }
  const meta = { id: "p", name: "Acme", caseName: "Acme v Beta", reference: "CL-7", court: "Commercial Court", jurisdiction: "E&W", description: "Settlement dispute", archived: false, revision: 3, size: 0, createdAt: 0, updatedAt: 0 };

  it("writes a summary to DOCX that reopens with quotes and citations", async () => {
    const { ws } = await project();
    const bytes = await reportToDocx(buildReport(ws, meta, { title: "Acme summary", by: "document" }));
    expect(checkImport("s.docx", bytes)).toEqual({ ok: true, format: "docx" });
    const { doc: reopened } = await importDocx(bytes);
    const text = JSON.stringify(reopened.content);
    expect(text).toContain("Acme summary");
    expect(text).toContain("Payment of the settlement sum is due within thirty days");
    expect(text).toContain("— Hearing transcript, p. 2");
    expect(text).toContain("Commercial Court");
    expect(text).toContain("not verified legal conclusions");
  });

  it("writes a summary to PDF that reopens with the same content", async () => {
    const { ws } = await project();
    const pdf = await reportToPdf(buildReport(ws, meta, { title: "Acme summary", by: "document" }));
    const idx = await indexBytes(pdf);
    const text = idx.pages.map((p) => p.text).join(" ");
    expect(text).toContain("Acme summary");
    expect(text).toContain("Hearing transcript, p. 2");
    expect(text).toContain("Page 1 of");
  });

  it("writes annotations into a copy of the PDF, leaving the source unchanged", async () => {
    const { bytes, ws } = await project();
    const before = bytes.slice();
    const out = await exportAnnotatedPdf(bytes, ws, ws.documents[0]!);
    expect(bytes).toEqual(before);
    expect(out.written).toBe(3);
    expect(out.warnings.join(" ")).toMatch(/cards, connectors and groups/);
    const pdf = await PDFDocument.load(out.pdf);
    const subtypes = pdf.getPages().flatMap((p) => (p.node.lookupMaybe(PDFName.of("Annots"), PDFArray)?.asArray() ?? []).map((ref) => (pdf.context.lookup(ref) as PDFDict).get(PDFName.of("Subtype"))!.toString()));
    expect(subtypes.sort()).toEqual(["/Highlight", "/Text", "/Underline", "/Underline"]);
    // pdf.js reads the comment text back.
    const { openInNode } = await import("./test-utils");
    const loaded = await openInNode(out.pdf);
    const annots = await (await loaded.getPage(2)).getAnnotations();
    expect(annots.map((a: { contentsObj?: { str: string } }) => a.contentsObj?.str)).toContain("Check against the bank records");
    await loaded.destroy();
  });

  it("snapshots the workspace as escaped SVG and exports project data", async () => {
    let { ws } = await project();
    ws = { ...ws, cards: ws.cards.map((c) => ({ ...c, text: "<script>alert(1)</script> & more" })) } as typeof ws;
    const svg = workspaceSvg(ws);
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("Hearing transcript, p. 2");
    const data = exportProjectData(meta, ws, new Date("2026-10-27T00:00:00Z"));
    expect(data).toMatchObject({ format: "octogenie-research-export", version: 1, project: { caseName: "Acme v Beta" } });
    expect(data.sources[0]).toMatchObject({ page: 1, citation: "Hearing transcript, p. 2" });
    expect(JSON.parse(JSON.stringify(data)).cards).toHaveLength(1);
  });
});

describe("source anchors", () => {
  it("anchors a browser selection even when spaces between text runs are lost", async () => {
    const { anchorSelection } = await import("./index");
    const idx = await indexBytes(await makePdf(pages));
    const a = anchorSelection(idx.pages[0]!, "made between AcmeHoldings Ltd")!;
    expect(a.quote).toBe("made between Acme Holdings Ltd");
    expect(idx.pages[0]!.text.slice(a.start, a.end)).toBe("made between Acme Holdings Ltd");
    expect(a.rects).toHaveLength(1);
    expect(anchorSelection(idx.pages[0]!, "text that is not on this page")).toBeNull();
  });

  it("validates anchors on their own page only and never redirects across pages", async () => {
    const { validateAnchor, anchorSelection } = await import("./index");
    const idx = await indexBytes(await makePdf(pages));
    const a = anchorSelection(idx.pages[1]!, "due within thirty days")!;
    expect(validateAnchor({ page: 1, quote: a.quote, start: a.start, end: a.end }, idx.pages[1])).toMatchObject({ state: "valid", start: a.start });
    // Offsets went stale but the text is still on the page.
    expect(validateAnchor({ page: 1, quote: a.quote, start: 0, end: a.quote.length }, idx.pages[1])).toMatchObject({ state: "relocated", start: a.start });
    // The text exists only on another page: not valid here, and no redirect.
    const onFirst = anchorSelection(idx.pages[0]!, "keep the terms Confidential")!;
    expect(validateAnchor({ page: 1, quote: onFirst.quote }, idx.pages[1])).toEqual({ state: "invalid" });
    expect(validateAnchor({ page: 5, quote: a.quote }, undefined)).toEqual({ state: "invalid" });
  });

  it("records owner ids and the source revision, and re-links without changing ids", async () => {
    const { relinkSource, markBroken } = await import("./index");
    let ws = upsertDocument(emptyWorkspace(), doc({ revision: 3 }));
    const [w1, card] = addExcerpt(ws, { documentId: "d1", page: 0, rects: [[1, 1, 2, 2]], quote: "old text" });
    const [w2, ann] = addAnnotation(w1, "highlight", { documentId: "d1", page: 0, rects: [[1, 1, 2, 2]], quote: "x" }, "#fde047");
    expect(w2.sources[card.sourceId]).toMatchObject({ sourceRevision: 3, owner: { kind: "excerpt", id: card.id } });
    expect(w2.sources[ann.sourceId]).toMatchObject({ owner: { kind: "annotation", id: ann.id } });
    ws = markBroken(w2, card.sourceId, "Not found");
    expect(ws.sources[card.sourceId]!.status).toBe("broken");
    ws = relinkSource(ws, card.sourceId, { documentId: "d1", page: 1, rects: [[5, 5, 9, 9]], quote: "new text", start: 4, end: 12 });
    expect(ws.sources[card.sourceId]).toMatchObject({ id: card.sourceId, page: 1, quote: "new text", status: "ok", start: 4, owner: { id: card.id } });
    expect(ws.sources[card.sourceId]!.note).toBeUndefined();
    // The card's own wording is untouched.
    expect(ws.cards[0]).toMatchObject({ text: "old text", sourceId: card.sourceId });
  });
});
