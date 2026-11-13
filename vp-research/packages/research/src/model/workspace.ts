import type {
  Annotation,
  AnnotationKind,
  Card,
  Connector,
  ExcerptCard,
  GroupCard,
  GroupCategory,
  NoteCard,
  PassageLink,
  Sheet,
  DocInk,
  Bookmark,
  PdfRect,
  Relation,
  ResearchDocument,
  ResearchWorkspace,
  SourceRef,
} from "./types";
import { MAIN_SHEET } from "./types";

export const CARD_COLORS = ["#fef3c7", "#dbeafe", "#dcfce7", "#fee2e2", "#ede9fe", "#ffedd5", "#ffffff"];
export const GROUP_COLORS = ["#7c3aed", "#2563eb", "#0d9488", "#d97706", "#db2777", "#475569"];
export const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#93c5fd", "#fca5a5", "#d8b4fe"];
export const TAG_COLORS = ["#7c3aed", "#2563eb", "#0d9488", "#d97706", "#db2777", "#475569", "#16a34a", "#dc2626"];

export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 12);

export function emptyWorkspace(): ResearchWorkspace {
  return { kind: "octogenie-research", version: 1, documents: [], sources: {}, cards: [], connectors: [], passageLinks: [], annotations: [], ink: [], docInk: [], bookmarks: [], sheets: [{ id: MAIN_SHEET, name: "Main workspace", parentId: null }], tags: [], collapsed: {}, view: { x: 0, y: 0, zoom: 1 }, reader: { open: [], active: null, pages: {} } };
}

export function parseWorkspace(bytes: Uint8Array | string): ResearchWorkspace {
  const data = JSON.parse(typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes)) as Partial<ResearchWorkspace>;
  if (data.kind !== "octogenie-research" || data.version !== 1) throw new Error("This is not a research workspace.");
  const base = emptyWorkspace();
  return {
    ...base,
    ...data,
    documents: data.documents ?? [],
    sources: data.sources ?? {},
    cards: (data.cards ?? []).map((c) => ({ ...c, tags: c.tags ?? [] })),
    connectors: (data.connectors ?? []).map((c) => ({ ...c, relation: c.relation ?? "related" })),
    passageLinks: data.passageLinks ?? [],
    annotations: (data.annotations ?? []).map((a) => ({ ...a, tags: a.tags ?? [] })),
    ink: data.ink ?? [],
    docInk: data.docInk ?? [],
    bookmarks: data.bookmarks ?? [],
    sheets: data.sheets?.length ? data.sheets : [{ id: MAIN_SHEET, name: "Main workspace", parentId: null }],
    tags: data.tags ?? [],
    collapsed: data.collapsed ?? {},
    view: data.view ?? base.view,
    reader: { open: data.reader?.open ?? [], active: data.reader?.active ?? null, pages: data.reader?.pages ?? {} },
  };
}

export const serializeWorkspace = (ws: ResearchWorkspace) => new TextEncoder().encode(JSON.stringify(ws));

// ---- Citations -------------------------------------------------------------

export function documentLabel(doc: ResearchDocument | undefined): string {
  return doc?.short?.trim() || doc?.name.replace(/\.(pdf|docx|txt|md)$/i, "") || "Unknown document";
}

/** "Smith Deposition, p. 12" — built only from the document name and page; never invented. */
export function citation(ws: ResearchWorkspace, sourceId: string): string {
  const src = ws.sources[sourceId];
  if (!src) return "Source missing";
  const doc = ws.documents.find((d) => d.id === src.documentId);
  return `${documentLabel(doc)}, p. ${src.page + 1}`;
}

