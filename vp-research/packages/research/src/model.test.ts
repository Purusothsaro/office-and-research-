import { describe, expect, it } from "vitest";
import {
  STACK_GAP,
  addAnnotation,
  addExcerpt,
  addGroup,
  addNote,
  align,
  buildReport,
  citation,
  connect,
  connectorEnds,
  deleteItems,
  duplicateCards,
  edgePoint,
  emptyWorkspace,
  filterCards,
  groupCards,
  groupOf,
  History,
  moveCards,
  organize,
  parseWorkspace,
  removeDocument,
  resizeCard,
  serializeWorkspace,
  setTags,
  updateCard,
  upsertDocument,
  withMembers,
  type ExcerptCard,
  type ProjectMeta,
  type ResearchDocument,
  type ResearchWorkspace,
} from "./index";

const doc = (id: string, name: string, extra: Partial<ResearchDocument> = {}): ResearchDocument => ({
  id,
  fileId: `file-${id}`,
  revision: 1,
  name,
  format: "pdf",
  viewFileId: `file-${id}`,
  viewRevision: 1,
  textMode: "native",
  pageCount: 20,
  status: "ready",
  addedAt: 0,
  ...extra,
});

function sample() {
  let ws = emptyWorkspace();
  ws = upsertDocument(ws, doc("dep", "Smith Deposition.pdf"));
  ws = upsertDocument(ws, doc("ex4", "Exhibit 4 - Contract.pdf", { short: "Ex. 4" }));
  const [w1, e1] = addExcerpt(ws, { documentId: "dep", page: 11, rects: [[72, 600, 300, 614]], quote: "I never received the notice.", start: 10, end: 38 }, { x: 40, y: 80 });
  const [w2, e2] = addExcerpt(w1, { documentId: "ex4", page: 2, rects: [[72, 500, 300, 514]], quote: "Notice must be sent by registered post." }, { x: 340, y: 80 });
  const [w3, n1] = addNote(w2, { x: 40, y: 300 }, "Was notice ever posted?");
  return { ws: w3, e1, e2, n1 };
}

const project: ProjectMeta = { id: "p", name: "Smith", caseName: "Smith v. Jones", reference: "HC-1", court: "High Court", jurisdiction: "E&W", description: "", archived: false, revision: 1, size: 0, createdAt: 0, updatedAt: 0 };

describe("excerpts and source tracking", () => {
  it("records document, page, coordinates and offsets for a new excerpt", () => {
    const { ws, e1 } = sample();
    const src = ws.sources[e1.sourceId]!;
    expect(src).toMatchObject({ documentId: "dep", viewFileId: "file-dep", viewRevision: 1, page: 11, quote: "I never received the notice.", start: 10, end: 38, status: "ok" });
    expect(citation(ws, e1.sourceId)).toBe("Smith Deposition, p. 12");
  });

  it("keeps the source intact when the card text is edited, moved or resized", () => {
    const { ws, e1 } = sample();
    const before = structuredClone(ws.sources[e1.sourceId]);
    let next = updateCard(ws, e1.id, { text: "Witness denies receiving notice" });
    next = moveCards(next, [e1.id], 500, 20);
    next = resizeCard(next, e1.id, 400, 200);
    expect(next.sources[e1.sourceId]).toEqual(before);
    const card = next.cards.find((c) => c.id === e1.id) as ExcerptCard;
    expect(card).toMatchObject({ text: "Witness denies receiving notice", x: 540, y: 100, w: 400, h: 200 });
    expect(citation(next, card.sourceId)).toBe("Smith Deposition, p. 12");
  });

  it("uses the short label in citations", () => {
    const { ws, e2 } = sample();
    expect(citation(ws, e2.sourceId)).toBe("Ex. 4, p. 3");
  });

  it("drops a source when the last card or annotation using it is deleted", () => {
    const { ws, e1 } = sample();
    const [withNote] = addAnnotation(ws, "comment", { documentId: "dep", page: 0, rects: [[1, 1, 2, 2]], quote: "x" }, "#93c5fd", "check");
    const next = deleteItems(withNote, [e1.id]);
    expect(next.sources[e1.sourceId]).toBeUndefined();
    expect(Object.keys(next.sources)).toHaveLength(2);
  });

  it("removes a document with its excerpts, annotations and connectors", () => {
    const { ws, e1, e2, n1 } = sample();
    let next = connect(ws, e1.id, n1.id)[0];
    next = connect(next, e2.id, n1.id)[0];
    next = addAnnotation(next, "highlight", { documentId: "dep", page: 1, rects: [[1, 1, 2, 2]], quote: "y" }, "#fde047")[0];
    next = removeDocument(next, "dep");
    expect(next.documents.map((d) => d.id)).toEqual(["ex4"]);
    expect(next.cards.map((c) => c.id).sort()).toEqual([e2.id, n1.id].sort());
    expect(next.annotations).toEqual([]);
    expect(next.connectors).toHaveLength(1);
    expect(Object.values(next.sources).every((s) => s.documentId === "ex4")).toBe(true);
  });
});

