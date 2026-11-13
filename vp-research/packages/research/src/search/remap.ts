import type { ResearchDocument, ResearchWorkspace, SourceRef } from "../model/types";
import { findQuote, rectsFor, type DocumentIndex } from "./text-index";

export interface RemapReport {
  ok: number;
  moved: number;
  broken: number;
}

/**
 * After a document is replaced by a new version, finds each captured passage
 * again in the new text. Passages found on the same page stay "ok", ones found
 * elsewhere become "moved", and ones not found become "broken" — those keep
 * pointing at the old revision so the original passage can still be opened.
 */
export function remapSources(ws: ResearchWorkspace, doc: ResearchDocument, next: DocumentIndex): { ws: ResearchWorkspace; report: RemapReport } {
  const report: RemapReport = { ok: 0, moved: 0, broken: 0 };
  const sources: Record<string, SourceRef> = { ...ws.sources };
  for (const src of Object.values(ws.sources)) {
    if (src.documentId !== doc.id) continue;
    const samePage = next.pages[src.page];
    const here = samePage ? findQuote(samePage, src.quote, src.start) : null;
    if (here && samePage) {
      sources[src.id] = { ...src, viewFileId: next.viewFileId, viewRevision: next.viewRevision, rects: rectsFor(samePage, here[0], here[1]), start: here[0], end: here[1], status: "ok" };
      delete sources[src.id]!.note;
      report.ok++;
      continue;
    }
    let found: { page: number; at: [number, number] } | null = null;
    for (const p of next.pages) {
      const at = findQuote(p, src.quote);
      if (at) {
        found = { page: p.page, at };
        break;
      }
    }
    if (found) {
      const p = next.pages[found.page]!;
      sources[src.id] = {
        ...src,
        viewFileId: next.viewFileId,
        viewRevision: next.viewRevision,
        page: found.page,
        rects: rectsFor(p, found.at[0], found.at[1]),
        start: found.at[0],
        end: found.at[1],
        status: "moved",
        note: `Moved from p. ${src.page + 1} to p. ${found.page + 1} in the new version.`,
      };
      report.moved++;
    } else {
      sources[src.id] = { ...src, status: "broken", note: `Not found in the new version. Showing the passage in revision ${src.viewRevision} of the document.` };
      report.broken++;
    }
  }
  return { ws: { ...ws, sources }, report };
}

/** Accepts a moved source as correct, clearing its warning. */
export function acknowledgeSource(ws: ResearchWorkspace, sourceId: string): ResearchWorkspace {
  const src = ws.sources[sourceId];
  if (!src || src.status !== "moved") return ws;
  const { note: _note, ...rest } = src;
  return { ...ws, sources: { ...ws.sources, [sourceId]: { ...rest, status: "ok" } } };
}
