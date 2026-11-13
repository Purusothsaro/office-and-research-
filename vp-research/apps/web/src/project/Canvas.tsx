import {
  canMerge,
  citation,
  connectorEnds,
  layoutStack,
  mergeCards,
  relationsOf,
  separateCards,
  sheetOf,
  stackMembers,
  STACK_GAP,
  GROUP_CATEGORIES,
  newId,
  RELATIONS,
  REVIEW_STATUSES,
  withMembers,
  type Card,
  type ExcerptCard,
  type GroupCard,
  type ResearchWorkspace,
} from "@octo/research";
import { AlertTriangle, ArrowUpRight, Check, Link2, MessageSquare, PenLine } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PASSAGE_MIME, type Passage } from "./Viewer";

export type CanvasMode = "select" | "connect" | "pen";

export type LinkStart = { kind: "card"; id: string } | { kind: "annotation"; id: string };

export type Update = (fn: (ws: ResearchWorkspace) => ResearchWorkspace, key?: string | null, opts?: { history?: boolean }) => void;

export interface CanvasProps {
  ws: ResearchWorkspace;
  selected: string[];
  setSelected: (ids: string[]) => void;
  mode: CanvasMode;
  setMode: (m: CanvasMode) => void;
  /** Relationship used for new connections. */
  relation: (typeof RELATIONS)[number]["id"];
  pen: { color: string; width: number };
  /** Ids that match the active filter (others are dimmed); null when no filter. */
  matches: Set<string> | null;
  focus: { id: string; nonce: number } | null;
  editing: string | null;
  setEditing: (id: string | null) => void;
  update: Update;
  onOpenSource: (card: ExcerptCard) => void;
  onDropPassage: (p: Passage, at: { x: number; y: number }) => void;
  onContextMenu: (target: { kind: "card"; id: string } | { kind: "connector"; id: string } | { kind: "canvas"; at: { x: number; y: number } }, client: { x: number; y: number }) => void;
  onAddNote: (at: { x: number; y: number }) => void;
  /** Cards whose source passage is hovered or selected in the reader. */
  linkedIds: Set<string>;
  onHoverCard: (id: string | null) => void;
  /** Start re-linking a broken excerpt to a new selection. */
  onRelink: (card: ExcerptCard) => void;
  /** Accept a passage that moved in a replaced document. */
  onAcceptSource: (card: ExcerptCard) => void;
  /** A card was tapped or clicked (not dragged). */
  onTapCard: (card: Card) => void;
  /** Where a connection being made starts: a card, or a passage in the reader. Shared with the reader. */
  linkStart: LinkStart | null;
  setLinkStart: (s: LinkStart | null) => void;
  /** Link a passage (an annotation) to a card. */
  onLinkPassage: (annotationId: string, cardId: string) => void;
  /** A passage dragged from the reader was dropped onto a card: link it to that card. */
  onDropPassageOnCard: (p: Passage, cardId: string) => void;
  /** The workspace (sheet) shown. */
  sheet: string;
  /** Eraser tool: clicking ink removes it. */
  erasing: boolean;
  /** Images of lasso (area) excerpts, by source id. */
  areaImages: Map<string, string>;
  /** Reports the canvas element size, for fitting and centring. */
  onResize?: (size: { w: number; h: number }) => void;
}

const statusOf = (id?: string) => REVIEW_STATUSES.find((s) => s.id === id);

interface CardViewProps {
  card: Card;
  ws: ResearchWorkspace;
  areaImage?: string | undefined;
  selected: boolean;
  /** Where the card sits in a merged stack, if it's in one. */
  stackPos?: "first" | "middle" | "last" | undefined;
  mergeTarget: boolean;
  /** Colour of the relationship to the selected card, if this card is connected to it. */
  related?: string | undefined;
  linked: boolean;
  onHover: (id: string | null) => void;
  onRelink: (card: ExcerptCard) => void;
  onAcceptSource: (card: ExcerptCard) => void;
  dim: boolean;
  flash: boolean;
  editing: boolean;
  onPointerDown: (e: React.PointerEvent, card: Card) => void;
  onResizeDown: (e: React.PointerEvent, card: Card) => void;
  setEditing: (id: string | null) => void;
  update: Update;
  onOpenSource: (card: ExcerptCard) => void;
  onContextMenu: (e: React.MouseEvent, card: Card) => void;
}