describe("connections and layout", () => {
  it("connects cards once, with a relationship type and label", () => {
    const { ws, e1, e2 } = sample();
    const [w1, c] = connect(ws, e1.id, e2.id, "contradicts", "Notice requirement");
    expect(c).toMatchObject({ relation: "contradicts", label: "Notice requirement" });
    const [w2, again] = connect(w1, e2.id, e1.id, "supports");
    expect(again!.id).toBe(c!.id);
    expect(w2.connectors).toHaveLength(1);
    expect(connect(w2, e1.id, e1.id)[1]).toBeNull();
  });

  it("attaches connector ends to card edges, wherever the cards move", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 300, y: 0, w: 100, h: 50 };
    expect(connectorEnds(a, b)).toMatchObject({ x1: 100, y1: 25, x2: 300, y2: 25 });
    const below = { x: 0, y: 400, w: 100, h: 50 };
    expect(connectorEnds(a, below)).toMatchObject({ x1: 50, y1: 50, x2: 50, y2: 400 });
    expect(edgePoint(a, { x: 50, y: 25 })).toEqual({ x: 50, y: 25 });
  });

  it("aligns and distributes selected cards", () => {
    const { ws, e1, e2, n1 } = sample();
    const left = align(ws, [e1.id, e2.id, n1.id], "left");
    expect(new Set(left.cards.map((c) => c.x))).toEqual(new Set([40]));
    const top = align(ws, [e1.id, e2.id], "top");
    expect(top.cards.find((c) => c.id === e2.id)!.y).toBe(80);
    const spread = align(moveCards(ws, [n1.id], 900, -220), [e1.id, e2.id, n1.id], "distribute-x");
    const xs = [e1.id, e2.id, n1.id].map((id) => spread.cards.find((c) => c.id === id)!);
    expect(xs[1]!.x - (xs[0]!.x + xs[0]!.w)).toBeCloseTo(xs[2]!.x - (xs[1]!.x + xs[1]!.w), 0);
  });

  it("groups cards in a frame that carries them when moved", () => {
    const { ws, e1, n1, e2 } = sample();
    const [next, group] = groupCards(ws, [e1.id, n1.id], "Notice", "issue");
    expect(group).toMatchObject({ title: "Notice", category: "issue" });
    expect(groupOf(next, next.cards.find((c) => c.id === e1.id)!)?.id).toBe(group!.id);
    expect(groupOf(next, next.cards.find((c) => c.id === e2.id)!)).toBeUndefined();
    expect(withMembers(next, [group!.id]).sort()).toEqual([group!.id, e1.id, n1.id].sort());
  });

  it("duplicates cards with their own sources and internal connectors", () => {
    const { ws, e1, n1 } = sample();
    const linked = connect(ws, e1.id, n1.id, "supports")[0];
    const [next, ids] = duplicateCards(linked, [e1.id, n1.id]);
    expect(ids).toHaveLength(2);
    const copy = next.cards.find((c) => c.id === ids[0]) as ExcerptCard;
    expect(copy.sourceId).not.toBe(e1.sourceId);
    expect(next.sources[copy.sourceId]).toMatchObject({ page: 11, quote: "I never received the notice." });
    expect(next.connectors).toHaveLength(2);
  });

  it("round-trips through JSON, defaulting fields missing in older data", () => {
    const { ws } = sample();
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws);
    const old = parseWorkspace(JSON.stringify({ kind: "octogenie-research", version: 1, cards: [{ id: "a", type: "note", x: 0, y: 0, w: 1, h: 1, color: "#fff", text: "" }], connectors: [{ id: "c", from: "a", to: "a" }] }));
    expect(old.cards[0]!.tags).toEqual([]);
    expect(old.connectors[0]!.relation).toBe("related");
    expect(() => parseWorkspace(JSON.stringify({ kind: "octogenie-workspace", version: 1 }))).toThrow();
  });
});

