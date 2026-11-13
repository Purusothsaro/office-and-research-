import { createBlankWorkspace, validateUpload } from "@octo/core";
import { importDocx } from "@octo/editor-document";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { citation, emptyWorkspace, exportOutlineDocx, groupOf, outline, parseWorkspace, serializeWorkspace, type ExcerptItem, type Workspace } from "./index";

const excerpt = (id: string, x: number, y: number, page: number, text: string, fileId = "dep"): ExcerptItem => ({ id, type: "excerpt", x, y, w: 200, h: 80, color: "#fde68a", fileId, page, rects: [[72, 600, 300, 614]], text });

function sample(): Workspace {
  const ws = emptyWorkspace();
  ws.documents = [
    { fileId: "dep", name: "Smith Deposition.pdf" },
    { fileId: "ex", name: "Exhibit 4 - Contract.pdf", short: "Ex. 4" },
  ];
  ws.items = [
    { id: "g2", type: "group", x: 0, y: 600, w: 600, h: 400, color: "#bfdbfe", title: "Damages" },
    { id: "g1", type: "group", x: 0, y: 0, w: 600, h: 400, color: "#fde68a", title: "Liability" },
    excerpt("e2", 300, 100, 11, "I never received the notice."),
    excerpt("e1", 20, 100, 4, "The brakes were inspected in March."),
    excerpt("e3", 40, 700, 2, "Payment of $50,000 was due.", "ex"),
    { id: "n1", type: "note", x: 20, y: 250, w: 200, h: 100, color: "#fef9c3", text: "Contradicts Exhibit 4" },
    { id: "n2", type: "note", x: 900, y: 50, w: 200, h: 100, color: "#fef9c3", text: "Ask about timeline" },
  ];
  ws.links = [{ id: "l1", from: "e1", to: "n1" }];
  return ws;
}

const plain = (n: JSONContent): string => (n.text ?? "") + (n.content ?? []).map(plain).join(n.type === "doc" ? "\n" : "");

describe("workspace model", () => {
  it("cites excerpts with document name (or short label) and page", () => {
    const ws = sample();
    expect(citation(ws, ws.items.find((i) => i.id === "e2") as ExcerptItem)).toBe("Smith Deposition, p. 12");
    expect(citation(ws, ws.items.find((i) => i.id === "e3") as ExcerptItem)).toBe("Ex. 4, p. 3");
  });

  it("assigns items to the issue frame that contains them", () => {
    const ws = sample();
    expect(groupOf(ws, ws.items.find((i) => i.id === "e1")!)?.title).toBe("Liability");
    expect(groupOf(ws, ws.items.find((i) => i.id === "e3")!)?.title).toBe("Damages");
    expect(groupOf(ws, ws.items.find((i) => i.id === "n2")!)).toBeUndefined();
  });

  it("builds the outline in canvas order, ungrouped points last", () => {
    const sections = outline(sample());
    expect(sections.map((s) => s.title)).toEqual(["Liability", "Damages", "Other points"]);
    expect(sections[0]!.items.map((i) => i.id)).toEqual(["e1", "e2", "n1"]);
    expect(sections[2]!.items.map((i) => i.id)).toEqual(["n2"]);
  });

  it("round-trips through its file format, which the upload validator accepts", () => {
    const ws = sample();
    const bytes = serializeWorkspace(ws);
    expect(parseWorkspace(bytes)).toEqual(ws);
    expect(validateUpload("Case.octows", bytes)).toEqual({ ok: true, format: "octows" });
    expect(validateUpload("Case.octows", new TextEncoder().encode('{"kind":"other"}'))).toMatchObject({ ok: false });
    const blank = createBlankWorkspace();
    expect(validateUpload(blank.name, blank.bytes)).toEqual({ ok: true, format: "octows" });
    expect(parseWorkspace(blank.bytes).items).toEqual([]);
  });
});

describe("export to Word", () => {
  it("writes an issue outline with quotes and citations", async () => {
    const bytes = await exportOutlineDocx(sample(), "Smith v. Jones");
    expect(validateUpload("outline.docx", bytes)).toEqual({ ok: true, format: "docx" });
    const { doc } = await importDocx(bytes);
    const text = plain(doc.content);
    const headings = (doc.content.content ?? []).filter((b) => b.type === "heading").map(plain);
    expect(headings).toEqual(["Liability", "Damages", "Other points"]);
    expect(text).toContain("Smith v. Jones");
    expect(text).toContain("“The brakes were inspected in March.”");
    expect(text).toContain("— Smith Deposition, p. 5");
    expect(text).toContain("— Ex. 4, p. 3");
    expect(text).toContain("Note: Contradicts Exhibit 4");
    // Liability's points come before Damages' in the document.
    expect(text.indexOf("inspected in March")).toBeLessThan(text.indexOf("Payment of $50,000"));
  });
});

describe("LiquidText-style additions", () => {
  it("merges collapsed pages into ranges", async () => {
    const { collapsedRanges } = await import("./model");
    expect(collapsedRanges([5, 3, 4, 9, 4])).toEqual([
      [3, 5],
      [9, 9],
    ]);
    expect(collapsedRanges([])).toEqual([]);
  });

  it("keeps older workspaces opening (no annotations, ink or collapse yet)", () => {
    const old = new TextEncoder().encode(JSON.stringify({ kind: "octogenie-workspace", version: 1, documents: [], items: [], links: [], view: { x: 0, y: 0, zoom: 1 } }));
    const ws = parseWorkspace(old);
    expect(ws.annotations).toEqual([]);
    expect(ws.ink).toEqual([]);
    expect(ws.collapsed).toEqual({});
  });

  it("exports highlights and comments to Word and PDF", async () => {
    const { exportOutlinePdf } = await import("./index");
    const ws = sample();
    ws.annotations = [
      { id: "a1", kind: "highlight", fileId: "dep", page: 6, rects: [[1, 1, 2, 2]], text: "The light was red.", color: "#fde047", createdAt: 1 },
      { id: "a2", kind: "comment", fileId: "ex", page: 0, rects: [[1, 1, 2, 2]], text: "Net 30 days", color: "#93c5fd", note: "Check the invoice date", createdAt: 2 },
    ];
    const { doc } = await importDocx(await exportOutlineDocx(ws, "Case"));
    const text = plain(doc.content);
    expect(text).toContain("Highlights and comments");
    expect(text).toContain("“The light was red.”");
    expect(text).toContain("— Smith Deposition, p. 7");
    expect(text).toContain("Comment: Check the invoice date");

    const pdf = await exportOutlinePdf(ws, "Smith v. Jones — outline");
    expect(validateUpload("outline.pdf", pdf)).toEqual({ ok: true, format: "pdf" });
    const { PDFDocument } = await import("@cantoo/pdf-lib");
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getTitle()).toBe("Smith v. Jones — outline");
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
