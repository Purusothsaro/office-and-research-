import { Link2, Quote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { citation, newId, type ExcerptItem, type GroupItem, type Workspace, type WorkspaceItem } from "../model";
import { EXCERPT_MIME, type ExcerptPayload } from "./DocPane";

export interface CanvasProps {
  ws: Workspace;
  selected: string[];
  setSelected: (ids: string[]) => void;
  connecting: boolean;
  setConnecting: (on: boolean) => void;
  /** Item to bring into view (and flash). */
  focusId: { id: string; nonce: number } | null;
  update: (fn: (ws: Workspace) => Workspace, key?: string | null) => void;
  onCitation: (item: ExcerptItem) => void;
  onDropExcerpt: (payload: ExcerptPayload, at: { x: number; y: number }) => void;
  /** Freehand pen mode: dragging on the canvas draws ink. */
  pen: { color: string; width: number } | null;
}

const center = (i: WorkspaceItem) => ({ x: i.x + i.w / 2, y: i.y + i.h / 2 });

export function Canvas({ ws, selected, setSelected, connecting, setConnecting, focusId, update, onCitation, onDropExcerpt, pen }: CanvasProps) {
  const [stroke, setStroke] = useState<[number, number][] | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const { x: vx, y: vy, zoom } = ws.view;
  const drag = useRef<
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
    | { kind: "move"; sx: number; sy: number; originals: WorkspaceItem[] }
    | { kind: "resize"; sx: number; sy: number; original: WorkspaceItem }
    | { kind: "ink" }
    | null
  >(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const toWorld = (clientX: number, clientY: number) => {
    const r = root.current!.getBoundingClientRect();
    return { x: (clientX - r.left - vx) / zoom, y: (clientY - r.top - vy) / zoom };
  };

  // Bring a focused item into view.
  useEffect(() => {
    if (!focusId || !root.current) return;
    const item = ws.items.find((i) => i.id === focusId.id);
    if (!item) return;
    const r = root.current.getBoundingClientRect();
    const c = center(item);
    update((w) => ({ ...w, view: { ...w.view, x: r.width / 2 - c.x * w.view.zoom, y: r.height / 2 - c.y * w.view.zoom } }), "view");
    setSelected([item.id]);
    setFlashId(item.id);
    const t = setTimeout(() => setFlashId(null), 1500);
    return () => clearTimeout(t);
    // Only when a new focus is requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (!connecting) setLinkFrom(null);
  }, [connecting]);

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const r = root.current!.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const next = Math.max(0.25, Math.min(2.5, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      // Keep the point under the cursor fixed while zooming.
      update((w) => ({ ...w, view: { zoom: next, x: px - ((px - w.view.x) / w.view.zoom) * next, y: py - ((py - w.view.y) / w.view.zoom) * next } }), "view");
    } else {
      update((w) => ({ ...w, view: { ...w.view, x: w.view.x - e.deltaX, y: w.view.y - e.deltaY } }), "view");
    }
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (pen) {
      // Pen draws over everything, including cards.
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const p = toWorld(e.clientX, e.clientY);
      setStroke([[p.x, p.y]]);
      drag.current = { kind: "ink" };
      return;
    }
    if ((e.target as HTMLElement).closest(".ws-item, .ws-ink-stroke")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: vx, oy: vy };
    if (!e.shiftKey) setSelected([]);
  };

  const onItemDown = (e: React.PointerEvent, item: WorkspaceItem) => {
    const target = e.target as HTMLElement;
    if (e.button !== 0 || target.closest("textarea, input, button, [data-no-drag]")) return;
    e.stopPropagation();
    if (connecting) {
      if (!linkFrom) setLinkFrom(item.id);
      else if (linkFrom !== item.id) {
        const from = linkFrom;
        update((w) => (w.links.some((l) => (l.from === from && l.to === item.id) || (l.from === item.id && l.to === from)) ? w : { ...w, links: [...w.links, { id: newId(), from, to: item.id }] }));
        setLinkFrom(null);
        setConnecting(false);
      }
      return;
    }
    const ids = e.shiftKey ? (selected.includes(item.id) ? selected.filter((i) => i !== item.id) : [...selected, item.id]) : selected.includes(item.id) ? selected : [item.id];
    setSelected(ids);
    // Moving a group frame also moves everything inside it.
    const moving = new Set(ids);
    for (const id of ids) {
      const g = ws.items.find((i) => i.id === id);
      if (g?.type !== "group") continue;
      for (const other of ws.items) {
        const c = center(other);
        if (other.type !== "group" && c.x >= g.x && c.x <= g.x + g.w && c.y >= g.y && c.y <= g.y + g.h) moving.add(other.id);
      }
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: "move", sx: e.clientX, sy: e.clientY, originals: ws.items.filter((i) => moving.has(i.id)).map((i) => ({ ...i })) };
  };

  const onResizeDown = (e: React.PointerEvent, item: WorkspaceItem) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: "resize", sx: e.clientX, sy: e.clientY, original: { ...item } };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "ink") {
      const p = toWorld(e.clientX, e.clientY);
      setStroke((s) => (s ? [...s, [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]] : s));
      return;
    }
    if (d.kind === "pan") {
      update((w) => ({ ...w, view: { ...w.view, x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy } }), "view");
      return;
    }
    const dx = (e.clientX - d.sx) / zoom;
    const dy = (e.clientY - d.sy) / zoom;
    if (d.kind === "move") {
      const key = `move:${d.originals.map((o) => o.id).join(",")}`;
      update((w) => ({ ...w, items: w.items.map((i) => { const o = d.originals.find((x) => x.id === i.id); return o ? { ...i, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : i; }) }), key);
    } else {
      const o = d.original;
      update((w) => ({ ...w, items: w.items.map((i) => (i.id === o.id ? { ...i, w: Math.max(140, Math.round(o.w + dx)), h: Math.max(60, Math.round(o.h + dy)) } : i)) }), `resize:${o.id}`);
    }
  };
  const onPointerUp = () => {
    if (drag.current?.kind === "ink" && stroke && stroke.length > 1 && pen) {
      const id = newId();
      update((w) => ({ ...w, ink: [...(w.ink ?? []), { id, points: stroke, color: pen.color, width: pen.width }] }));
    }
    setStroke(null);
    drag.current = null;
  };

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(EXCERPT_MIME);
    if (!raw) return;
    e.preventDefault();
    try {
      onDropExcerpt(JSON.parse(raw) as ExcerptPayload, toWorld(e.clientX, e.clientY));
    } catch {
      // Ignore malformed drops.
    }
  };

  const setText = (id: string, patch: Partial<{ text: string; title: string }>) =>
    update((w) => ({ ...w, items: w.items.map((i) => (i.id === id ? ({ ...i, ...patch } as WorkspaceItem) : i)) }), `text:${id}`);

  const groups = ws.items.filter((i): i is GroupItem => i.type === "group");
  const others = ws.items.filter((i) => i.type !== "group");
  const byId = new Map(ws.items.map((i) => [i.id, i]));

  const itemClass = (item: WorkspaceItem) => `ws-item ws-${item.type} ${selected.includes(item.id) ? "ws-selected" : ""} ${flashId === item.id ? "ws-flash-item" : ""} ${linkFrom === item.id ? "ws-link-from" : ""}`;
  const resize = (item: WorkspaceItem) => <span className="ws-resize" data-no-drag onPointerDown={(e) => onResizeDown(e, item)} aria-hidden />;

  return (
    <div
      ref={root}
      className={`ws-canvas ${connecting ? "ws-connecting" : ""} ${pen ? "ws-pen" : ""}`}
      role="region"
      aria-label="Workspace canvas"
      onWheel={onWheel}
      onPointerDown={onBackgroundDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragOver={(e) => e.dataTransfer.types.includes(EXCERPT_MIME) && (e.preventDefault(), (e.dataTransfer.dropEffect = "copy"))}
      onDrop={onDrop}
      style={{ backgroundPosition: `${vx}px ${vy}px`, backgroundSize: `${24 * zoom}px ${24 * zoom}px` }}
    >
      <div className="ws-world" style={{ transform: `translate(${vx}px, ${vy}px) scale(${zoom})` }}>
        {groups.map((g) => (
          <div key={g.id} className={itemClass(g)} style={{ left: g.x, top: g.y, width: g.w, height: g.h, borderColor: g.color, background: `${g.color}22` }} onPointerDown={(e) => onItemDown(e, g)} data-item-id={g.id}>
            <input className="ws-group-title" aria-label="Issue title" value={g.title} placeholder="Issue" onChange={(e) => setText(g.id, { title: e.target.value })} style={{ background: g.color }} />
            {resize(g)}
          </div>
        ))}
        <svg className="ws-links" aria-hidden>
          {ws.links.map((l) => {
            const a = byId.get(l.from);
            const b = byId.get(l.to);
            if (!a || !b) return null;
            const p = center(a);
            const q = center(b);
            return <line key={l.id} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={selected.includes(l.id) ? "ws-link ws-link-selected" : "ws-link"} />;
          })}
        </svg>
        <svg className="ws-links ws-ink" aria-hidden={!ws.ink?.length}>
          {(ws.ink ?? []).map((s) => (
            <polyline
              key={s.id}
              className={`ws-ink-stroke ${selected.includes(s.id) ? "ws-ink-selected" : ""}`}
              points={s.points.map((p) => p.join(",")).join(" ")}
              stroke={s.color}
              strokeWidth={s.width}
              onPointerDown={(e) => {
                if (pen) return;
                e.stopPropagation();
                setSelected(e.shiftKey ? [...selected, s.id] : [s.id]);
              }}
            />
          ))}
          {stroke && pen && <polyline points={stroke.map((p) => p.join(",")).join(" ")} stroke={pen.color} strokeWidth={pen.width} className="ws-ink-live" />}
        </svg>
        {ws.links.map((l) => {
          const a = byId.get(l.from);
          const b = byId.get(l.to);
          if (!a || !b) return null;
          const p = center(a);
          const q = center(b);
          return (
            <button
              key={`h-${l.id}`}
              type="button"
              className="ws-link-handle"
              style={{ left: (p.x + q.x) / 2 - 9, top: (p.y + q.y) / 2 - 9 }}
              aria-label="Select connection"
              title="Connection (select and press Delete to remove)"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSelected([l.id])}
            >
              <Link2 aria-hidden className="size-3" />
            </button>
          );
        })}
        {others.map((item) =>
          item.type === "excerpt" ? (
            <div key={item.id} className={itemClass(item)} style={{ left: item.x, top: item.y, width: item.w, minHeight: item.h }} onPointerDown={(e) => onItemDown(e, item)} data-item-id={item.id}>
              <div className="ws-excerpt-bar" style={{ background: item.color }} />
              <Quote aria-hidden className="ws-excerpt-icon size-3.5" />
              <blockquote className="ws-excerpt-text">{item.text}</blockquote>
              <button type="button" className="ws-cite" onClick={() => onCitation(item)} title="Show in the document">
                {citation(ws, item)}
              </button>
              {resize(item)}
            </div>
          ) : (
            <div key={item.id} className={itemClass(item)} style={{ left: item.x, top: item.y, width: item.w, height: item.h, background: item.color }} onPointerDown={(e) => onItemDown(e, item)} data-item-id={item.id}>
              <div className="ws-note-grip" aria-hidden />
              <textarea className="ws-note-text" aria-label="Note" placeholder="Write a note…" value={(item as { text: string }).text} onChange={(e) => setText(item.id, { text: e.target.value })} />
              {resize(item)}
            </div>
          ),
        )}
      </div>
      {connecting && <div className="ws-hint">{linkFrom ? "Now click the item to connect to." : "Click the first item to connect."}</div>}
      {ws.items.length === 0 && (
        <div className="ws-empty">
          <p className="font-medium text-slate-700">Your workspace is empty</p>
          <p>Select text in a document and drag it here, or use “Add to workspace”. Add notes and issue groups from the toolbar.</p>
        </div>
      )}
    </div>
  );
}