describe("merging cards", () => {
  it("merges a dropped card under the target, edge to edge, keeping each source", async () => {
    const { mergeCards, stackMembers, withMembers } = await import("./index");
    const { ws, e1, e2 } = sample();
    const merged = mergeCards(ws, e1.id, [e2.id], { [e1.id]: 120, [e2.id]: 100 });
    const a = merged.cards.find((c) => c.id === e1.id)!;
    const b = merged.cards.find((c) => c.id === e2.id) as ExcerptCard;
    expect(a.stack).toBeTruthy();
    expect(b.stack).toBe(a.stack);
    expect(b).toMatchObject({ x: a.x, y: a.y + 120 + STACK_GAP, w: a.w });
    expect(stackMembers(merged, a.stack!).map((c) => c.id)).toEqual([e1.id, e2.id]);
    // Both excerpts keep their own source and citation.
    expect(citation(merged, b.sourceId)).toBe("Ex. 4, p. 3");
    // Moving either one moves the whole stack.
    expect(withMembers(merged, [e2.id]).sort()).toEqual([e1.id, e2.id].sort());
  });

  it("adds to an existing stack and merges whole stacks", async () => {
    const { mergeCards, stackMembers } = await import("./index");
    const { ws, e1, e2, n1 } = sample();
    let next = mergeCards(ws, e1.id, [e2.id]);
    next = mergeCards(next, e1.id, [n1.id]);
    const st = next.cards.find((c) => c.id === e1.id)!.stack!;
    expect(stackMembers(next, st).map((c) => c.id)).toEqual([e1.id, e2.id, n1.id]);
    // Groups can't be merged.
    const [withGroup, g] = addGroup(next, { x: 0, y: 0, w: 300, h: 300 }, "Issue");
    expect(mergeCards(withGroup, g.id, [e1.id])).toBe(withGroup);
  });

  it("separates cards; a stack of one dissolves and the rest closes up", async () => {
    const { mergeCards, separateCards, stackMembers } = await import("./index");
    const { ws, e1, e2, n1 } = sample();
    let next = mergeCards(mergeCards(ws, e1.id, [e2.id]), e1.id, [n1.id], { [e1.id]: 100, [e2.id]: 100, [n1.id]: 100 });
    const st = next.cards.find((c) => c.id === e1.id)!.stack!;
    next = separateCards(next, [e2.id], { [e1.id]: 100, [n1.id]: 100 });
    expect(next.cards.find((c) => c.id === e2.id)!.stack).toBeUndefined();
    expect(stackMembers(next, st).map((c) => c.id)).toEqual([e1.id, n1.id]);
    const top = next.cards.find((c) => c.id === e1.id)!;
    expect(next.cards.find((c) => c.id === n1.id)!.y).toBe(top.y + 100 + STACK_GAP);
    next = separateCards(next, [n1.id]);
    expect(next.cards.every((c) => !c.stack)).toBe(true);
  });

  it("round-trips merged cards and duplicates them as a new stack", async () => {
    const { mergeCards } = await import("./index");
    const { ws, e1, e2 } = sample();
    const merged = mergeCards(ws, e1.id, [e2.id]);
    expect(parseWorkspace(serializeWorkspace(merged))).toEqual(merged);
    const [dup, ids] = duplicateCards(merged, [e1.id, e2.id]);
    const copies = dup.cards.filter((c) => ids.includes(c.id));
    expect(copies[0]!.stack).toBe(copies[1]!.stack);
    expect(copies[0]!.stack).not.toBe(merged.cards.find((c) => c.id === e1.id)!.stack);
  });
});

