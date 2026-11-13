import type { PdfRect } from "../model/types";

/** A run of text on a page with its box in PDF space (from pdf.js text content). */
export interface TextRun {
  str: string;
  /** Baseline origin and size in PDF user space. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** A line break follows this run. */
  eol: boolean;
}

export interface PageIndex {
  /** 0-based page index. */
  page: number;
  /** Page text: runs joined, with a space at line ends. */
  text: string;
  /** For each character of `text`: [run index, offset in run], or [-1, -1] for inserted separators. */
  map: Int32Array;
  runs: TextRun[];
}

/** Extracted text of one version of a document's viewer PDF. */
export interface DocumentIndex {
  documentId: string;
  viewFileId: string;
  viewRevision: number;
  pages: PageIndex[];
}

/** Cache key: indexes are tied to an exact file revision. */
export const indexKey = (viewFileId: string, viewRevision: number) => `${viewFileId}@${viewRevision}`;

interface PdfJsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

/** Converts pdf.js text content items into a page index. */
export function pageIndexFromItems(page: number, items: unknown[]): PageIndex {
  const runs: TextRun[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
    const it = raw as PdfJsTextItem;
    const [, , c = 0, d = 0, x = 0, y = 0] = it.transform;
    runs.push({ str: it.str, x, y, w: it.width, h: it.height || Math.hypot(c, d) || 10, eol: !!it.hasEOL });
  }
  return buildPageIndex(page, runs);
}

export function buildPageIndex(page: number, runs: TextRun[]): PageIndex {
  let text = "";
  const map: number[] = [];
  runs.forEach((run, i) => {
    for (let o = 0; o < run.str.length; o++) {
      text += run.str[o];
      map.push(i, o);
    }
    // Lines are joined by a space so phrases match across line breaks.
    const next = runs[i + 1];
    if (run.eol || (next && Math.abs(next.y - run.y) > Math.max(2, run.h * 0.5) && !/\s$/.test(run.str))) {
      text += " ";
      map.push(-1, -1);
    }
  });
  return { page, text, map: Int32Array.from(map), runs };
}

/** Rectangles (PDF space) covering characters [start, end) of the page text, one per run. */
export function rectsFor(p: PageIndex, start: number, end: number): PdfRect[] {
  const byRun = new Map<number, [number, number]>();
  for (let i = Math.max(0, start); i < Math.min(end, p.text.length); i++) {
    const run = p.map[i * 2]!;
    const off = p.map[i * 2 + 1]!;
    if (run < 0) continue;
    const r = byRun.get(run);
    byRun.set(run, r ? [r[0], off + 1] : [off, off + 1]);
  }
  const rects: PdfRect[] = [];
  for (const [i, [a, b]] of byRun) {
    const run = p.runs[i]!;
    const len = run.str.length || 1;
    rects.push([run.x + (run.w * a) / len, run.y - run.h * 0.22, run.x + (run.w * b) / len, run.y + run.h * 0.92]);
  }
  return mergeLines(rects);
}

/** Joins rectangles on the same line that touch. */
export function mergeLines(rects: PdfRect[]): PdfRect[] {
  const sorted = [...rects].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const out: PdfRect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - r[1]) < 3 && r[0] <= last[2] + 6) {
      last[2] = Math.max(last[2], r[2]);
      last[3] = Math.max(last[3], r[3]);
    } else out.push([...r]);
  }
  return out;
}

// ---- Matching ----------------------------------------------------------------

/** Lower-cased text with whitespace runs collapsed, plus a map back to original offsets. */
function normalize(text: string): { norm: string; back: number[] } {
  let norm = "";
  const back: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (!space && norm.length) {
        norm += " ";
        back.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    // Typographic quotes and dashes match their plain forms.
    norm += ch.toLowerCase().replace(/[‘’]/, "'").replace(/[“”]/, '"').replace(/[–—]/, "-");
    back.push(i);
  }
  return { norm, back };
}

const cache = new WeakMap<PageIndex, ReturnType<typeof normalize>>();
const normalized = (p: PageIndex) => {
  let n = cache.get(p);
  if (!n) cache.set(p, (n = normalize(p.text)));
  return n;
};

/** All occurrences of `query` on the page as [start, end) offsets in the page text. */
export function findAll(p: PageIndex, query: string, opts: { wholeWord?: boolean } = {}): [number, number][] {
  const needle = normalize(query).norm.trim();
  if (!needle) return [];
  const { norm, back } = normalized(p);
  const out: [number, number][] = [];
  for (let i = norm.indexOf(needle); i >= 0; i = norm.indexOf(needle, i + 1)) {
    if (opts.wholeWord && (/\w/.test(norm[i - 1] ?? "") || /\w/.test(norm[i + needle.length] ?? ""))) continue;
    out.push([back[i]!, back[i + needle.length - 1]! + 1]);
  }
  return out;
}

/**
 * Matches ignoring all whitespace: browser selections over a PDF text layer can
 * drop or add spaces between text runs, which mustn't break anchoring.
 */