const CardView = memo(function CardView({ card, ws, areaImage, selected, stackPos, mergeTarget, related, linked, onHover, onRelink, onAcceptSource, dim, flash, editing, onPointerDown, onResizeDown, setEditing, update, onOpenSource, onContextMenu }: CardViewProps) {
  const setText = (patch: Partial<{ text: string; title: string }>) => update((w) => ({ ...w, cards: w.cards.map((c) => (c.id === card.id ? ({ ...c, ...patch, updatedAt: Date.now() } as Card) : c)) }), `text:${card.id}`);
  const status = statusOf(card.status);
  const tags = card.tags.length ? (
    <div className="flex flex-wrap gap-1">
      {card.tags.map((t) => (
        <span key={t} className="rounded px-1.5 text-[10.5px] font-medium text-white" style={{ background: ws.tags.find((x) => x.name === t)?.color ?? "#64748b" }}>
          {t}
        </span>
      ))}
    </div>
  ) : null;
  const common = {
    "data-card-id": card.id,
    "data-selected": selected,
    "data-dim": dim,
    "data-flash": flash,
    "data-linked": linked,
    "data-stack": stackPos,
    "data-merge-target": mergeTarget || undefined,
    "data-related": related ? "true" : undefined,
    onMouseEnter: () => onHover(card.id),
    onMouseLeave: () => onHover(null),
    onPointerDown: (e: React.PointerEvent) => onPointerDown(e, card),
    onContextMenu: (e: React.MouseEvent) => onContextMenu(e, card),
  };
  const resize = (
    <>
      {card.comment && (
        <span className="rs-card-comment" title={card.comment} aria-label={`Comment: ${card.comment}`} role="note">
          <MessageSquare className="size-3" aria-hidden /> {card.comment.length > 40 ? `${card.comment.slice(0, 38)}…` : card.comment}
        </span>
      )}
      <span className="rs-resize" data-no-drag onPointerDown={(e) => onResizeDown(e, card)} aria-hidden />
    </>
  );
  const fontSize = card.fontSize ? { fontSize: card.fontSize } : undefined;

  if (card.type === "group") {
    const cat = GROUP_CATEGORIES.find((c) => c.id === card.category);
    return (
      <div {...common} className="rs-group" role="group" aria-label={`${cat?.label ?? "Group"}: ${card.title || "Untitled"}`} style={{ ...(related ? ({ "--rel": related } as React.CSSProperties) : {}), left: card.x, top: card.y, width: card.w, height: card.h, borderColor: card.color, background: `${card.color}0f` }}>
        <div className="flex items-center gap-2 rounded-t-[13px] px-3 py-1.5" style={{ background: `${card.color}1f` }}>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase" style={{ background: card.color }}>
            {cat?.label ?? "Group"}
          </span>
          <input
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-slate-400"
            style={{ color: card.color }}
            aria-label="Group title"
            value={card.title}
            placeholder="Name this group"
            onChange={(e) => setText({ title: e.target.value })}
          />
          {status && (
            <span className="rounded-full px-2 text-[10.5px] font-semibold text-white" style={{ background: status.color }}>
              {status.label}
            </span>
          )}
        </div>
        {tags && <div className="px-3 pt-1">{tags}</div>}
        {resize}
      </div>
    );
  }

  if (card.type === "excerpt") {
    const src = ws.sources[card.sourceId];
    const doc = ws.documents.find((d) => d.id === src?.documentId);
    const edited = src && card.text.replace(/\s+/g, " ").trim() !== src.quote.replace(/\s+/g, " ").trim();
    const unavailable = !src || !doc || doc.status === "error";
    return (
      <div {...common} className="rs-card" role="article" aria-label={`Excerpt from ${citation(ws, card.sourceId)}`} style={{ ...(related ? ({ "--rel": related } as React.CSSProperties) : {}), left: card.x, top: card.y, width: card.w, minHeight: card.h, background: card.color, borderLeft: "4px solid #7056e8" }}>
        <div className="flex items-center gap-1.5 px-2.5 pt-2">
          <button type="button" className="inline-flex min-w-0 items-center gap-1 rounded px-1 text-[11.5px] font-semibold text-brand-700 hover:bg-brand-50" onClick={() => onOpenSource(card)} title="Open the source passage" aria-label={`Open source: ${citation(ws, card.sourceId)}`}>
            <span className="truncate">{citation(ws, card.sourceId)}</span>
            <ArrowUpRight className="size-3 shrink-0" aria-hidden />
          </button>
          {doc?.textMode === "ocr" && <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">OCR</span>}
          {(src?.status === "broken" || src?.status === "moved") && (
            <span title={src.note} className="text-amber-600" aria-label={src.note}>
              <AlertTriangle className="size-3.5" aria-hidden />
            </span>
          )}
          {status && (
            <span className="ml-auto rounded-full px-2 text-[10.5px] font-semibold text-white" style={{ background: status.color }}>
              {status.label}
            </span>
          )}
        </div>
        {unavailable ? (
          <p className="mx-2.5 mt-1 rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700" role="note">
            Source unavailable: {doc ? "its file can't be opened" : "its document was removed"}. The captured text is kept.
          </p>
        ) : src?.status === "broken" ? (
          <div className="mx-2.5 mt-1 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900" role="note">
            <span className="flex-1">Not found in the current version.</span>
            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold hover:bg-amber-100" onClick={() => onRelink(card)}>
              <Link2 className="size-3" aria-hidden /> Fix link
            </button>
          </div>
        ) : src?.status === "moved" ? (
          <div className="mx-2.5 mt-1 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900" role="note">
            <span className="flex-1">{src.note}</span>
            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold hover:bg-amber-100" onClick={() => onAcceptSource(card)}>
              <Check className="size-3" aria-hidden /> Accept
            </button>
          </div>
        ) : null}
        {editing ? (
          <textarea
            autoFocus
            aria-label="Excerpt text"
            className="mx-2 my-1.5 min-h-20 flex-1 resize-none rounded border border-brand-200 p-1.5 font-serif text-[13px] leading-snug outline-none"
            value={card.text}
            onChange={(e) => setText({ text: e.target.value })}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditing(null))}
          />
        ) : (
          <blockquote className="flex-1 px-3 py-1.5 font-serif text-[13px] leading-snug text-slate-800" style={fontSize} onDoubleClick={() => setEditing(card.id)}>
            {src?.area && areaImage && <img src={areaImage} alt={`Area of ${citation(ws, card.sourceId)}`} className="mb-1 w-full rounded border border-slate-200" draggable={false} />}
            “{card.text}”
          </blockquote>
        )}
        <div className="flex items-end gap-1 px-2.5 pb-2">
          {tags}
          {edited && (
            <span className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] text-slate-500" title={`Captured text: “${src!.quote}”`}>
              <PenLine className="size-3" aria-hidden /> edited
            </span>
          )}
        </div>
        {resize}
      </div>
    );
  }

  return (
    <div {...common} className="rs-card" role="article" aria-label="Note" style={{ ...(related ? ({ "--rel": related } as React.CSSProperties) : {}), left: card.x, top: card.y, width: card.w, height: card.h, background: card.color }}>
      <div className="flex h-5 shrink-0 items-center gap-1 px-2 pt-1">
        <span className="h-1 w-8 rounded-full bg-black/10" aria-hidden />
        {status && (
          <span className="ml-auto rounded-full px-2 text-[10.5px] font-semibold text-white" style={{ background: status.color }}>
            {status.label}
          </span>
        )}
      </div>
      <textarea style={fontSize} className="min-h-0 flex-1 resize-none bg-transparent px-2.5 py-1 text-[13px] leading-snug text-slate-800 outline-none placeholder:text-slate-400" aria-label="Note text" placeholder="Write a note…" value={card.text} onChange={(e) => setText({ text: e.target.value })} />
      {tags && <div className="px-2.5 pb-2">{tags}</div>}
      {resize}
    </div>
  );
});