describe("relationships", () => {
  it("lists a card's connections with the card at the other end", async () => {
    const { relationsOf } = await import("./index");
    const { ws, e1, e2, n1 } = sample();
    let next = connect(ws, n1.id, e1.id, "supports")[0];
    next = connect(next, e2.id, n1.id, "contradicts")[0];
    const rel = relationsOf(next, n1.id);
    expect(rel.map((r) => [r.other.id, r.connector.relation])).toEqual([
      [e1.id, "supports"],
      [e2.id, "contradicts"],
    ]);
    expect(relationsOf(next, e1.id).map((r) => r.other.id)).toEqual([n1.id]);
  });

  it("gathers connected cards into a column beside the card, moving merged stacks whole", async () => {
    const { gatherConnected, mergeCards } = await import("./index");
    let { ws, e1, e2, n1 } = sample();
    const [w2, far] = addNote(ws, { x: 2000, y: 1500 }, "far away");
    ws = connect(connect(connect(w2, n1.id, e1.id)[0], n1.id, e2.id)[0], far.id, e2.id)[0];
    ws = mergeCards(ws, e2.id, [far.id], { [e2.id]: 100, [far.id]: 80 });
    const out = gatherConnected(ws, n1.id, { [e1.id]: 120, [e2.id]: 100, [far.id]: 80 });
    const note = out.cards.find((c) => c.id === n1.id)!;
    const a = out.cards.find((c) => c.id === e1.id)!;
    const b = out.cards.find((c) => c.id === e2.id)!;
    const f = out.cards.find((c) => c.id === far.id)!;
    expect(note).toMatchObject({ x: n1.x, y: n1.y });
    expect(a).toMatchObject({ x: n1.x + n1.w + 60, y: n1.y });
    expect(b).toMatchObject({ x: n1.x + n1.w + 60, y: n1.y + 120 + 24 });
    // The merged card travelled with its stack.
    expect(f).toMatchObject({ x: b.x, y: b.y + 100 + STACK_GAP });
    expect(gatherConnected(ws, "nope")).toBe(ws);
  });
});

describe("passage links (document ↔ workspace)", () => {
  it("links a document passage to a card through an annotation, once", async () => {
    const { linkPassage, passageLinksOf } = await import("./index");
    const { ws, n1 } = sample();
    const passage = { documentId: "dep", page: 4, rects: [[72, 500, 300, 514]] as [number, number, number, number][], quote: "the brakes were inspected" };
    const [w1, link] = linkPassage(ws, n1.id, passage, "supports");
    expect(link).toMatchObject({ cardId: n1.id, relation: "supports" });
    const ann = w1.annotations.find((a) => a.id === link!.annotationId)!;
    expect(ann.kind).toBe("underline");
    expect(w1.sources[ann.sourceId]).toMatchObject({ page: 4, quote: "the brakes were inspected", owner: { kind: "annotation", id: ann.id } });
    const listed = passageLinksOf(w1, n1.id);
    expect(listed.map((l) => l.source.quote)).toEqual(["the brakes were inspected"]);
    // Linking the same annotation again doesn't duplicate.
    const [w2, again] = linkPassage(w1, n1.id, { annotationId: ann.id });
    expect(again!.id).toBe(link!.id);
    expect(w2.passageLinks).toHaveLength(1);
    expect(linkPassage(w1, "missing-card", passage)[1]).toBeNull();
  });

  it("drops links when their card or annotation is deleted, and round-trips", async () => {
    const { linkPassage } = await import("./index");
    const { ws, n1, e1 } = sample();
    const p = { documentId: "dep", page: 0, rects: [[1, 1, 2, 2]] as [number, number, number, number][], quote: "x" };
    let [next, l1] = linkPassage(ws, n1.id, p);
    [next] = linkPassage(next, e1.id, p);
    expect(parseWorkspace(serializeWorkspace(next))).toEqual(next);
    expect(deleteItems(next, [n1.id]).passageLinks.map((l) => l.cardId)).toEqual([e1.id]);
    expect(deleteItems(next, [l1!.annotationId]).passageLinks).toHaveLength(1);
    expect(removeDocument(next, "dep").passageLinks).toEqual([]);
  });
});