function findCompact(p: PageIndex, quote: string): [number, number][] {
  const { norm, back } = normalized(p);
  let compact = "";
  const map: number[] = [];
  for (let i = 0; i < norm.length; i++) {
    if (norm[i] === " ") continue;
    compact += norm[i];
    map.push(back[i]!);
  }
  const needle = normalize(quote).norm.replace(/ /g, "");
  if (!needle) return [];
  const out: [number, number][] = [];
  for (let i = compact.indexOf(needle); i >= 0; i = compact.indexOf(needle, i + 1)) out.push([map[i]!, map[i + needle.length - 1]! + 1]);
  return out;
}

/** Where a captured passage is on the page, preferring the occurrence nearest `near`. */
export function findQuote(p: PageIndex, quote: string, near?: number): [number, number] | null {
  let hits = findAll(p, quote);
  if (!hits.length) hits = findCompact(p, quote);
  if (!hits.length) return null;
  if (near === undefined) return hits[0]!;
  return hits.reduce((best, h) => (Math.abs(h[0] - near) < Math.abs(best[0] - near) ? h : best));
}

// ---- Search ------------------------------------------------------------------

export interface SearchHit {
  documentId: string;
  page: number;
  start: number;
  end: number;
  before: string;
  match: string;
  after: string;
}

export interface SearchOptions {
  documentIds?: string[];
  wholeWord?: boolean;
  /** Stop after this many hits (default 500). */
  limit?: number;
}

/** Full-text search across document indexes, in document then page order. */
export function search(indexes: DocumentIndex[], query: string, opts: SearchOptions = {}): { hits: SearchHit[]; truncated: boolean } {
  const limit = opts.limit ?? 500;
  const hits: SearchHit[] = [];
  if (query.trim().length < 2) return { hits, truncated: false };
  for (const idx of indexes) {
    if (opts.documentIds?.length && !opts.documentIds.includes(idx.documentId)) continue;
    for (const p of idx.pages) {
      for (const [s, e] of findAll(p, query, opts)) {
        if (hits.length >= limit) return { hits, truncated: true };
        const before = p.text.slice(Math.max(0, s - 60), s);
        const after = p.text.slice(e, e + 60);
        hits.push({ documentId: idx.documentId, page: p.page, start: s, end: e, before: (s > 60 ? "…" : "") + before.trimStart(), match: p.text.slice(s, e), after: after.trimEnd() + (e + 60 < p.text.length ? "…" : "") });
      }
    }
  }
  return { hits, truncated: false };
}

/** Text of the page with little or no extractable text — a likely scan. */
export function looksScanned(pages: PageIndex[]): boolean {
  if (!pages.length) return false;
  const sparse = pages.filter((p) => p.text.replace(/\s/g, "").length < 15).length;
  return sparse / pages.length >= 0.5;
}

// ---- Serialization (for the local cache) -------------------------------------

export function toPlain(idx: DocumentIndex) {
  return { ...idx, pages: idx.pages.map((p) => ({ page: p.page, runs: p.runs })) };
}

export function fromPlain(data: ReturnType<typeof toPlain>): DocumentIndex {
  return { ...data, pages: data.pages.map((p) => buildPageIndex(p.page, p.runs)) };
}

// ---- Anchors -----------------------------------------------------------------

/** The page text of [start, end) with whitespace tidied: the canonical captured quote. */
export const textOf = (p: PageIndex, start: number, end: number) => p.text.slice(start, end).replace(/\s+/g, " ").trim();

const compactText = (s: string) => normalize(s).norm.replace(/ /g, "");

/**
 * Builds a precise anchor from a browser selection on a page: offsets, the
 * canonical text and per-line rectangles from the page's text index.
 * Returns null if the selected text can't be found on that page.
 */
export function anchorSelection(p: PageIndex, selected: string, near?: number): { start: number; end: number; quote: string; rects: PdfRect[] } | null {
  const at = findQuote(p, selected, near);
  if (!at) return null;
  return { start: at[0], end: at[1], quote: textOf(p, at[0], at[1]), rects: rectsFor(p, at[0], at[1]) };
}

export type AnchorCheck =
  | { state: "valid"; start: number; end: number; rects: PdfRect[] }
  /** The same text found elsewhere on the same page (stored offsets were stale). */
  | { state: "relocated"; start: number; end: number; rects: PdfRect[] }
  | { state: "invalid" };

/**
 * Checks that a stored anchor still points at its captured text on its page.
 * It never looks on other pages: a passage is only highlighted where it is
 * verified to be, so an excerpt can't be silently redirected to unrelated text.
 */
export function validateAnchor(anchor: { page: number; quote: string; start?: number; end?: number }, page: PageIndex | undefined): AnchorCheck {
  if (!page || page.page !== anchor.page) return { state: "invalid" };
  if (anchor.start !== undefined && anchor.end !== undefined && anchor.end <= page.text.length && compactText(page.text.slice(anchor.start, anchor.end)) === compactText(anchor.quote)) {
    return { state: "valid", start: anchor.start, end: anchor.end, rects: rectsFor(page, anchor.start, anchor.end) };
  }
  const at = findQuote(page, anchor.quote, anchor.start);
  if (!at) return { state: "invalid" };
  return { state: anchor.start === undefined ? "valid" : "relocated", start: at[0], end: at[1], rects: rectsFor(page, at[0], at[1]) };
}
