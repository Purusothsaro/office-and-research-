import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** A line to draw between a passage in the reader and a card on the workspace. */
export interface CrossLink {
  id: string;
  /** Mark element id in the reader (annotation id, or excerpt card id for an excerpt's own mark). */
  markId: string;
  /** Document the mark belongs to (used when the passage is scrolled out of view). */
  documentId: string;
  page: number;
  cardId: string;
  color: string;
  /** Emphasised (the card or passage is selected or hovered). */
  strong: boolean;
  dashed?: boolean;
  label?: string;
}

interface Drawn {
  id: string;
  d: string;
  color: string;
  strong: boolean;
  dashed: boolean;
  label?: string | undefined;
  lx: number;
  ly: number;
  /** Where the passage is when it's outside the reader's visible area. */
  stub?: { x: number; y: number; dir: "up" | "down"; page: number } | undefined;
}

const rectOf = (el: Element | null, base: DOMRect) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top, width: r.width, height: r.height };
};

/**
 * Draws links across the reader and the workspace, so a passage and the card
 * it is connected to are visibly joined. Positions are read from the DOM each
 * frame while links are shown, so lines follow scrolling, panning and zooming.
 */
export function LinkOverlay({ container, links, pending, onStubClick }: { container: RefObject<HTMLDivElement | null>; links: CrossLink[]; pending: { from: { markId?: string; cardId?: string } } | null; onStubClick: (l: CrossLink) => void }) {
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  const [live, setLive] = useState<string | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const sig = useRef("");
  const linksRef = useRef(links);
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    linksRef.current = links;
    pendingRef.current = pending;
  });

  useEffect(() => {
    const onMove = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const root = container.current;
      if (!root) return;
      const base = root.getBoundingClientRect();
      const canvasEl = root.querySelector('[aria-label="Research workspace canvas"]');
      const canvasBox = rectOf(canvasEl, base);
      const out: Drawn[] = [];
      for (const l of linksRef.current) {
        const card = rectOf(root.querySelector(`[data-card-id="${CSS.escape(l.cardId)}"]`), base);
        if (!card || !canvasBox) continue;
        // Cards scrolled off the workspace aren't linked visibly.
        if (card.right < canvasBox.left || card.left > canvasBox.left + canvasBox.width || card.bottom < canvasBox.top || card.top > canvasBox.top + canvasBox.height) continue;
        const viewer = root.querySelector(`[data-viewer-doc="${CSS.escape(l.documentId)}"]`);
        const scroller = rectOf(viewer?.querySelector("[data-reader-scroll]") ?? null, base);
        if (!scroller) continue;
        const mark = rectOf(viewer!.querySelector(`[data-mark-id="${CSS.escape(l.markId)}"]`), base);
        let mx: number;
        let my: number;
        let stub: Drawn["stub"];
        if (mark && mark.bottom > scroller.top && mark.top < scroller.bottom) {
          mx = Math.min(mark.right, scroller.right - 14);
          my = mark.top + mark.height / 2;
        } else {
          // The passage is above or below the visible part of the document.
          if (!l.strong) continue;
          const above = mark ? mark.bottom <= scroller.top : true;
          mx = scroller.right - 26;
          my = above ? scroller.top + 18 : scroller.bottom - 18;
          stub = { x: mx, y: my, dir: above ? "up" : "down", page: l.page };
        }
        const cx = Math.max(card.left, canvasBox.left);
        const cy = Math.min(Math.max(card.top + Math.min(card.height, 120) / 2, canvasBox.top + 4), canvasBox.top + canvasBox.height - 4);
        const dx = Math.max(60, (cx - mx) / 2);
        out.push({ id: l.id, d: `M${mx},${my} C${mx + dx},${my} ${cx - dx},${cy} ${cx},${cy}`, color: l.color, strong: l.strong, dashed: !!l.dashed, label: l.label, lx: (mx + cx) / 2, ly: (my + cy) / 2, stub });
      }
      // A link being drawn follows the pointer.
      let liveD: string | null = null;
      const p = pendingRef.current;
      if (p && pointer.current) {
        const from = p.from.cardId ? rectOf(root.querySelector(`[data-card-id="${CSS.escape(p.from.cardId)}"]`), base) : rectOf(root.querySelector(`[data-mark-id="${CSS.escape(p.from.markId ?? "")}"]`), base);
        if (from) {
          const fx = p.from.cardId ? from.left : from.right;
          const fy = from.top + Math.min(from.height, 120) / 2;
          liveD = `M${fx},${fy} L${pointer.current.x - base.left},${pointer.current.y - base.top}`;
        }
      }
      const s = JSON.stringify([out, liveD]);
      if (s !== sig.current) {
        sig.current = s;
        setDrawn(out);
        setLive(liveD);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [container]);

  return (
    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" aria-hidden={!drawn.length} data-testid="link-overlay">
      {drawn.map((l) => (
        <g key={l.id} data-cross-link={l.id}>
          <path d={l.d} fill="none" stroke={l.color} strokeWidth={l.strong ? 2.5 : 1.5} strokeDasharray={l.dashed ? "6 4" : undefined} opacity={l.strong ? 0.95 : 0.55} />
          {l.label && l.strong && (
            <text x={l.lx} y={l.ly - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill={l.color} stroke="#fff" strokeWidth="3" paintOrder="stroke">
              {l.label}
            </text>
          )}
          {l.stub && (
            <g
              className="pointer-events-auto cursor-pointer"
              role="button"
              aria-label={`Linked passage on page ${l.stub.page + 1}`}
              onClick={() => {
                const link = linksRef.current.find((x) => x.id === l.id);
                if (link) onStubClick(link);
              }}
            >
              <rect x={l.stub.x - 22} y={l.stub.y - 10} width="44" height="20" rx="10" fill={l.color} />
              <text x={l.stub.x} y={l.stub.y + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">
                {l.stub.dir === "up" ? "↑" : "↓"} p.{l.stub.page + 1}
              </text>
            </g>
          )}
        </g>
      ))}
      {live && <path d={live} fill="none" stroke="#5b3fd6" strokeWidth="2" strokeDasharray="5 4" />}
    </svg>
  );
}