describe("workspaces, document ink and bookmarks", () => {
  it("adds child workspaces, moves cards (with merged stacks) and shows the path", async () => {
    const { addSheet, moveToSheet, sheetPath, sheetOf, mergeCards, deleteSheet, MAIN_SHEET } = await import("./index");
    const { ws, e1, e2, n1 } = sample();
    expect(ws.sheets.map((s) => s.id)).toEqual([MAIN_SHEET]);
    const [w1, child] = addSheet(ws, "Witness: Smith");
    const [w2, grandchild] = addSheet(w1, "Cross-examination", child.id);
    expect(sheetPath(w2, grandchild.id).map((s) => s.name)).toEqual(["Main workspace", "Witness: Smith", "Cross-examination"]);
    const merged = mergeCards(w2, e1.id, [e2.id]);
    const moved = moveToSheet(merged, [e1.id], child.id);
    // The merged partner travels too; sources are untouched.
    expect([e1.id, e2.id].map((id) => sheetOf(moved.cards.find((c) => c.id === id)!))).toEqual([child.id, child.id]);
    expect(sheetOf(moved.cards.find((c) => c.id === n1.id)!)).toBe(MAIN_SHEET);
    expect(moved.sources).toEqual(merged.sources);
    const back = moveToSheet(moved, [e1.id], MAIN_SHEET);
    expect(back.cards.find((c) => c.id === e1.id)!.sheet).toBeUndefined();
    // Deleting a workspace deletes its children and what's on them.
    const gone = deleteSheet(moved, child.id);
    expect(gone.sheets.map((s) => s.id)).toEqual([MAIN_SHEET]);
    expect(gone.cards.map((c) => c.id)).toEqual([n1.id]);
    expect(deleteSheet(moved, MAIN_SHEET)).toBe(moved);
  });

  it("keeps document ink and bookmarks per document and version", async () => {
    const { addDocInk, addBookmark } = await import("./index");
    const { ws } = sample();
    const [w1, ink] = addDocInk(ws, { documentId: "dep", page: 2, points: [[10, 10], [50, 60]], color: "#dc2626", width: 2, tool: "pen" });
    expect(ink).toMatchObject({ viewFileId: "file-dep", viewRevision: 1, page: 2, tool: "pen" });
    expect(addDocInk(ws, { documentId: "dep", page: 0, points: [[1, 1]], color: "#000", width: 1, tool: "pen" })[1]).toBeNull();
    const [w2, bm] = addBookmark(w1, "dep", 11);
    expect(bm.label).toBe("Page 12");
    expect(addBookmark(w2, "dep", 11)[0]).toBe(w2);
    expect(parseWorkspace(serializeWorkspace(w2))).toEqual(w2);
    expect(deleteItems(w2, [ink!.id, bm.id])).toMatchObject({ docInk: [], bookmarks: [] });
    expect(removeDocument(w2, "dep")).toMatchObject({ docInk: [], bookmarks: [] });
  });

  it("opens older workspaces without the new fields", () => {
    const old = parseWorkspace(JSON.stringify({ kind: "octogenie-research", version: 1, cards: [], connectors: [] }));
    expect(old).toMatchObject({ docInk: [], bookmarks: [], sheets: [{ id: "main", name: "Main workspace", parentId: null }] });
  });
});

describe("history", () => {
  it("undoes and redoes, merging a drag into one step", () => {
    const h = new History<number>();
    h.record(0, "drag", 1000);
    h.record(1, "drag", 1100);
    h.record(2, "drag", 1200);
    h.record(3, null, 1300);
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(0);
    expect(h.undo(0)).toBeNull();
    expect(h.redo(0)).toBe(3);
    expect(h.redo(3)).toBe(4);
  });
});

