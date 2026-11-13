/** A rectangle on a PDF page in PDF user space: [x1, y1, x2, y2]. */
export type PdfRect = [number, number, number, number];

export interface WorkspaceDocument {
  /** Id of a PDF in the user's files. */
  fileId: string;
  /** Name shown in citations (kept even if the file is renamed later). */
  name: string;
  /** Short label for citations, e.g. "Smith Dep." */
  short?: string;
}

interface ItemBase {
  id: string;
  /** Position and size on the canvas, in canvas units (px at zoom 1). */
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/** Text pulled out of a document, linked back to where it came from. */
export interface ExcerptItem extends ItemBase {
  type: "excerpt";
  fileId: string;
  /** 0-based page index in the source PDF. */
  page: number;
  rects: PdfRect[];
  text: string;
}

export interface NoteItem extends ItemBase {
  type: "note";
  text: string;
}

/** A titled frame; items inside it belong to this issue. */
export interface GroupItem extends ItemBase {
  type: "group";
  title: string;
}

export type WorkspaceItem = ExcerptItem | NoteItem | GroupItem;

export interface Link {
  id: string;
  from: string;
  to: string;
}

/** A highlight or comment on a passage of a document (shown in the document). */
export interface Annotation {
  id: string;
  kind: "highlight" | "comment";
  fileId: string;
  page: number;
  rects: PdfRect[];
  /** The highlighted or commented passage. */
  text: string;
  color: string;
  /** Comment body (comments only). */
  note?: string;
  createdAt: number;
}

/** A freehand pen stroke on the canvas, in canvas units. */
export interface InkStroke {
  id: string;
  points: [number, number][];
  color: string;
  width: number;
}

export interface Workspace {
  kind: "octogenie-workspace";
  version: 1;
  documents: WorkspaceDocument[];
  items: WorkspaceItem[];
  links: Link[];
  annotations?: Annotation[];
  ink?: InkStroke[];
  /** Collapsed page indexes per document (pages hidden to bring distant passages together). */
  collapsed?: Record<string, number[]>;
  view: { x: number; y: number; zoom: number };
}

export const ITEM_COLORS = ["#fde68a", "#bfdbfe", "#bbf7d0", "#fecaca", "#e9d5ff", "#fed7aa"];

export const newId = () => Math.random().toString(36).slice(2, 10);

export function emptyWorkspace(): Workspace {
  return { kind: "octogenie-workspace", version: 1, documents: [], items: [], links: [], annotations: [], ink: [], collapsed: {}, view: { x: 0, y: 0, zoom: 1 } };
}

export function parseWorkspace(bytes: Uint8Array): Workspace {
  const data = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Workspace>;
  if (data.kind !== "octogenie-workspace" || data.version !== 1) throw new Error("Not a case workspace.");
  return { ...emptyWorkspace(), ...data, documents: data.documents ?? [], items: data.items ?? [], links: data.links ?? [], annotations: data.annotations ?? [], ink: data.ink ?? [], collapsed: data.collapsed ?? {} } as Workspace;
}

export const serializeWorkspace = (ws: Workspace) => new TextEncoder().encode(JSON.stringify(ws));

/** "Smith Deposition, p. 12" style citation. */
export function citation(ws: Workspace, item: ExcerptItem): string {
  const doc = ws.documents.find((d) => d.fileId === item.fileId);
  const name = doc?.short || doc?.name.replace(/\.pdf$/i, "") || "Document";
  return `${name}, p. ${item.page + 1}`;
}

export function passageCitation(ws: Workspace, fileId: string, page: number): string {
  const doc = ws.documents.find((d) => d.fileId === fileId);
  return `${doc?.short || doc?.name.replace(/\.pdf$/i, "") || "Document"}, p. ${page + 1}`;
}

/** Groups consecutive collapsed pages into ranges, e.g. [3,4,5,9] → [[3,5],[9,9]]. */
export function collapsedRanges(pages: number[]): [number, number][] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && p === last[1] + 1) last[1] = p;
    else out.push([p, p]);
  }
  return out;
}

/** The group an item sits in: the smallest group frame containing the item's centre. */
export function groupOf(ws: Workspace, item: WorkspaceItem): GroupItem | undefined {
  if (item.type === "group") return undefined;
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  return ws.items
    .filter((g): g is GroupItem => g.type === "group" && cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}

/** Reading order on the canvas: top to bottom, then left to right. */
export const byPosition = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.abs(a.y - b.y) > 20 ? a.y - b.y : a.x - b.x);

export interface OutlineSection {
  title: string;
  group: GroupItem | null;
  items: (ExcerptItem | NoteItem)[];
}

/** Groups in canvas order, each with its excerpts and notes; ungrouped items last. */
export function outline(ws: Workspace): OutlineSection[] {
  const groups = ws.items.filter((i): i is GroupItem => i.type === "group").sort(byPosition);
  const sections: OutlineSection[] = groups.map((g) => ({ title: g.title || "Untitled issue", group: g, items: [] }));
  const loose: OutlineSection = { title: groups.length ? "Other points" : "Points", group: null, items: [] };
  for (const item of ws.items) {
    if (item.type === "group") continue;
    const g = groupOf(ws, item);
    (g ? sections[groups.indexOf(g)]! : loose).items.push(item);
  }
  for (const s of sections) s.items.sort(byPosition);
  loose.items.sort(byPosition);
  return [...sections, ...(loose.items.length ? [loose] : [])];
}