// ---- Geometry --------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const centerOf = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Where the line from the box centre towards `to` leaves the box (so connectors attach to edges). */
export function edgePoint(b: Box, to: { x: number; y: number }): { x: number; y: number } {
  const c = centerOf(b);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? b.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? b.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** End points of a connector between two boxes, attached to their facing edges. */
export function connectorEnds(a: Box, b: Box) {
  const p = edgePoint(a, centerOf(b));
  const q = edgePoint(b, centerOf(a));
  return { x1: p.x, y1: p.y, x2: q.x, y2: q.y, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
}

const contains = (g: Box, c: { x: number; y: number }) => c.x >= g.x && c.x <= g.x + g.w && c.y >= g.y && c.y <= g.y + g.h;

/** The innermost group frame containing the card's centre. */
export function groupOf(ws: ResearchWorkspace, card: Card): GroupCard | undefined {
  if (card.type === "group") return undefined;
  const c = centerOf(card);
  return ws.cards
    .filter((g): g is GroupCard => g.type === "group" && contains(g, c))
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}

export function membersOf(ws: ResearchWorkspace, group: GroupCard): Card[] {
  return ws.cards.filter((c) => c.type !== "group" && groupOf(ws, c)?.id === group.id);
}

/** Reading order on the canvas: top to bottom, then left to right. */
export const byPosition = (a: Box, b: Box) => (Math.abs(a.y - b.y) > 20 ? a.y - b.y : a.x - b.x);

export function bounds(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** A free spot near `at` that doesn't overlap existing cards (simple downward scan). */
export function freeSpot(ws: ResearchWorkspace, at: { x: number; y: number }, size: { w: number; h: number }): { x: number; y: number } {
  const overlaps = (x: number, y: number) => ws.cards.some((c) => c.type !== "group" && x < c.x + c.w + 12 && x + size.w + 12 > c.x && y < c.y + c.h + 12 && y + size.h + 12 > c.y);
  // Down the column first (like a list of notes), then the next column.
  for (let i = 0; i < 60; i++) {
    const x = at.x + Math.floor(i / 6) * (size.w + 24);
    const y = at.y + (i % 6) * (size.h + 24);
    if (!overlaps(x, y)) return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: Math.round(at.x), y: Math.round(at.y) };
}

// ---- Edits (pure: each returns a new workspace) ----------------------------

const now = () => Date.now();

export interface PassageInput {
  documentId: string;
  page: number;
  rects: PdfRect[];
  quote: string;
  start?: number;
  end?: number;
  /** A region of the page captured with the lasso. */
  area?: boolean;
}

export function addSource(ws: ResearchWorkspace, p: PassageInput): [ResearchWorkspace, SourceRef] {
  const doc = ws.documents.find((d) => d.id === p.documentId);
  if (!doc) throw new Error("Unknown document.");
  const src: SourceRef = {
    id: newId(),
    documentId: doc.id,
    viewFileId: doc.viewFileId,
    viewRevision: doc.viewRevision,
    sourceRevision: doc.revision,
    page: p.page,
    rects: p.rects.map((r) => [...r] as PdfRect),
    quote: p.quote,
    ...(p.start !== undefined && p.end !== undefined ? { start: p.start, end: p.end } : {}),
    ...(p.area ? { area: true } : {}),
    status: "ok",
  };
  return [{ ...ws, sources: { ...ws.sources, [src.id]: src } }, src];
}

export function addExcerpt(ws: ResearchWorkspace, p: PassageInput, at?: { x: number; y: number }): [ResearchWorkspace, ExcerptCard] {
  const [next, src] = addSource(ws, p);
  const h = Math.min(260, 84 + Math.ceil(p.quote.length / 38) * 17);
  const spot = at ?? freeSpot(next, { x: 40, y: 40 }, { w: 260, h });
  const t = now();
  const card: ExcerptCard = { id: newId(), type: "excerpt", x: Math.round(spot.x), y: Math.round(spot.y), w: 260, h, color: "#ffffff", tags: [], sourceId: src.id, text: p.quote, createdAt: t, updatedAt: t };
  const sources = { ...next.sources, [src.id]: { ...src, owner: { kind: "excerpt" as const, id: card.id } } };
  return [{ ...next, sources, cards: [...next.cards, card] }, card];
}

export function addNote(ws: ResearchWorkspace, at: { x: number; y: number }, text = "", color = CARD_COLORS[0]!): [ResearchWorkspace, NoteCard] {
  const t = now();
  const card: NoteCard = { id: newId(), type: "note", x: Math.round(at.x), y: Math.round(at.y), w: 220, h: 130, color, tags: [], text, createdAt: t, updatedAt: t };
  return [{ ...ws, cards: [...ws.cards, card] }, card];
}

export function addGroup(ws: ResearchWorkspace, box: Box, title = "", category: GroupCategory = "issue"): [ResearchWorkspace, GroupCard] {
  const t = now();
  const color = GROUP_COLORS[ws.cards.filter((c) => c.type === "group").length % GROUP_COLORS.length]!;
  const card: GroupCard = { id: newId(), type: "group", ...roundBox(box), color, tags: [], title, category, createdAt: t, updatedAt: t };
  // Groups sit behind other cards.
  return [{ ...ws, cards: [card, ...ws.cards] }, card];
}

const roundBox = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });

/** Wraps the given cards in a new group frame. */
export function groupCards(ws: ResearchWorkspace, ids: string[], title = "", category: GroupCategory = "issue"): [ResearchWorkspace, GroupCard | null] {
  const b = bounds(ws.cards.filter((c) => ids.includes(c.id) && c.type !== "group"));
  if (!b) return [ws, null];
  return addGroup(ws, { x: b.x - 24, y: b.y - 52, w: b.w + 48, h: b.h + 76 }, title, category);
}

export function updateCard(ws: ResearchWorkspace, id: string, patch: Partial<Omit<ExcerptCard, "type" | "id" | "sourceId">> & Partial<Pick<GroupCard, "title" | "category">>): ResearchWorkspace {
  return { ...ws, cards: ws.cards.map((c) => (c.id === id ? ({ ...c, ...patch, updatedAt: now() } as Card) : c)) };
}

export function moveCards(ws: ResearchWorkspace, ids: string[], dx: number, dy: number): ResearchWorkspace {
  const set = new Set(ids);
  return { ...ws, cards: ws.cards.map((c) => (set.has(c.id) ? { ...c, x: Math.round(c.x + dx), y: Math.round(c.y + dy) } : c)) };
}

export function resizeCard(ws: ResearchWorkspace, id: string, w: number, h: number): ResearchWorkspace {
  return { ...ws, cards: ws.cards.map((c) => (c.id === id ? { ...c, w: Math.max(c.type === "group" ? 200 : 140, Math.round(w)), h: Math.max(c.type === "group" ? 120 : 60, Math.round(h)) } : c)) };
}

/** Ids that move with the given selection: group frames carry their members. */
export function withMembers(ws: ResearchWorkspace, ids: string[]): string[] {
  const out = new Set(ids);
  for (const id of ids) {
    const g = ws.cards.find((c) => c.id === id);
    if (g?.type === "group") for (const m of ws.cards) if (m.type !== "group" && contains(g, centerOf(m))) out.add(m.id);
  }
  // Merged cards travel together.
  const stacks = new Set(ws.cards.filter((c) => out.has(c.id) && c.stack).map((c) => c.stack));
  for (const c of ws.cards) if (c.stack && stacks.has(c.stack)) out.add(c.id);
  return [...out];
}

// ---- Merging (stacks) ----------------------------------------------------------

/** Space between merged cards, bridged by a "liquid" joint when drawn. */
export const STACK_GAP = 36;

/** The cards of a stack, top to bottom. */
export function stackMembers(ws: ResearchWorkspace, stack: string): Card[] {
  return ws.cards.filter((c) => c.stack === stack).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Excerpts and notes can be merged; group frames can't. */
export const canMerge = (c: Card | undefined): boolean => !!c && c.type !== "group";

/**
 * Re-packs a stack edge to edge in one column under its top card, using each
 * card's rendered height when given (cards grow with their text).
 */
export function layoutStack(ws: ResearchWorkspace, stack: string, heights: Record<string, number> = {}): ResearchWorkspace {
  const members = stackMembers(ws, stack);
  if (!members.length) return ws;
  const top = members[0]!;
  let y = top.y;
  const pos = new Map<string, { x: number; y: number; w: number }>();
  for (const m of members) {
    pos.set(m.id, { x: top.x, y, w: top.w });
    y += Math.round(heights[m.id] ?? m.h) + STACK_GAP;
  }
  let changed = false;
  const cards = ws.cards.map((c) => {
    const p = pos.get(c.id);
    if (!p || (p.x === c.x && p.y === c.y && p.w === c.w)) return c;
    changed = true;
    return { ...c, ...p };
  });
  return changed ? { ...ws, cards } : ws;
}

/**
 * Merges the dropped cards into the target's stack (creating one if needed),
 * below the target's stack, in their current top-to-bottom order.
 */
export function mergeCards(ws: ResearchWorkspace, targetId: string, ids: string[], heights: Record<string, number> = {}): ResearchWorkspace {
  const target = ws.cards.find((c) => c.id === targetId);
  if (!canMerge(target)) return ws;
  const stack = target!.stack ?? newId();
  const incomingStacks = new Set(ws.cards.filter((c) => ids.includes(c.id) && c.stack).map((c) => c.stack));
  const moving = ws.cards.filter((c) => c.id !== targetId && canMerge(c) && (ids.includes(c.id) || (c.stack && incomingStacks.has(c.stack))) && c.stack !== stack);
  if (!moving.length) return ws;
  const existing = target!.stack ? stackMembers(ws, stack) : [target!];
  const bottom = existing[existing.length - 1]!;
  // Place the incoming cards just below the current bottom so layout keeps their order.
  let y = bottom.y + 1;
  const order = [...moving].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = new Map(order.map((c) => [c.id, (y += 1)]));
  const cards = ws.cards.map((c) => {
    if (c.id === target!.id) return { ...c, stack };
    if (placed.has(c.id)) return { ...c, stack, y: placed.get(c.id)! };
    return c;
  });
  return layoutStack({ ...ws, cards }, stack, heights);
}

/** Takes cards out of their stacks. The rest of each stack closes up; a stack of one dissolves. */
export function separateCards(ws: ResearchWorkspace, ids: string[], heights: Record<string, number> = {}): ResearchWorkspace {
  const affected = new Set(ws.cards.filter((c) => ids.includes(c.id) && c.stack).map((c) => c.stack!));
  if (!affected.size) return ws;
  let i = 0;
  let next: ResearchWorkspace = {
    ...ws,
    cards: ws.cards.map((c) => {
      if (!ids.includes(c.id) || !c.stack) return c;
      const { stack: _stack, ...rest } = c;
      // Step the separated cards out to the right so they're visibly apart.
      return { ...rest, x: c.x + c.w + 40, y: c.y + 24 * i++ } as Card;
    }),
  };
  for (const s of affected) {
    const left = stackMembers(next, s);
    if (left.length === 1) {
      next = { ...next, cards: next.cards.map((c) => (c.id === left[0]!.id ? ({ ...(({ stack: _s, ...r }) => r)(c) } as Card) : c)) };
    } else next = layoutStack(next, s, heights);
  }
  return next;
}


export function connect(ws: ResearchWorkspace, from: string, to: string, relation: Relation = "related", label?: string): [ResearchWorkspace, Connector | null] {
  if (from === to || !ws.cards.some((c) => c.id === from) || !ws.cards.some((c) => c.id === to)) return [ws, null];
  const existing = ws.connectors.find((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
  if (existing) return [ws, existing];
  const c: Connector = { id: newId(), from, to, relation, ...(label ? { label } : {}) };
  return [{ ...ws, connectors: [...ws.connectors, c] }, c];
}

export function updateConnector(ws: ResearchWorkspace, id: string, patch: Partial<Pick<Connector, "relation" | "label">>): ResearchWorkspace {
  return { ...ws, connectors: ws.connectors.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

/** Removes cards, connectors and ink; sources no longer used by anything are dropped too. */
export function deleteItems(ws: ResearchWorkspace, ids: string[]): ResearchWorkspace {
  const set = new Set(ids);
  const cards = ws.cards.filter((c) => !set.has(c.id));
  const alive = new Set(cards.map((c) => c.id));
  const next = {
    ...ws,
    cards,
    connectors: ws.connectors.filter((l) => !set.has(l.id) && alive.has(l.from) && alive.has(l.to)),
    ink: ws.ink.filter((s) => !set.has(s.id)),
    annotations: ws.annotations.filter((a) => !set.has(a.id)),
    docInk: (ws.docInk ?? []).filter((s) => !set.has(s.id)),
    bookmarks: (ws.bookmarks ?? []).filter((b) => !set.has(b.id)),
  };
  const annotationsLeft = new Set(next.annotations.map((a) => a.id));
  next.passageLinks = (ws.passageLinks ?? []).filter((l) => !set.has(l.id) && alive.has(l.cardId) && annotationsLeft.has(l.annotationId));
  return pruneSources(next);
}

export function pruneSources(ws: ResearchWorkspace): ResearchWorkspace {
  const used = new Set([...ws.cards.flatMap((c) => (c.type === "excerpt" ? [c.sourceId] : [])), ...ws.annotations.map((a) => a.sourceId)]);
  const sources = Object.fromEntries(Object.entries(ws.sources).filter(([id]) => used.has(id)));
  return Object.keys(sources).length === Object.keys(ws.sources).length ? ws : { ...ws, sources };
}

/** Copies cards (offset), with their own copies of sources and the connectors between them. */
export function duplicateCards(ws: ResearchWorkspace, ids: string[]): [ResearchWorkspace, string[]] {
  const map = new Map<string, string>();
  const stackMap = new Map<string, string>();
  const sources = { ...ws.sources };
  const t = now();
  const copies = ws.cards
    .filter((c) => ids.includes(c.id))
    .map((c) => {
      const id = newId();
      map.set(c.id, id);
      if (c.stack && !stackMap.has(c.stack)) stackMap.set(c.stack, newId());
      const stackPatch = c.stack ? { stack: stackMap.get(c.stack)! } : {};
      c = { ...c, ...stackPatch } as Card;
      if (c.type === "excerpt") {
        const sid = newId();
        sources[sid] = { ...ws.sources[c.sourceId]!, id: sid, owner: { kind: "excerpt", id } };
        return { ...c, id, sourceId: sid, x: c.x + 30, y: c.y + 30, createdAt: t, updatedAt: t };
      }
      return { ...c, id, x: c.x + 30, y: c.y + 30, createdAt: t, updatedAt: t };
    });
  const links = ws.connectors.filter((l) => map.has(l.from) && map.has(l.to)).map((l) => ({ ...l, id: newId(), from: map.get(l.from)!, to: map.get(l.to)! }));
  return [{ ...ws, sources, cards: [...ws.cards, ...copies], connectors: [...ws.connectors, ...links] }, copies.map((c) => c.id)];
}

export type AlignMode = "left" | "right" | "top" | "bottom" | "center-x" | "center-y" | "distribute-x" | "distribute-y";

export function align(ws: ResearchWorkspace, ids: string[], mode: AlignMode): ResearchWorkspace {
  const sel = ws.cards.filter((c) => ids.includes(c.id));
  const b = bounds(sel);
  if (!b || sel.length < 2) return ws;
  const pos = new Map<string, { x: number; y: number }>();
  if (mode === "distribute-x" || mode === "distribute-y") {
    const horiz = mode === "distribute-x";
    const sorted = [...sel].sort((p, q) => (horiz ? p.x - q.x : p.y - q.y));
    const total = sorted.reduce((s, c) => s + (horiz ? c.w : c.h), 0);
    const gap = ((horiz ? b.w : b.h) - total) / (sorted.length - 1);
    let cursor = horiz ? b.x : b.y;
    for (const c of sorted) {
      pos.set(c.id, horiz ? { x: cursor, y: c.y } : { x: c.x, y: cursor });
      cursor += (horiz ? c.w : c.h) + gap;
    }
  } else {
    for (const c of sel) {
      const p = { x: c.x, y: c.y };
      if (mode === "left") p.x = b.x;
      if (mode === "right") p.x = b.x + b.w - c.w;
      if (mode === "top") p.y = b.y;
      if (mode === "bottom") p.y = b.y + b.h - c.h;
      if (mode === "center-x") p.x = b.x + b.w / 2 - c.w / 2;
      if (mode === "center-y") p.y = b.y + b.h / 2 - c.h / 2;
      pos.set(c.id, p);
    }
  }
  return { ...ws, cards: ws.cards.map((c) => (pos.has(c.id) ? { ...c, x: Math.round(pos.get(c.id)!.x), y: Math.round(pos.get(c.id)!.y) } : c)) };
}

// ---- Tags ------------------------------------------------------------------

export function ensureTag(ws: ResearchWorkspace, name: string): ResearchWorkspace {
  const clean = name.trim().slice(0, 40);
  if (!clean || ws.tags.some((t) => t.name.toLowerCase() === clean.toLowerCase())) return ws;
  return { ...ws, tags: [...ws.tags, { name: clean, color: TAG_COLORS[ws.tags.length % TAG_COLORS.length]! }] };
}

export function setTags(ws: ResearchWorkspace, id: string, tags: string[]): ResearchWorkspace {
  const clean = [...new Set(tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))];
  let next = clean.reduce(ensureTag, ws);
  next = { ...next, cards: next.cards.map((c) => (c.id === id ? { ...c, tags: clean, updatedAt: now() } : c)), annotations: next.annotations.map((a) => (a.id === id ? { ...a, tags: clean, updatedAt: now() } : a)) };
  return next;
}

// ---- Annotations -----------------------------------------------------------

export function addAnnotation(ws: ResearchWorkspace, kind: AnnotationKind, p: PassageInput, color: string, note?: string): [ResearchWorkspace, Annotation] {
  const [next, src] = addSource(ws, p);
  const t = now();
  const a: Annotation = { id: newId(), kind, sourceId: src.id, color, tags: [], ...(note !== undefined ? { note } : {}), createdAt: t, updatedAt: t };
  const sources = { ...next.sources, [src.id]: { ...src, owner: { kind: "annotation" as const, id: a.id } } };
  return [{ ...next, sources, annotations: [...next.annotations, a] }, a];
}

export function updateAnnotation(ws: ResearchWorkspace, id: string, patch: Partial<Pick<Annotation, "color" | "note" | "status" | "kind">>): ResearchWorkspace {
  return { ...ws, annotations: ws.annotations.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: now() } : a)) };
}

// ---- Documents -------------------------------------------------------------

export function upsertDocument(ws: ResearchWorkspace, doc: ResearchDocument): ResearchWorkspace {
  const exists = ws.documents.some((d) => d.id === doc.id);
  return { ...ws, documents: exists ? ws.documents.map((d) => (d.id === doc.id ? doc : d)) : [...ws.documents, doc] };
}

/** Removes a document from the project with everything that points into it. */
export function removeDocument(ws: ResearchWorkspace, documentId: string): ResearchWorkspace {
  const dead = new Set(Object.values(ws.sources).filter((s) => s.documentId === documentId).map((s) => s.id));
  const cardIds = ws.cards.filter((c) => c.type === "excerpt" && dead.has(c.sourceId)).map((c) => c.id);
  const next = deleteItems({ ...ws, documents: ws.documents.filter((d) => d.id !== documentId), annotations: ws.annotations.filter((a) => !dead.has(a.sourceId)) }, cardIds);
  const collapsed = { ...next.collapsed };
  delete collapsed[documentId];
  return { ...next, collapsed, docInk: next.docInk.filter((s) => s.documentId !== documentId), bookmarks: next.bookmarks.filter((b) => b.documentId !== documentId) };
}

/**
 * Recovery for a broken or moved anchor: the user selects the passage again in
 * the current version. The source keeps its id (so cards and annotations stay
 * linked); its quote becomes exactly the text the user selected.
 */
export function relinkSource(ws: ResearchWorkspace, sourceId: string, p: PassageInput): ResearchWorkspace {
  const src = ws.sources[sourceId];
  const doc = ws.documents.find((d) => d.id === p.documentId);
  if (!src || !doc) return ws;
  const { note: _note, start: _start, end: _end, ...rest } = src;
  const next: SourceRef = {
    ...rest,
    documentId: doc.id,
    viewFileId: doc.viewFileId,
    viewRevision: doc.viewRevision,
    sourceRevision: doc.revision,
    page: p.page,
    rects: p.rects.map((r) => [...r] as PdfRect),
    quote: p.quote,
    status: "ok",
    ...(p.start !== undefined && p.end !== undefined ? { start: p.start, end: p.end } : {}),
  };
  return { ...ws, sources: { ...ws.sources, [sourceId]: next } };
}

/** Flags an anchor that no longer matches its document. It keeps pointing at the revision it was captured in. */
export function markBroken(ws: ResearchWorkspace, sourceId: string, note: string): ResearchWorkspace {
  const src = ws.sources[sourceId];
  if (!src || src.status === "broken") return ws;
  return { ...ws, sources: { ...ws.sources, [sourceId]: { ...src, status: "broken", note } } };
}

/** Sources (and so excerpts/annotations) whose mapping needs the user's attention. */
export function brokenSources(ws: ResearchWorkspace): SourceRef[] {
  return Object.values(ws.sources).filter((s) => s.status === "broken" || s.status === "moved");
}

// ---- Relationships ---------------------------------------------------------------

export interface Relationship {
  connector: Connector;
  /** The card at the other end. */
  other: Card;
}

/** Everything a card is connected to, in canvas reading order of the other cards. */
export function relationsOf(ws: ResearchWorkspace, id: string): Relationship[] {
  const byId = new Map(ws.cards.map((c) => [c.id, c]));
  return ws.connectors
    .filter((l) => l.from === id || l.to === id)
    .map((l) => ({ connector: l, other: byId.get(l.from === id ? l.to : l.from)! }))
    .filter((r) => !!r.other)
    .sort((a, b) => byPosition(a.other, b.other));
}

/**
 * Gathers a card's connected cards into a column beside it (merged stacks move
 * as a unit), keeping their reading order. Nothing else moves.
 */
export function gatherConnected(ws: ResearchWorkspace, id: string, heights: Record<string, number> = {}): ResearchWorkspace {
  const anchor = ws.cards.find((c) => c.id === id);
  if (!anchor) return ws;
  const h = (c: Card) => heights[c.id] ?? c.h;
  const done = new Set<string>([id, ...(anchor.stack ? ws.cards.filter((c) => c.stack === anchor.stack).map((c) => c.id) : [])]);
  // Units: a whole merged stack, or a single card.
  const units: Card[][] = [];
  const unitHeight = (u: Card[]) => u.reduce((s, c) => s + h(c), 0) + (u.length - 1) * STACK_GAP;
  for (const r of relationsOf(ws, id)) {
    if (done.has(r.other.id) || r.other.type === "group") continue;
    const unit = r.other.stack ? ws.cards.filter((c) => c.stack === r.other.stack).sort((a, b) => a.y - b.y) : [r.other];
    unit.forEach((c) => done.add(c.id));
    units.push(unit);
  }
  if (!units.length) return ws;
  const x = anchor.x + anchor.w + 60;
  let y = anchor.y;
  const delta = new Map<string, { dx: number; dy: number }>();
  for (const unit of units) {
    const top = unit[0]!;
    for (const c of unit) delta.set(c.id, { dx: x - top.x, dy: y - top.y });
    y += unitHeight(unit) + 24;
  }
  return { ...ws, cards: ws.cards.map((c) => (delta.has(c.id) ? { ...c, x: Math.round(c.x + delta.get(c.id)!.dx), y: Math.round(c.y + delta.get(c.id)!.dy) } : c)) };
}

// ---- Links between document passages and cards -----------------------------------

/**
 * Links a passage in a document to a card. A new annotation (an underline in the
 * link colour) marks the passage, unless an existing annotation is given.
 */
export function linkPassage(ws: ResearchWorkspace, cardId: string, passage: PassageInput | { annotationId: string }, relation: Relation = "related"): [ResearchWorkspace, PassageLink | null] {
  if (!ws.cards.some((c) => c.id === cardId)) return [ws, null];
  let next = ws;
  let annotationId: string;
  if ("annotationId" in passage) {
    if (!ws.annotations.some((a) => a.id === passage.annotationId)) return [ws, null];
    annotationId = passage.annotationId;
  } else {
    const [w, a] = addAnnotation(ws, "underline", passage, "#7056e8");
    next = w;
    annotationId = a.id;
  }
  const existing = (next.passageLinks ?? []).find((l) => l.annotationId === annotationId && l.cardId === cardId);
  if (existing) return [next, existing];
  const link: PassageLink = { id: newId(), annotationId, cardId, relation };
  return [{ ...next, passageLinks: [...(next.passageLinks ?? []), link] }, link];
}

export function updatePassageLink(ws: ResearchWorkspace, id: string, patch: Partial<Pick<PassageLink, "relation" | "label">>): ResearchWorkspace {
  return { ...ws, passageLinks: (ws.passageLinks ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Passage links that end at a card, with the linked annotation and its source. */
export function passageLinksOf(ws: ResearchWorkspace, cardId: string): { link: PassageLink; annotation: Annotation; source: SourceRef }[] {
  return (ws.passageLinks ?? []).flatMap((link) => {
    if (link.cardId !== cardId) return [];
    const annotation = ws.annotations.find((a) => a.id === link.annotationId);
    const source = annotation ? ws.sources[annotation.sourceId] : undefined;
    return annotation && source ? [{ link, annotation, source }] : [];
  });
}

// ---- Workspaces (sheets) -----------------------------------------------------------

export const sheetOf = (c: { sheet?: string }) => c.sheet ?? MAIN_SHEET;

export function addSheet(ws: ResearchWorkspace, name: string, parentId: string | null = MAIN_SHEET): [ResearchWorkspace, Sheet] {
  const sheet: Sheet = { id: newId(), name: name.trim().slice(0, 80) || "Untitled workspace", parentId };
  return [{ ...ws, sheets: [...ws.sheets, sheet] }, sheet];
}

export function renameSheet(ws: ResearchWorkspace, id: string, name: string): ResearchWorkspace {
  return { ...ws, sheets: ws.sheets.map((s) => (s.id === id ? { ...s, name: name.trim().slice(0, 80) || s.name } : s)) };
}

/** A workspace and its ancestors, from the main workspace down (for breadcrumbs). */
export function sheetPath(ws: ResearchWorkspace, id: string): Sheet[] {
  const out: Sheet[] = [];
  let cur = ws.sheets.find((s) => s.id === id);
  while (cur && out.length < 20) {
    out.unshift(cur);
    cur = cur.parentId ? ws.sheets.find((s) => s.id === cur!.parentId) : undefined;
  }
  return out;
}

/**
 * Moves cards (with their merged stack mates) to another workspace, keeping
 * their sources and arrangement. They're placed from the top-left of that
 * workspace's existing content. Connections to cards left behind are kept.
 */
export function moveToSheet(ws: ResearchWorkspace, ids: string[], sheet: string): ResearchWorkspace {
  const stacks = new Set(ws.cards.filter((c) => ids.includes(c.id) && c.stack).map((c) => c.stack));
  const moving = ws.cards.filter((c) => ids.includes(c.id) || (c.stack && stacks.has(c.stack)));
  if (!moving.length) return ws;
  const b = bounds(moving)!;
  const there = ws.cards.filter((c) => sheetOf(c) === sheet && !moving.includes(c));
  const tb = bounds(there);
  const dx = (tb ? tb.x : 40) - b.x;
  const dy = (tb ? tb.y + tb.h + 60 : 40) - b.y;
  const set = new Set(moving.map((c) => c.id));
  return { ...ws, cards: ws.cards.map((c) => (set.has(c.id) ? { ...c, sheet: sheet === MAIN_SHEET ? undefined : sheet, x: Math.round(c.x + dx), y: Math.round(c.y + dy) } : c)).map((c) => (c.sheet === undefined ? (({ sheet: _s, ...r }) => r as Card)(c) : c)) };
}

/** Deletes a workspace and its child workspaces with everything on them. */
export function deleteSheet(ws: ResearchWorkspace, id: string): ResearchWorkspace {
  if (id === MAIN_SHEET) return ws;
  const doomed = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of ws.sheets) {
      if (s.parentId && doomed.has(s.parentId) && !doomed.has(s.id)) {
        doomed.add(s.id);
        grew = true;
      }
    }
  }
  const cards = ws.cards.filter((c) => doomed.has(sheetOf(c))).map((c) => c.id);
  const ink = ws.ink.filter((s) => doomed.has(sheetOf(s))).map((s) => s.id);
  const next = deleteItems(ws, [...cards, ...ink]);
  return { ...next, sheets: next.sheets.filter((s) => !doomed.has(s.id)) };
}

// ---- Document ink and bookmarks ------------------------------------------------

export function addDocInk(ws: ResearchWorkspace, stroke: Omit<DocInk, "id" | "createdAt" | "viewFileId" | "viewRevision">): [ResearchWorkspace, DocInk | null] {
  const doc = ws.documents.find((d) => d.id === stroke.documentId);
  if (!doc || stroke.points.length < 2) return [ws, null];
  const ink: DocInk = { ...stroke, id: newId(), viewFileId: doc.viewFileId, viewRevision: doc.viewRevision, createdAt: now() };
  return [{ ...ws, docInk: [...ws.docInk, ink] }, ink];
}

export function addBookmark(ws: ResearchWorkspace, documentId: string, page: number, label?: string): [ResearchWorkspace, Bookmark] {
  const existing = ws.bookmarks.find((b) => b.documentId === documentId && b.page === page);
  if (existing) return [ws, existing];
  const bm: Bookmark = { id: newId(), documentId, page, label: label?.trim() || `Page ${page + 1}`, createdAt: now() };
  return [{ ...ws, bookmarks: [...ws.bookmarks, bm].sort((a, b) => a.documentId.localeCompare(b.documentId) || a.page - b.page) }, bm];
}