describe("tags, filters and organizing", () => {
  it("filters by text, tag, document, type and status", () => {
    const { ws, e1, e2, n1 } = sample();
    let next = setTags(ws, e1.id, ["Notice", "Witness: Smith"]);
    next = setTags(next, n1.id, ["Notice"]);
    next = updateCard(next, e2.id, { status: "key" });
    expect(next.tags.map((t) => t.name)).toEqual(["Notice", "Witness: Smith"]);
    expect(filterCards(next, { tags: ["Notice"] }).map((c) => c.id)).toEqual([e1.id, n1.id]);
    expect(filterCards(next, { documentIds: ["ex4"] }).map((c) => c.id)).toEqual([e2.id]);
    expect(filterCards(next, { query: "registered post" }).map((c) => c.id)).toEqual([e2.id]);
    expect(filterCards(next, { query: "ex. 4, p. 3" }).map((c) => c.id)).toEqual([e2.id]);
    expect(filterCards(next, { types: ["note"] }).map((c) => c.id)).toEqual([n1.id]);
    expect(filterCards(next, { statuses: ["key"] }).map((c) => c.id)).toEqual([e2.id]);
  });

  it("organizes by issue, witness, document and tag", () => {
    const { ws, e1, e2, n1 } = sample();
    let next = groupCards(ws, [e1.id, n1.id], "Was notice given?", "issue")[0];
    next = addGroup(next, { x: 320, y: 20, w: 320, h: 300 }, "Smith", "witness")[0];
    next = setTags(next, e2.id, ["Contract"]);
    expect(organize(next, "issue").map((s) => [s.title, s.cards.map((c) => c.id)])).toEqual([
      ["Was notice given?", [e1.id, n1.id]],
      ["Other material", [e2.id]],
    ]);
    expect(organize(next, "witness").map((s) => s.title)).toEqual(["Smith", "Other material"]);
    expect(organize(next, "document").map((s) => s.title)).toEqual(["Smith Deposition", "Ex. 4", "Other material"]);
    expect(organize(next, "tag")[0]).toMatchObject({ title: "Contract" });
  });
});

describe("research summary", () => {
  it("assembles quotes, citations and relationships from the chosen cards only", () => {
    const { ws, e1, e2, n1 } = sample();
    let next = updateCard(ws, e1.id, { text: "Denies receiving notice" });
    next = connect(next, e1.id, e2.id, "contradicts")[0];
    next = connect(next, n1.id, e1.id, "supports")[0];
    next = groupCards(next, [e1.id, e2.id], "Notice", "issue")[0];
    const report = buildReport(next, project, { title: "Notice summary", by: "issue", cardIds: [e1.id, e2.id] });
    expect(report.project).toMatchObject({ caseName: "Smith v. Jones", court: "High Court" });
    expect(report.sections).toHaveLength(1);
    const [first, second] = report.sections[0]!.entries;
    expect(first).toMatchObject({ kind: "excerpt", quote: "I never received the notice.", citation: "Smith Deposition, p. 12", edited: true, text: "Denies receiving notice" });
    expect(first!.contradicts[0]).toContain("Ex. 4, p. 3");
    expect(first!.supports[0]).toBe("Was notice ever posted?");
    expect(second).toMatchObject({ citation: "Ex. 4, p. 3", edited: false });
    expect(report.disclaimer).toMatch(/not verified legal conclusions/);
    expect(JSON.stringify(report)).not.toMatch(/v\. Jones, \d+ /); // no invented reporter citations
  });

  it("flags OCR text and broken sources", () => {
    let { ws, e1 } = sample();
    ws = upsertDocument(ws, { ...ws.documents[0]!, textMode: "ocr" });
    ws = { ...ws, sources: { ...ws.sources, [e1.sourceId]: { ...ws.sources[e1.sourceId]!, status: "broken" } } } as ResearchWorkspace;
    const entry = buildReport(ws, null, { title: "t", by: "document" }).sections[0]!.entries[0]!;
    expect(entry.ocr).toBe(true);
    expect(entry.warning).toMatch(/could not be found/);
  });
});

describe("scale", () => {
  it("handles hundreds of cards and connectors quickly", () => {
    let ws = upsertDocument(emptyWorkspace(), doc("d", "Big.pdf", { pageCount: 800 }));
    for (let i = 0; i < 600; i++) ws = addExcerpt(ws, { documentId: "d", page: i % 800, rects: [[0, 0, 1, 1]], quote: `Passage number ${i} about the contract` }, { x: (i % 30) * 300, y: Math.floor(i / 30) * 200 })[0];
    for (let i = 1; i < 600; i++) ws = connect(ws, ws.cards[i - 1]!.id, ws.cards[i]!.id, "related")[0];
    for (let g = 0; g < 20; g++) ws = addGroup(ws, { x: g * 900, y: 0, w: 900, h: 4000 }, `Issue ${g}`, "issue")[0];
    const t0 = performance.now();
    filterCards(ws, { query: "number 59" });
    organize(ws, "issue");
    buildReport(ws, null, { title: "x", by: "issue" });
    serializeWorkspace(ws);
    // Generous bound: the suite runs alongside other test projects.
    expect(performance.now() - t0).toBeLessThan(4000);
    expect(ws.cards).toHaveLength(620);
  });
});
