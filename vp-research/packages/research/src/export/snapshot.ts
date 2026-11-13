import { bounds, centerOf, citation, connectorEnds } from "../model/workspace";
import { RELATIONS, type ProjectMeta, type ResearchWorkspace } from "../model/types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Wraps text to lines of at most `chars` characters, up to `max` lines. */
function wrap(text: string, chars: number, max: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > chars && line) {
      lines.push(line);
      line = w;
      if (lines.length === max) break;
    } else line = (line + " " + w).trim();
  }
  if (lines.length < max && line) lines.push(line);
  if (lines.length === max && words.join(" ").length > lines.join(" ").length) lines[max - 1] = `${lines[max - 1]!.slice(0, chars - 1)}…`;
  return lines;
}

/**
 * The workspace arrangement as a standalone SVG image: groups, cards (with
 * citations) and labelled connectors. Text is escaped; nothing is scripted.
 */
export function workspaceSvg(ws: ResearchWorkspace): string {
  const box = bounds([...ws.cards, ...ws.ink.flatMap((s) => s.points.map(([x, y]) => ({ x, y, w: 1, h: 1 })))]) ?? { x: 0, y: 0, w: 400, h: 300 };
  const pad = 40;
  const vb = `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`;
  const parts: string[] = [];
  const byId = new Map(ws.cards.map((c) => [c.id, c]));
  for (const g of ws.cards) {
    if (g.type !== "group") continue;
    parts.push(`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="14" fill="${g.color}14" stroke="${g.color}" stroke-width="2"/>`);
    parts.push(`<text x="${g.x + 14}" y="${g.y + 26}" font-size="15" font-weight="700" fill="${g.color}">${esc(g.title || "Untitled group")}</text>`);
  }
  for (const l of ws.connectors) {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b) continue;
    const e = connectorEnds(a, b);
    const rel = RELATIONS.find((r) => r.id === l.relation) ?? RELATIONS[3]!;
    parts.push(`<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${rel.color}" stroke-width="2"${rel.dash ? ` stroke-dasharray="${rel.dash}"` : ""} marker-end="url(#arrow-${rel.id})"/>`);
    const label = l.label?.trim() || rel.label;
    parts.push(`<g><rect x="${e.mx - label.length * 3.4 - 8}" y="${e.my - 10}" width="${label.length * 6.8 + 16}" height="20" rx="10" fill="#fff" stroke="${rel.color}"/><text x="${e.mx}" y="${e.my + 4}" font-size="11" text-anchor="middle" fill="${rel.color}">${esc(label)}</text></g>`);
  }
  for (const s of ws.ink) parts.push(`<polyline points="${s.points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const c of ws.cards) {
    if (c.type === "group") continue;
    const fill = c.type === "excerpt" ? "#ffffff" : c.color;
    parts.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="8" fill="${fill}" stroke="#cbd5e1"/>`);
    const chars = Math.max(10, Math.floor((c.w - 24) / 6.4));
    const maxLines = Math.max(1, Math.floor((c.h - (c.type === "excerpt" ? 40 : 20)) / 15));
    const lines = wrap(c.text || (c.type === "note" ? "(empty note)" : ""), chars, maxLines);
    if (c.type === "excerpt") parts.push(`<rect x="${c.x}" y="${c.y}" width="4" height="${c.h}" fill="#7c3aed"/>`);
    lines.forEach((line, i) => parts.push(`<text x="${c.x + 12}" y="${c.y + 22 + i * 15}" font-size="11.5"${c.type === "excerpt" ? ' font-style="italic"' : ""} fill="#0f172a">${esc(line)}</text>`));
    if (c.type === "excerpt") parts.push(`<text x="${c.x + 12}" y="${c.y + c.h - 10}" font-size="10.5" font-weight="600" fill="#6d28d9">${esc(citation(ws, c.sourceId))}</text>`);
  }
  const markers = RELATIONS.map((r) => `<marker id="arrow-${r.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${r.color}"/></marker>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${Math.round(box.w + pad * 2)}" height="${Math.round(box.h + pad * 2)}" font-family="Helvetica, Arial, sans-serif"><defs>${markers}</defs><rect x="${box.x - pad}" y="${box.y - pad}" width="${box.w + pad * 2}" height="${box.h + pad * 2}" fill="#f8fafc"/>${parts.join("")}</svg>`;
}

export const PROJECT_EXPORT_FORMAT = "octogenie-research-export";

/**
 * Project data in the documented export format (docs/EXPORT_FORMAT.md):
 * case details, document list, sources, cards, connectors, annotations and tags.
 * Document files themselves are not included.
 */
export function exportProjectData(project: ProjectMeta, ws: ResearchWorkspace, exportedAt = new Date()) {
  return {
    format: PROJECT_EXPORT_FORMAT,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    project: { name: project.name, caseName: project.caseName, reference: project.reference, court: project.court, jurisdiction: project.jurisdiction, description: project.description, revision: project.revision },
    documents: ws.documents.map((d) => ({ id: d.id, name: d.name, short: d.short ?? null, format: d.format, pageCount: d.pageCount, textMode: d.textMode, fileId: d.fileId, revision: d.revision, viewFileId: d.viewFileId, viewRevision: d.viewRevision })),
    sources: Object.values(ws.sources).map((s) => ({ ...s, citation: citation(ws, s.id) })),
    cards: ws.cards.map((c) => ({ ...c, center: centerOf(c) })),
    connectors: ws.connectors,
    passageLinks: ws.passageLinks ?? [],
    annotations: ws.annotations,
    tags: ws.tags,
    ink: ws.ink,
    view: ws.view,
  };
}
