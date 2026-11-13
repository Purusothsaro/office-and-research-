import { byPosition, citation, documentLabel } from "./workspace";
import { GROUP_CATEGORIES, REVIEW_STATUSES, type Card, type ExcerptCard, type GroupCard, type NoteCard, type ProjectMeta, type ResearchWorkspace, type ReviewStatus } from "./types";

// ---- Filtering ---------------------------------------------------------------

export interface CardFilter {
  query?: string;
  tags?: string[];
  documentIds?: string[];
  types?: Card["type"][];
  statuses?: ReviewStatus[];
}

export function isFilterActive(f: CardFilter): boolean {
  return !!(f.query?.trim() || f.tags?.length || f.documentIds?.length || f.types?.length || f.statuses?.length);
}

/** Cards matching every given criterion (text matches card text, group titles, quotes and citations). */
export function filterCards(ws: ResearchWorkspace, f: CardFilter): Card[] {
  const q = f.query?.trim().toLowerCase() ?? "";
  return ws.cards.filter((c) => {
    if (f.types?.length && !f.types.includes(c.type)) return false;
    if (f.tags?.length && !f.tags.every((t) => c.tags.includes(t))) return false;
    if (f.statuses?.length && (!c.status || !f.statuses.includes(c.status))) return false;
    if (f.documentIds?.length) {
      if (c.type !== "excerpt") return false;
      const src = ws.sources[c.sourceId];
      if (!src || !f.documentIds.includes(src.documentId)) return false;
    }
    if (q) {
      const hay = [c.type === "group" ? c.title : c.text, c.type === "excerpt" ? `${ws.sources[c.sourceId]?.quote ?? ""} ${citation(ws, c.sourceId)}` : "", c.tags.join(" ")].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---- Organizing --------------------------------------------------------------

export type OrganizeBy = "issue" | "argument" | "witness" | "evidence" | "group" | "document" | "tag" | "status";

export const ORGANIZE_OPTIONS: { id: OrganizeBy; label: string }[] = [
  { id: "group", label: "Workspace groups" },
  { id: "issue", label: "Legal issue" },
  { id: "argument", label: "Argument" },
  { id: "witness", label: "Witness" },
  { id: "evidence", label: "Evidence category" },
  { id: "document", label: "Source document" },
  { id: "tag", label: "Tag" },
  { id: "status", label: "Review status" },
];

export interface Section {
  title: string;
  subtitle?: string;
  cards: (ExcerptCard | NoteCard)[];
}

/** Cards arranged into sections by the chosen dimension. Cards that fit none go to a final section. */
export function organize(ws: ResearchWorkspace, by: OrganizeBy, cardIds?: string[]): Section[] {
  const chosen = new Set(cardIds ?? ws.cards.map((c) => c.id));
  const points = ws.cards.filter((c): c is ExcerptCard | NoteCard => c.type !== "group" && chosen.has(c.id)).sort(byPosition);
  const sections = new Map<string, Section>();
  const add = (key: string, title: string, card: ExcerptCard | NoteCard, subtitle?: string) => {
    const s = sections.get(key) ?? { title, ...(subtitle ? { subtitle } : {}), cards: [] };
    if (!s.cards.includes(card)) s.cards.push(card);
    sections.set(key, s);
  };
  const order: string[] = [];
  const groups = ws.cards.filter((c): c is GroupCard => c.type === "group").sort(byPosition);
  if (by === "group" || by === "issue" || by === "argument" || by === "witness" || by === "evidence") {
    for (const g of groups) if (by === "group" || g.category === by) order.push(`g:${g.id}`);
  }
  if (by === "document") for (const d of ws.documents) order.push(`d:${d.id}`);
  if (by === "tag") for (const t of ws.tags) order.push(`t:${t.name}`);
  if (by === "status") for (const s of REVIEW_STATUSES) order.push(`s:${s.id}`);
  const loose: Section = { title: "Other material", cards: [] };
  for (const card of points) {
    let placed = false;
    if (by === "group" || by === "issue" || by === "argument" || by === "witness" || by === "evidence") {
      // Walk out through nested frames to find one of the wanted category.
      for (const g of groups.filter((g) => g.category === by || by === "group").sort((a, b) => a.w * a.h - b.w * b.h)) {
        const c = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
        if (c.x >= g.x && c.x <= g.x + g.w && c.y >= g.y && c.y <= g.y + g.h) {
          const cat = GROUP_CATEGORIES.find((k) => k.id === g.category)?.label;
          add(`g:${g.id}`, g.title.trim() || `Untitled ${cat?.toLowerCase() ?? "group"}`, card, by === "group" ? cat : undefined);
          placed = true;
          break;
        }
      }
    } else if (by === "document" && card.type === "excerpt") {
      const src = ws.sources[card.sourceId];
      const doc = ws.documents.find((d) => d.id === src?.documentId);
      if (doc) {
        add(`d:${doc.id}`, documentLabel(doc), card);
        placed = true;
      }
    } else if (by === "tag") {
      for (const t of card.tags) {
        add(`t:${t}`, t, card);
        placed = true;
      }
    } else if (by === "status" && card.status) {
      add(`s:${card.status}`, REVIEW_STATUSES.find((s) => s.id === card.status)?.label ?? card.status, card);
      placed = true;
    }
    if (!placed) loose.cards.push(card);
  }
  const result = order.flatMap((k) => (sections.has(k) ? [sections.get(k)!] : []));
  for (const [k, s] of sections) if (!order.includes(k)) result.push(s);
  if (by === "document") for (const s of result) s.cards.sort((a, b) => pageOf(ws, a) - pageOf(ws, b));
  if (loose.cards.length) result.push(loose);
  return result;
}

const pageOf = (ws: ResearchWorkspace, c: ExcerptCard | NoteCard) => (c.type === "excerpt" ? (ws.sources[c.sourceId]?.page ?? 0) : 0);

// ---- Research summary --------------------------------------------------------

export const DISCLAIMER =
  "Prepared with OctoGenie Research. Quotations are reproduced from the listed source documents and cited by document and page. They are not verified legal conclusions, and text recognised by OCR may contain errors. Check every quotation against its source before relying on it.";

export interface ReportEntry {
  kind: "excerpt" | "note";
  /** The card text (for excerpts, the user's possibly edited wording). */
  text: string;
  /** For excerpts: the passage exactly as captured from the source. */
  quote?: string;
  citation?: string;
  /** True when the card text differs from the captured passage. */
  edited?: boolean;
  /** Text recognised by OCR rather than embedded in the file. */
  ocr?: boolean;
  /** Source mapping needs checking after a document was replaced. */
  warning?: string;
  tags: string[];
  status?: string;
  supports: string[];
  contradicts: string[];
  references: string[];
}

export interface Report {
  title: string;
  project: Pick<ProjectMeta, "caseName" | "reference" | "court" | "jurisdiction" | "description"> | null;
  sections: { title: string; subtitle?: string; entries: ReportEntry[] }[];
  sources: { name: string; format: string; pages: number; textMode: string }[];
  disclaimer: string;
}

const shortText = (ws: ResearchWorkspace, id: string): string => {
  const c = ws.cards.find((x) => x.id === id);
  if (!c) return "";
  if (c.type === "group") return c.title || "Untitled group";
  const t = c.text.replace(/\s+/g, " ").trim();
  const head = t.length > 90 ? `${t.slice(0, 87)}…` : t;
  return c.type === "excerpt" ? `“${head}” (${citation(ws, c.sourceId)})` : head;
};

/** A summary assembled only from the user's cards; nothing is generated or inferred. */
export function buildReport(ws: ResearchWorkspace, project: ProjectMeta | null, opts: { title: string; by: OrganizeBy; cardIds?: string[] }): Report {
  const sections = organize(ws, opts.by, opts.cardIds).map((s) => ({
    title: s.title,
    ...(s.subtitle ? { subtitle: s.subtitle } : {}),
    entries: s.cards.map((card): ReportEntry => {
      const rel = (r: string) => ws.connectors.filter((l) => l.relation === r && (l.from === card.id || l.to === card.id)).map((l) => shortText(ws, l.from === card.id ? l.to : l.from)).filter(Boolean);
      const status = card.status ? REVIEW_STATUSES.find((s) => s.id === card.status)?.label : undefined;
      const base = { tags: card.tags, ...(status ? { status } : {}), supports: rel("supports"), contradicts: rel("contradicts"), references: rel("references") };
      if (card.type === "note") return { kind: "note", text: card.text.trim(), ...base };
      const src = ws.sources[card.sourceId];
      const doc = ws.documents.find((d) => d.id === src?.documentId);
      const quote = src?.quote ?? "";
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      return {
        kind: "excerpt",
        text: card.text,
        quote,
        citation: citation(ws, card.sourceId),
        edited: norm(card.text) !== norm(quote),
        ocr: doc?.textMode === "ocr",
        ...(src?.status === "broken" ? { warning: "The source document was replaced and this passage could not be found in the new version." } : src?.status === "moved" ? { warning: src.note ?? "The passage moved in a replaced version of the document." } : {}),
        ...base,
      };
    }),
  }));
  return {
    title: opts.title,
    project: project ? { caseName: project.caseName, reference: project.reference, court: project.court, jurisdiction: project.jurisdiction, description: project.description } : null,
    sections: sections.filter((s) => s.entries.length),
    sources: ws.documents.map((d) => ({ name: d.name, format: d.format.toUpperCase(), pages: d.pageCount, textMode: d.textMode })),
    disclaimer: DISCLAIMER,
  };
}