export function ResearchCanvas(props: CanvasProps) {
  const { ws, selected, setSelected, mode, update, matches } = props;
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [stroke, setStroke] = useState<[number, number][] | null>(null);
  const linkFrom = props.linkStart?.kind === "card" ? props.linkStart.id : null;
  const [panning, setPanning] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const drag = useRef<
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
    | { kind: "move"; sx: number; sy: number; ids: string[]; moved: boolean; pull: boolean; tap: Card | null }
    | { kind: "resize"; sx: number; sy: number; card: Card }
    | { kind: "marquee"; additive: string[] }
    | { kind: "ink" }
    | null
  >(null);
  const { x: vx, y: vy, zoom } = ws.view;

  useEffect(() => {
    const el = root.current!;
    const ro = new ResizeObserver(() => {
      const s = { w: el.clientWidth, h: el.clientHeight };
      setSize(s);
      props.onResize?.(s);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = root.current!;
    const stop = (e: WheelEvent) => (e.ctrlKey || e.metaKey) && e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  // Leaving Connect mode cancels a connection in progress.
  useEffect(() => {
    if (mode !== "connect" && props.linkStart) props.setLinkStart(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Bring a focused card into view and flash it.
  useEffect(() => {
    if (!props.focus) return;
    const card = ws.cards.find((c) => c.id === props.focus!.id);
    if (!card) return;
    // Measured now: the pane may have been resized since the last observation.
    const cw = root.current?.clientWidth ?? size.w;
    const ch = root.current?.clientHeight ?? size.h;
    // Only pan when the card is out of sight: the workspace shouldn't jump needlessly.
    const sx = ws.view.x + card.x * ws.view.zoom;
    const sy = ws.view.y + card.y * ws.view.zoom;
    const onScreen = sx >= 0 && sy >= 0 && sx + card.w * ws.view.zoom <= cw && sy + Math.min(card.h, 200) * ws.view.zoom <= ch;
    if (!onScreen) update((w) => ({ ...w, view: { ...w.view, x: cw / 2 - (card.x + card.w / 2) * w.view.zoom, y: ch / 2 - (card.y + Math.min(card.h, 200) / 2) * w.view.zoom } }), "view", { history: false });
    setSelected([card.id]);
    setFlashId(card.id);
    const t = setTimeout(() => setFlashId(null), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus?.nonce]);

  const [mergeTarget, setMergeTarget] = useState<string | null>(null);

  /** Rendered card heights in canvas units (cards grow with their text). */
  const measure = (): Record<string, number> => {
    const out: Record<string, number> = {};
    root.current?.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => (out[el.dataset.cardId!] = el.offsetHeight));
    return out;
  };

  // Keep merged stacks edge to edge as cards change size or members leave.
  const stackKey = ws.cards
    .filter((c) => c.stack)
    .map((c) => `${c.id}:${c.stack}:${"text" in c ? c.text.length : 0}:${c.w}`)
    .join("|");
  useLayoutEffect(() => {
    if (drag.current?.kind === "move") return;
    const heights = measure();
    const stacks = new Set(ws.cards.filter((c) => c.stack).map((c) => c.stack!));
    let next = ws;
    for (const st of stacks) {
      const members = stackMembers(next, st);
      if (members.length < 2) next = { ...next, cards: next.cards.map((c) => (c.stack === st ? ({ ...(({ stack: _s, ...r }) => r)(c) } as Card) : c)) };
      else next = layoutStack(next, st, heights);
    }
    if (next !== ws) update(() => next, "stack-layout", { history: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackKey]);

  const toWorld = (cx: number, cy: number) => {
    const r = root.current!.getBoundingClientRect();
    return { x: (cx - r.left - vx) / zoom, y: (cy - r.top - vy) / zoom };
  };

  // Only cards near the visible area are rendered (keeps hundreds of cards responsive).
  const visible = useMemo(() => {
    const margin = 400 / zoom;
    const x0 = -vx / zoom - margin;
    const y0 = -vy / zoom - margin;
    const x1 = (size.w - vx) / zoom + margin;
    const y1 = (size.h - vy) / zoom + margin;
    const sel = new Set(selected);
    return ws.cards.filter((c) => sheetOf(c) === props.sheet && (sel.has(c.id) || (c.x < x1 && c.x + c.w > x0 && c.y < y1 && c.y + Math.max(c.h, 120) > y0)));
  }, [ws.cards, vx, vy, zoom, size, selected, props.sheet]);

  const onWheel = (e: React.WheelEvent) => {
    if ((e.target as HTMLElement).closest("textarea") && !e.ctrlKey) return;
    if (e.ctrlKey || e.metaKey) {
      const r = root.current!.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const next = Math.max(0.15, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      update((w) => ({ ...w, view: { zoom: next, x: px - ((px - w.view.x) / w.view.zoom) * next, y: py - ((py - w.view.y) / w.view.zoom) * next } }), "view", { history: false });
    } else update((w) => ({ ...w, view: { ...w.view, x: w.view.x - e.deltaX, y: w.view.y - e.deltaY } }), "view", { history: false });
  };

  // Two-finger pinch on touch screens zooms around the fingers' midpoint.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number; mid: { x: number; y: number }; view: { x: number; y: number } } | null>(null);
  const trackTouch = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return false;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const r = root.current!.getBoundingClientRect();
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom, mid: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }, view: { x: vx, y: vy } };
      drag.current = null;
      setPanning(false);
      return true;
    }
    return false;
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (trackTouch(e)) return;
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as HTMLElement;
    document.body.classList.add("rs-no-select");
    window.getSelection()?.removeAllRanges();
    if (mode === "pen" && e.button === 0) {
      e.preventDefault();
      root.current!.setPointerCapture(e.pointerId);
      const p = toWorld(e.clientX, e.clientY);
      setStroke([[Math.round(p.x), Math.round(p.y)]]);
      drag.current = { kind: "ink" };
      return;
    }
    if (target.closest("[data-card-id], .rs-connector-label, .rs-ink-hit, .rs-connector-hit")) return;
    root.current!.focus({ preventScroll: true });
    root.current!.setPointerCapture(e.pointerId);
    // Shift+drag draws a selection box; otherwise dragging the background pans.
    if (e.shiftKey && e.button === 0 && e.pointerType === "mouse") {
      const p = toWorld(e.clientX, e.clientY);
      drag.current = { kind: "marquee", additive: selected };
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: vx, oy: vy };
    setPanning(true);
    setSelected([]);
    props.setEditing(null);
  };

  const onCardDown = (e: React.PointerEvent, card: Card) => {
    const target = e.target as HTMLElement;
    if (!target.closest("textarea, input")) document.body.classList.add("rs-no-select");
    if (e.button !== 0 || mode === "pen") return;
    if (target.closest("textarea, input, button, select, [data-no-drag]")) {
      if (!selected.includes(card.id)) setSelected([card.id]);
      return;
    }
    e.stopPropagation();
    if (mode === "connect") {
      const start = props.linkStart;
      if (!start) props.setLinkStart({ kind: "card", id: card.id });
      else if (start.kind === "annotation") {
        // Started from a passage in the reader: link that passage to this card.
        props.onLinkPassage(start.id, card.id);
        props.setLinkStart(null);
        props.setMode("select");
      } else if (start.id !== card.id) {
        const from = start.id;
        update((w) => {
          if (w.connectors.some((l) => (l.from === from && l.to === card.id) || (l.from === card.id && l.to === from))) return w;
          return { ...w, connectors: [...w.connectors, { id: newId(), from, to: card.id, relation: props.relation }] };
        });
        props.setLinkStart(null);
        props.setMode("select");
      }
      return;
    }
    const ids = e.shiftKey || e.ctrlKey || e.metaKey ? (selected.includes(card.id) ? selected.filter((i) => i !== card.id) : [...selected, card.id]) : selected.includes(card.id) ? selected : [card.id];
    setSelected(ids);
    root.current!.setPointerCapture(e.pointerId);
    // Alt+drag pulls a single card out of its merged stack; otherwise stacks move whole.
    const pull = e.altKey && !!card.stack;
    drag.current = { kind: "move", sx: e.clientX, sy: e.clientY, ids: pull ? [card.id] : withMembers(ws, ids.filter((id) => ws.cards.some((c) => c.id === id))), moved: false, pull, tap: e.shiftKey || e.ctrlKey || e.metaKey || e.altKey ? null : card };
  };

  const onResizeDown = (e: React.PointerEvent, card: Card) => {
    e.stopPropagation();
    root.current!.setPointerCapture(e.pointerId);
    drag.current = { kind: "resize", sx: e.clientX, sy: e.clientY, card };
  };

  const last = useRef({ x: 0, y: 0 });
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = pinch.current;
      if (p && touches.current.size === 2) {
        const [a, b] = [...touches.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const next = Math.max(0.15, Math.min(3, (p.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, p.dist)));
        const r = root.current!.getBoundingClientRect();
        const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
        // Keep the world point under the original midpoint under the fingers.
        const wx = (p.mid.x - p.view.x) / p.zoom;
        const wy = (p.mid.y - p.view.y) / p.zoom;
        update((w) => ({ ...w, view: { zoom: next, x: mid.x - wx * next, y: mid.y - wy * next } }), "view", { history: false });
        return;
      }
    }
    const d = drag.current;
    if (!d) return;
    if (d.kind === "ink") {
      const p = toWorld(e.clientX, e.clientY);
      setStroke((s) => (s ? [...s, [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]] : s));
    } else if (d.kind === "pan") {
      update((w) => ({ ...w, view: { ...w.view, x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy } }), "view", { history: false });
    } else if (d.kind === "marquee") {
      const p = toWorld(e.clientX, e.clientY);
      setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
    } else if (d.kind === "move") {
      const dx = (e.clientX - d.sx) / zoom;
      const dy = (e.clientY - d.sy) / zoom;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      const step = { x: dx - last.current.x, y: dy - last.current.y };
      last.current = { x: dx, y: dy };
      const set = new Set(d.ids);
      update((w) => ({ ...w, cards: w.cards.map((c) => (set.has(c.id) ? { ...c, x: c.x + step.x, y: c.y + step.y } : c)) }), `move:${d.ids.join(",")}`);
      // Dropping excerpts or notes onto another one merges them.
      const movingCards = ws.cards.filter((c) => set.has(c.id));
      let target: string | null = null;
      if (movingCards.length && movingCards.every(canMerge)) {
        for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
          const id = (el as HTMLElement).closest?.<HTMLElement>("[data-card-id]")?.dataset.cardId;
          if (!id || set.has(id)) continue;
          if (canMerge(ws.cards.find((c) => c.id === id))) target = id;
          break;
        }
      }
      setMergeTarget(target);
    } else if (d.kind === "resize") {
      const o = d.card;
      const min = o.type === "group" ? { w: 200, h: 120 } : { w: 140, h: 60 };
      update((w) => ({ ...w, cards: w.cards.map((c) => (c.id === o.id ? { ...c, w: Math.max(min.w, Math.round(o.w + (e.clientX - d.sx) / zoom)), h: Math.max(min.h, Math.round(o.h + (e.clientY - d.sy) / zoom)) } : c)) }), `resize:${o.id}`);
    }
  };

  const onPointerUp = (e?: React.PointerEvent) => {
    document.body.classList.remove("rs-no-select");
    if (e?.pointerType === "touch") {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
    }
    const d = drag.current;
    if (d?.kind === "ink" && stroke && stroke.length > 1) {
      const s = { id: newId(), points: stroke, color: props.pen.color, width: props.pen.width, ...(props.sheet !== "main" ? { sheet: props.sheet } : {}) };
      update((w) => ({ ...w, ink: [...w.ink, s] }));
    }
    if (d?.kind === "move" && d.moved) {
      // Snap the final positions to whole units.
      const set = new Set(d.ids);
      const key = `move:${d.ids.join(",")}`;
      update((w) => ({ ...w, cards: w.cards.map((c) => (set.has(c.id) ? { ...c, x: Math.round(c.x), y: Math.round(c.y) } : c)) }), key);
      if (mergeTarget) {
        update((w) => mergeCards(w, mergeTarget, d.ids, measure()), key);
      } else if (d.pull) {
        // Leave the pulled card where it was dropped; the rest of the stack closes up.
        const id = d.ids[0]!;
        update((w) => {
          const at = w.cards.find((c) => c.id === id)!;
          const out = separateCards(w, [id], measure());
          return { ...out, cards: out.cards.map((c) => (c.id === id ? { ...c, x: at.x, y: at.y } : c)) };
        }, key);
      }
    }
    setMergeTarget(null);
    // A click without a drag: show the card's relationships and original context.
    if (d?.kind === "move" && !d.moved && d.tap) {
      // A plain click narrows a multi-selection to the clicked card (a drag keeps it).
      setSelected([d.tap.id]);
      props.onTapCard(d.tap);
    }
    if (d?.kind === "marquee" && marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1);
      const x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1);
      const y1 = Math.max(marquee.y0, marquee.y1);
      const inside = ws.cards.filter((c) => sheetOf(c) === props.sheet && c.x >= x0 && c.y >= y0 && c.x + c.w <= x1 && c.y + c.h <= y1).map((c) => c.id);
      setSelected([...new Set([...d.additive, ...inside])]);
    }
    last.current = { x: 0, y: 0 };
    setStroke(null);
    setMarquee(null);
    setPanning(false);
    drag.current = null;
  };

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(PASSAGE_MIME);
    if (!raw) return;
    e.preventDefault();
    try {
      const p = JSON.parse(raw) as Passage;
      // Dropped onto a card: link the passage to it. Onto empty space: a new excerpt.
      const onto = (e.target as HTMLElement).closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
      if (onto) return props.onDropPassageOnCard(p, onto);
      const at = toWorld(e.clientX, e.clientY);
      props.onDropPassage(p, { x: at.x - 130, y: at.y - 30 });
    } catch {
      // Ignore malformed drops.
    }
  };

  const onCardContext = (e: React.MouseEvent, card: Card) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selected.includes(card.id)) setSelected([card.id]);
    props.onContextMenu({ kind: "card", id: card.id }, { x: e.clientX, y: e.clientY });
  };

  const byId = useMemo(() => new Map(ws.cards.filter((c) => sheetOf(c) === props.sheet).map((c) => [c.id, c])), [ws.cards, props.sheet]);
  const sheetInk = ws.ink.filter((st) => sheetOf(st) === props.sheet);
  const groups = visible.filter((c): c is GroupCard => c.type === "group");
  const others = visible.filter((c) => c.type !== "group");
  const sel = new Set(selected);
  /** A point along the connector for its label that isn't over another card (labels must not hide cards). */
  const labelSpot = (e: { x1: number; y1: number; x2: number; y2: number }, from: string, to: string) => {
    const others = [...byId.values()].filter((c) => c.id !== from && c.id !== to && c.type !== "group");
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
      const x = e.x1 + (e.x2 - e.x1) * t;
      const y = e.y1 + (e.y2 - e.y1) * t;
      if (!others.some((c) => x > c.x - 50 && x < c.x + c.w + 50 && y > c.y - 14 && y < c.y + c.h + 14)) return { left: x, top: y };
    }
    return { left: (e.x1 + e.x2) / 2, top: (e.y1 + e.y2) / 2 };
  };
  const focusCard = selected.length === 1 ? ws.cards.find((c) => c.id === selected[0]) : undefined;
  const focusRelations = focusCard ? relationsOf(ws, focusCard.id) : [];
  const relatedColor = new Map(focusRelations.map((r) => [r.other.id, RELATIONS.find((x) => x.id === r.connector.relation)?.color ?? "#64748b"]));
  const focusConnectors = new Set(focusRelations.map((r) => r.connector.id));
  const stackPos = new Map<string, "first" | "middle" | "last">();
  for (const st of new Set(ws.cards.filter((c) => c.stack).map((c) => c.stack!))) {
    const m = stackMembers(ws, st);
    m.forEach((c, i) => stackPos.set(c.id, i === 0 ? "first" : i === m.length - 1 ? "last" : "middle"));
  }

  return (
    <div
      ref={root}
      className="rs-canvas"
      tabIndex={0}
      role="application"
      aria-label="Research workspace canvas"
      aria-roledescription="canvas"
      data-mode={mode === "select" ? "pan" : mode}
      data-panning={panning}
      onWheel={onWheel}
      onPointerDown={onBackgroundDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerUp(e)}
      onPointerCancel={(e) => onPointerUp(e)}
      onDoubleClick={(e) => {
        if (mode !== "select" || (e.target as HTMLElement).closest("[data-card-id], .rs-connector-label")) return;
        const p = toWorld(e.clientX, e.clientY);
        props.onAddNote({ x: p.x - 110, y: p.y - 20 });
      }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("[data-card-id], .rs-connector-label, textarea, input")) return;
        e.preventDefault();
        props.onContextMenu({ kind: "canvas", at: toWorld(e.clientX, e.clientY) }, { x: e.clientX, y: e.clientY });
      }}
      onDragOver={(e) => e.dataTransfer.types.includes(PASSAGE_MIME) && (e.preventDefault(), (e.dataTransfer.dropEffect = "copy"))}
      onDrop={onDrop}
      style={{ backgroundPosition: `${vx}px ${vy}px`, backgroundSize: `${22 * zoom}px ${22 * zoom}px` }}
    >
      <div className="rs-world" style={{ transform: `translate(${vx}px, ${vy}px) scale(${zoom})` }}>
        {groups.map((g) => (
          <CardView key={g.id} card={g} ws={ws} selected={sel.has(g.id)} mergeTarget={false} related={relatedColor.get(g.id)} linked={props.linkedIds.has(g.id)} onHover={props.onHoverCard} onRelink={props.onRelink} onAcceptSource={props.onAcceptSource} dim={!!matches && !matches.has(g.id)} flash={flashId === g.id} editing={false} onPointerDown={onCardDown} onResizeDown={onResizeDown} setEditing={props.setEditing} update={update} onOpenSource={props.onOpenSource} onContextMenu={onCardContext} />
        ))}
        <svg className="rs-svg" aria-hidden>
          {[...new Set(visible.filter((c) => c.stack).map((c) => c.stack!))].flatMap((st) => {
            const m = stackMembers(ws, st);
            return m.slice(1).map((lower, i) => {
              const upper = m[i]!;
              const el = typeof document !== "undefined" ? document.querySelector<HTMLElement>(`[data-card-id="${upper.id}"]`) : null;
              const y1 = upper.y + (el?.offsetHeight ?? upper.h) - 2;
              const y2 = lower.y + 2;
              if (y2 - y1 > STACK_GAP * 3 || y2 <= y1) return null;
              const l = upper.x + 14;
              const r = upper.x + Math.min(upper.w, lower.w) - 14;
              const mid = (y1 + y2) / 2;
              const neck = Math.min(46, (r - l) / 3);
              const d = `M${l},${y1} C${l + neck},${mid} ${l + neck},${mid} ${l},${y2} L${r},${y2} C${r - neck},${mid} ${r - neck},${mid} ${r},${y1} Z`;
              const fill = upper.color || "#ffffff";
              return <path key={`joint-${lower.id}`} data-joint={lower.id} d={d} fill={fill} stroke="#cbd5e1" strokeWidth="1" />;
            });
          })}
          <defs>
            {RELATIONS.map((r) => (
              <marker key={r.id} id={`rs-arrow-${r.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill={r.color} />
              </marker>
            ))}
          </defs>
          {ws.connectors.map((l) => {
            const a = byId.get(l.from);
            const b = byId.get(l.to);
            if (!a || !b) return null;
            const e = connectorEnds(a, b);
            const rel = RELATIONS.find((r) => r.id === l.relation) ?? RELATIONS[3]!;
            const dim = matches && !(matches.has(l.from) && matches.has(l.to));
            return (
              <g key={l.id} opacity={dim ? 0.2 : 1}>
                <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} className="rs-connector" stroke={rel.color} strokeDasharray={rel.dash} markerEnd={`url(#rs-arrow-${rel.id})`} strokeWidth={sel.has(l.id) || focusConnectors.has(l.id) ? 3.5 : 2} data-focus={focusConnectors.has(l.id) || undefined} />
                <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} className="rs-connector-hit" style={{ pointerEvents: "stroke" }} onPointerDown={(ev) => (ev.stopPropagation(), setSelected([l.id]))} />
              </g>
            );
          })}
        </svg>
        <svg className="rs-svg" style={{ zIndex: 3 }} aria-hidden>
          {sheetInk.map((s) => (
            <g key={s.id}>
              <polyline className="rs-ink" points={s.points.map((p) => p.join(",")).join(" ")} stroke={s.color} strokeWidth={s.width} style={sel.has(s.id) ? { filter: "drop-shadow(0 0 3px #7056e8)" } : undefined} />
              <polyline className="rs-ink rs-ink-hit" points={s.points.map((p) => p.join(",")).join(" ")} stroke="transparent" strokeWidth={Math.max(12, s.width + 8)} style={{ pointerEvents: mode === "pen" ? "none" : "stroke" }} onPointerDown={(e) => {
                  e.stopPropagation();
                  if (props.erasing) update((w) => ({ ...w, ink: w.ink.filter((x) => x.id !== s.id) }));
                  else setSelected(e.shiftKey ? [...selected, s.id] : [s.id]);
                }} />
            </g>
          ))}
          {stroke && <polyline className="rs-ink" points={stroke.map((p) => p.join(",")).join(" ")} stroke={props.pen.color} strokeWidth={props.pen.width} />}
        </svg>
        {others.map((c) => (
          <CardView
            key={c.id}
            card={c}
            ws={ws}
            areaImage={c.type === "excerpt" ? props.areaImages.get(c.sourceId) : undefined}
            selected={sel.has(c.id) || linkFrom === c.id}
            stackPos={stackPos.get(c.id)}
            mergeTarget={mergeTarget === c.id}
            related={relatedColor.get(c.id)}
            linked={props.linkedIds.has(c.id)}
            onHover={props.onHoverCard}
            onRelink={props.onRelink}
            onAcceptSource={props.onAcceptSource}
            dim={!!matches && !matches.has(c.id)}
            flash={flashId === c.id}
            editing={props.editing === c.id}
            onPointerDown={onCardDown}
            onResizeDown={onResizeDown}
            setEditing={props.setEditing}
            update={update}
            onOpenSource={props.onOpenSource}
            onContextMenu={onCardContext}
          />
        ))}
        {ws.connectors.map((l) => {
          const a = byId.get(l.from);
          const b = byId.get(l.to);
          if (!a || !b) return null;
          const e = connectorEnds(a, b);
          const rel = RELATIONS.find((r) => r.id === l.relation) ?? RELATIONS[3]!;
          return (
            <button
              key={`lbl-${l.id}`}
              type="button"
              className="rs-connector-label"
              data-selected={sel.has(l.id) || focusConnectors.has(l.id)}
              style={{ ...labelSpot(e, l.from, l.to), color: rel.color, borderColor: rel.color, opacity: matches && !(matches.has(l.from) && matches.has(l.to)) ? 0.25 : 1 }}
              aria-label={`Connection: ${rel.label}${l.label ? ` — ${l.label}` : ""}`}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={() => setSelected([l.id])}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setSelected([l.id]);
                props.onContextMenu({ kind: "connector", id: l.id }, { x: ev.clientX, y: ev.clientY });
              }}
            >
              {l.label?.trim() || rel.label}
            </button>
          );
        })}
        {marquee && <div className="rs-marquee" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />}
      </div>
      {mode === "connect" && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink-900 px-3 py-1 text-xs text-white shadow">
          {props.linkStart?.kind === "annotation" ? "Now click the card to link the passage to." : linkFrom ? "Now click a card, or a highlighted passage in the document, to connect to." : `Click a card or a marked passage to start (${RELATIONS.find((r) => r.id === props.relation)?.label.toLowerCase()}).`} Esc to cancel.
        </div>
      )}
      {mode === "pen" && <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink-900 px-3 py-1 text-xs text-white shadow">Draw on the workspace. Esc to stop.</div>}
      {byId.size === 0 && sheetInk.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">Your research workspace is empty</p>
            <p className="mt-1">Select text in a document and choose “Add excerpt”, or drag it here. Double-click the background to add a note.</p>
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {selected.length ? `${selected.length} selected` : ""}
      </span>
    </div>
  );
}
