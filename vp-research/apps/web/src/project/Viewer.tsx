import { anchorSelection, findAll, HIGHLIGHT_COLORS, rectsFor, type Annotation, type AnnotationKind, type DocumentIndex, type PdfRect, type ResearchDocument, type SourceRef } from "@octo/research";
import { ChevronDown, ChevronsDownUp, ChevronUp, Copy, FoldVertical, GripVertical, Highlighter, Link2, Maximize2, MessageSquarePlus, Minus, Plus, Quote, RotateCw, Search, Underline, X } from "lucide-react";
import { TextLayer, type PDFDocumentProxy, type PageViewport } from "pdfjs-dist";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../components/ui";
import type { DocumentService } from "./documents";

export const PASSAGE_MIME = "application/x-octo-passage";

/** The text position under a point (standard API, with the WebKit/Blink fallback). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

export interface Passage {
  documentId: string;
  page: number;
  rects: PdfRect[];
  quote: string;
  start?: number;
  end?: number;
  /** Captured with the lasso: a region of the page. */
  area?: boolean;
}

/** What the pointer does in the reader (and, for pen and eraser, on the workspace). */
export type Tool = "text" | "pen" | "highlighter" | "eraser" | "lasso";

export interface PageInk {
  id: string;
  points: [number, number][];
  color: string;
  width: number;
  tool: "pen" | "highlighter";
}

export const INK = {
  pen: { color: "#1d4ed8", width: 1.6 },
  highlighter: { color: "#facc15", width: 12 },
};

export interface ViewerMark {
  id: string;
  kind: "excerpt" | AnnotationKind;
  source: SourceRef;
  color: string;
  label: string;
  annotation?: Annotation;
  cardId?: string;
}

export interface FocusRequest {
  documentId: string;
  page: number;
  rects: PdfRect[];
  /** View an older revision (for a source that couldn't be re-linked). */
  viewFileId?: string;
  viewRevision?: number;
  nonce: number;
}

function toView(vp: PageViewport, r: PdfRect) {
  const [a, b] = vp.convertToViewportPoint(r[0], r[1]) as [number, number];
  const [c, d] = vp.convertToViewportPoint(r[2], r[3]) as [number, number];
  return { left: Math.min(a, c), top: Math.min(b, d), width: Math.abs(c - a), height: Math.abs(d - b) };
}

/** Selection rectangles in PDF space, merged per line. */
function selectionRects(sel: Selection, box: HTMLElement, vp: PageViewport): PdfRect[] {
  const base = box.getBoundingClientRect();
  const rects: PdfRect[] = [];
  for (let i = 0; i < sel.rangeCount; i++) {
    for (const r of Array.from(sel.getRangeAt(i).getClientRects())) {
      if (r.width < 1 || r.height < 1 || r.width > base.width * 0.98) continue;
      const [x1, y1] = vp.convertToPdfPoint(r.left - base.left, r.bottom - base.top) as [number, number];
      const [x2, y2] = vp.convertToPdfPoint(r.right - base.left, r.top - base.top) as [number, number];
      rects.push([Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]);
    }
  }
  const sorted = rects.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const out: PdfRect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - r[1]) < 3 && r[0] <= last[2] + 4) last[2] = Math.max(last[2], r[2]);
    else out.push([...r]);
  }
  return out;
}

interface PageProps {
  pdf: PDFDocumentProxy;
  index: number;
  scale: number;
  rotation: number;
  size: { w: number; h: number };
  marks: ViewerMark[];
  hits: { rects: PdfRect[]; current: boolean }[];
  flash: PdfRect[] | null;
  /** Marks whose workspace object is selected or hovered. */
  activeIds: Set<string>;
  onViewport: (index: number, vp: PageViewport) => void;
  onMark: (m: ViewerMark, at: { x: number; y: number }) => void;
  onMarkHover: (id: string | null) => void;
  onCollapse: () => void;
  tool: Tool;
  inkColor: string;
  ink: PageInk[];
  onStroke: (page: number, points: [number, number][], tool: "pen" | "highlighter") => void;
  onErase: (target: { kind: "ink" | "annotation"; id: string }) => void;
  onLasso: (page: number, rect: PdfRect) => void;
}

const Page = memo(function Page({ pdf, index, scale, rotation, size, marks, hits, flash, activeIds, onViewport, onMark, onMarkHover, onCollapse, tool, inkColor, ink, onStroke, onErase, onLasso }: PageProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: "900px 0px" });
    io.observe(box.current!);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    // Pages render only near the viewport; far-away pages release their bitmaps.
    if (!visible) {
      if (canvas.current) canvas.current.width = canvas.current.height = 0;
      text.current?.replaceChildren();
      return;
    }
    let cancelled = false;
    let layer: TextLayer | null = null;
    let cancelRender = () => {};
    void (async () => {
      const page = await pdf.getPage(index + 1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
      setVp(viewport);
      onViewport(index, viewport);
      const c = canvas.current!;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(viewport.width * ratio);
      c.height = Math.floor(viewport.height * ratio);
      const task = page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport, ...(ratio !== 1 ? { transform: [ratio, 0, 0, ratio, 0, 0] } : {}) });
      cancelRender = () => task.cancel();
      await task.promise.catch(() => undefined);
      if (cancelled || !text.current) return;
      text.current.replaceChildren();
      layer = new TextLayer({ textContentSource: page.streamTextContent(), container: text.current, viewport });
      await layer.render().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      cancelRender();
      layer?.cancel();
    };
  }, [pdf, index, scale, rotation, visible, onViewport]);
  const hitMark = (e: React.MouseEvent): ViewerMark | null => {
    if (!vp || !box.current) return null;
    const b = box.current.getBoundingClientRect();
    const x = e.clientX - b.left;
    const y = e.clientY - b.top;
    // Later marks are drawn on top, so test them first.
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]!;
      for (const r of m.source.rects) {
        const v = toView(vp, r);
        if (x >= v.left - 1 && x <= v.left + v.width + 1 && y >= v.top - 1 && y <= v.top + v.height + 1) return m;
      }
    }
    return null;
  };
  const hovered = useRef<string | null>(null);
  const onPageClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;
    const m = hitMark(e);
    if (m) onMark(m, { x: e.clientX, y: e.clientY });
  };
  const onPageMove = (e: React.MouseEvent) => {
    if (e.buttons) return;
    const m = hitMark(e);
    const id = m?.id ?? null;
    if (id === hovered.current) return;
    hovered.current = id;
    box.current?.toggleAttribute("data-over-mark", !!id);
    onMarkHover(id);
  };
  // ---- Drawing tools on the page (pen, highlighter, eraser, lasso) ----
  const [live, setLive] = useState<[number, number][] | null>(null);
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const local = (e: React.PointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const toPdf = (x: number, y: number) => vp!.convertToPdfPoint(x, y) as [number, number];
  const toScreen = (p: [number, number]) => vp!.convertToViewportPoint(p[0], p[1]) as [number, number];
  const eraseAt = (x: number, y: number) => {
    for (const s of ink) {
      const pts = s.points.map(toScreen);
      if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < Math.max(8, (s.width * scale) / 2 + 4))) return onErase({ kind: "ink", id: s.id });
    }
    for (const m of marks) {
      if (!m.annotation) continue;
      for (const r of m.source.rects) {
        const v = toView(vp!, r);
        if (x >= v.left && x <= v.left + v.width && y >= v.top - 2 && y <= v.top + v.height + 2) return onErase({ kind: "annotation", id: m.annotation.id });
      }
    }
  };
  const onToolDown = (e: React.PointerEvent) => {
    if (!vp || tool === "text" || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = local(e);
    if (tool === "pen" || tool === "highlighter") setLive([[p.x, p.y]]);
    else if (tool === "lasso") setLasso({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    else if (tool === "eraser") eraseAt(p.x, p.y);
  };
  const onToolMove = (e: React.PointerEvent) => {
    if (!vp || tool === "text") return;
    const p = local(e);
    if (live) setLive((l) => (l ? [...l, [p.x, p.y]] : l));
    else if (lasso) setLasso((r) => (r ? { ...r, x1: p.x, y1: p.y } : r));
    else if (tool === "eraser" && e.buttons) eraseAt(p.x, p.y);
  };
  const onToolUp = () => {
    if (live && live.length > 1 && (tool === "pen" || tool === "highlighter")) onStroke(index, live.map(([x, y]) => toPdf(x, y)), tool);
    if (lasso && Math.abs(lasso.x1 - lasso.x0) > 8 && Math.abs(lasso.y1 - lasso.y0) > 8) {
      const [ax, ay] = toPdf(lasso.x0, lasso.y0);
      const [bx, by] = toPdf(lasso.x1, lasso.y1);
      onLasso(index, [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]);
    }
    setLive(null);
    setLasso(null);
  };
  const excerptMarks = marks.filter((m) => m.kind === "excerpt");
  const sideways = rotation % 180 !== 0;
  const w = vp?.width ?? (sideways ? size.h : size.w) * scale;
  const h = vp?.height ?? (sideways ? size.w : size.h) * scale;
  const comments = marks.filter((m) => m.kind === "comment");
  return (
    <div
      ref={box}
      className="rs-page"
      data-page={index}
      style={{ width: w, height: h, "--total-scale-factor": scale } as React.CSSProperties}
      onClick={onPageClick}
      onMouseMove={onPageMove}
      onMouseLeave={() => {
        if (hovered.current) {
          hovered.current = null;
          box.current?.removeAttribute("data-over-mark");
          onMarkHover(null);
        }
      }}
    >
      <canvas ref={canvas} style={{ width: w, height: h }} aria-hidden />
      <div ref={text} className="pdf-text-layer" />
      {vp && (
        <div className="rs-marks">
          {hits.flatMap((hit, i) => hit.rects.map((r, j) => <span key={`h${i}-${j}`} className={`rs-mark-hit ${hit.current ? "rs-mark-hit-current" : ""}`} style={toView(vp, r)} />))}
          {marks.flatMap((m) =>
            m.source.rects.map((r, i) => (
              <button
                key={`${m.id}-${i}`}
                type="button"
                className={`rs-mark rs-mark-${m.kind}`}
                data-active={activeIds.has(m.id)}
                data-mark-id={m.id}
                style={{ ...toView(vp, r), ...(m.kind === "highlight" ? { background: m.color } : m.kind === "underline" || m.kind === "comment" ? { borderColor: m.color } : {}) }}
                aria-label={m.label}
                title={m.kind === "excerpt" ? `${m.label} — click to show it on the workspace` : m.label}
                onClick={(e) => onMark(m, { x: e.clientX, y: e.clientY })}
              />
            )),
          )}
          {comments.map((m) => {
            const first = m.source.rects[0] ? toView(vp, m.source.rects[0]) : { top: 0 };
            return (
              <button key={`pin-${m.id}`} type="button" className="rs-margin-pin" style={{ top: first.top - 3, background: m.color }} aria-label={`Margin note: ${m.annotation?.note || "(empty)"}`} title={m.annotation?.note || "Comment"} onClick={(e) => onMark(m, { x: e.clientX, y: e.clientY })}>
                <MessageSquarePlus className="size-3.5 text-slate-800" aria-hidden />
              </button>
            );
          })}
          {flash?.map((r, i) => <span key={`f${i}`} className="rs-flash" style={toView(vp, r)} />)}
          {/* Bars in the margin beside excerpted passages; click to show the card. */}
          {excerptMarks.map((m) => {
            const ys = m.source.rects.map((r) => toView(vp, r));
            const top = Math.min(...ys.map((v) => v.top));
            const bottom = Math.max(...ys.map((v) => v.top + v.height));
            return <button key={`bar-${m.id}`} type="button" className="rs-margin-bar" data-active={activeIds.has(m.id)} style={{ top, height: Math.max(8, bottom - top) }} aria-label={`Show excerpt on the workspace: ${m.label}`} title="Show this excerpt on the workspace" onClick={(e) => onMark(m, { x: e.clientX, y: e.clientY })} />;
          })}
        </div>
      )}
      {vp && (ink.length > 0 || live) && (
        <svg className="rs-doc-ink" width={w} height={h} aria-hidden>
          {ink.map((s) => (
            <polyline key={s.id} data-ink-id={s.id} points={s.points.map((p) => toScreen(p).join(",")).join(" ")} stroke={s.color} strokeWidth={s.width * scale} opacity={s.tool === "highlighter" ? 0.38 : 1} style={s.tool === "highlighter" ? { mixBlendMode: "multiply" } : undefined} />
          ))}
          {live && <polyline points={live.map((p) => p.join(",")).join(" ")} stroke={tool === "highlighter" ? INK.highlighter.color : inkColor} strokeWidth={(tool === "highlighter" ? INK.highlighter.width : INK.pen.width) * scale} opacity={tool === "highlighter" ? 0.38 : 1} />}
        </svg>
      )}
      {tool !== "text" && (
        <div className="rs-tool-layer" data-tool={tool} onPointerDown={onToolDown} onPointerMove={onToolMove} onPointerUp={onToolUp} onPointerCancel={onToolUp} aria-hidden>
          {lasso && <span className="rs-lasso" style={{ left: Math.min(lasso.x0, lasso.x1), top: Math.min(lasso.y0, lasso.y1), width: Math.abs(lasso.x1 - lasso.x0), height: Math.abs(lasso.y1 - lasso.y0) }} />}
        </div>
      )}
      <span className="rs-page-tag" aria-hidden>
        P {index + 1}
      </span>
      <IconButton label={`Collapse page ${index + 1}`} title="Collapse this page to bring the passages before and after it together" className="rs-page-collapse size-7" onClick={onCollapse}>
        <ChevronsDownUp className="size-3.5" aria-hidden />
      </IconButton>
      <span className="rs-page-label">{index + 1}</span>
    </div>
  );
});

export interface ViewerProps {
  doc: ResearchDocument;
  service: DocumentService;
  index: DocumentIndex | undefined;
  marks: ViewerMark[];
  focus: FocusRequest | null;
  /** Hits from the project search to show in this document. */
  searchQuery: string;
  collapsed: number[];
  onCollapsedChange: (pages: number[]) => void;
  onPassage: (action: "excerpt" | "relink" | "link" | AnnotationKind, p: Passage, color?: string) => void;
  onMark: (m: ViewerMark, at: { x: number; y: number }) => void;
  /** Mark ids to show as active (their workspace objects are selected or hovered). */
  activeIds: Set<string>;
  onMarkHover: (id: string | null) => void;
  /** Page to show when the document opens (restored reading position). */
  initialPage?: number;
  onPageChange?: (page: number) => void;
  /** When set, the next selection re-links this broken excerpt instead of creating one. */
  relink?: { label: string } | null;
  onCancelRelink?: () => void;
  /** The document's file couldn't be found (deleted or access removed). */
  onUnavailable?: () => void;
  tool: Tool;
  inkColor: string;
  /** Ink on this document's pages (current version). */
  ink: (PageInk & { page: number })[];
  onInk: (page: number, points: [number, number][], tool: "pen" | "highlighter") => void;
  onErase: (target: { kind: "ink" | "annotation"; id: string }) => void;
  /** Left rail actions. */
  rail?: React.ReactNode;
  onClose?: () => void;
  compact?: boolean;
}

export function Viewer(props: ViewerProps) {
  const { doc, service, index, marks, focus, collapsed } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitScale, setFitScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [page, setPage] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const [chip, setChip] = useState<{ p: Passage; x: number; y: number } | null>(null);
  const [flash, setFlash] = useState<{ page: number; rects: PdfRect[]; nonce: number } | null>(null);
  const [older, setOlder] = useState<{ fileId: string; revision: number } | null>(null);
  const [find, setFind] = useState<{ open: boolean; q: string; at: number }>({ open: false, q: "", at: 0 });
  const viewports = useRef(new Map<number, PageViewport>());
  const [, tick] = useState(0);
  const scale = zoom === "fit" ? fitScale : zoom;

  const fileId = older?.fileId ?? doc.viewFileId;
  const revision = older?.revision ?? doc.viewRevision;

  useEffect(() => {
    let cancelled = false;
    let loaded: { destroy(): Promise<void> } | null = null;
    setPdf(null);
    setError(null);
    viewports.current.clear();
    service
      .openPdf(fileId, revision)
      .then(async (d) => {
        loaded = d;
        const list: { w: number; h: number }[] = [];
        // Page sizes up front so the scroll height is right before pages render.
        for (let i = 1; i <= d.numPages; i++) {
          const v = (await d.getPage(i)).getViewport({ scale: 1 });
          list.push({ w: v.width, h: v.height });
          if (cancelled) return;
        }
        setSizes(list);
        setPdf(d);
      })
      .catch((e: { status?: number }) => {
        if (cancelled) return;
        if (e?.status === 404) {
          setError("This document's file is no longer available. It may have been deleted. Excerpts from it keep their captured text.");
          props.onUnavailable?.();
        } else setError("This document could not be opened. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, fileId, revision]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !sizes.length) return;
    const fit = () => {
      const widest = Math.max(...sizes.map((s) => (rotation % 180 ? s.h : s.w)));
      setFitScale(Math.max(0.3, Math.min(3, (el.clientWidth - 90) / widest)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sizes, rotation]);

  const onViewport = useCallback((i: number, vp: PageViewport) => {
    viewports.current.set(i, vp);
    tick((n) => n + 1);
  }, []);

  const scrollToPage = useCallback(
    (p: number, rects: PdfRect[] = [], doFlash = false) => {
      if (collapsed.includes(p)) props.onCollapsedChange(collapsed.filter((x) => x !== p));
      requestAnimationFrame(() => {
        const el = scroller.current?.querySelector<HTMLElement>(`[data-page="${p}"]`);
        if (!el || !scroller.current) return;
        const vp = viewports.current.get(p);
        const top = vp && rects[0] ? toView(vp, rects[0]).top : 0;
        scroller.current.scrollTo({ top: el.offsetTop + top - 90, behavior: "smooth" });
        if (doFlash && rects.length) setFlash({ page: p, rects, nonce: Date.now() });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collapsed],
  );

  // Open a focused passage (possibly in an older revision) and flash it.
  useEffect(() => {
    if (!focus || focus.documentId !== doc.id) return;
    const wantOld = focus.viewFileId && (focus.viewFileId !== doc.viewFileId || focus.viewRevision !== doc.viewRevision);
    const target = wantOld ? { fileId: focus.viewFileId!, revision: focus.viewRevision! } : null;
    if ((target?.fileId ?? null) !== (older?.fileId ?? null) || (target?.revision ?? null) !== (older?.revision ?? null)) setOlder(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  useEffect(() => {
    if (!focus || focus.documentId !== doc.id || !pdf) return;
    scrollToPage(focus.page, focus.rects, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, pdf]);

  const restored = useRef(false);
  useEffect(() => {
    if (!pdf || restored.current) return;
    restored.current = true;
    const p = props.initialPage ?? 0;
    if (p > 0 && p < sizes.length && !(focus && focus.documentId === doc.id)) {
      // Wait for layout, then jump without animation.
      requestAnimationFrame(() => {
        const el = scroller.current?.querySelector<HTMLElement>(`[data-page="${p}"]`);
        if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 18;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2000);
    return () => clearTimeout(t);
  }, [flash]);

  // ---- Bring distant passages together -------------------------------------
  // Click two places (or pinch with two fingers): the pages between them collapse.
  const [together, setTogether] = useState<{ first: number | null; note?: string } | null>(null);
  const collapseBetween = (a: number, b: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const range: number[] = [];
    for (let p = lo + 1; p < hi; p++) if (!collapsed.includes(p)) range.push(p);
    if (!range.length) return false;
    props.onCollapsedChange([...collapsed, ...range]);
    requestAnimationFrame(() => {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-page="${lo}"]`);
      if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop + el.offsetHeight / 2 - 40, behavior: "smooth" });
    });
    return true;
  };
  const pageAt = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest?.<HTMLElement>(".rs-page");
    return el ? Number(el.dataset.page) : null;
  };
  const onTogetherClick = (e: React.MouseEvent) => {
    if (!together) return;
    const p = pageAt(e.target);
    if (p === null) return;
    e.stopPropagation();
    e.preventDefault();
    if (together.first === null) return setTogether({ first: p });
    if (collapseBetween(together.first, p)) setTogether(null);
    else setTogether({ first: null, note: "Those places are on the same or neighbouring pages. Pick two places further apart." });
  };
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ start: number; pages: [number | null, number | null]; ys: [number, number]; done: boolean } | null>(null);
  const onReaderPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch.current = { start: Math.abs(a.y - b.y), pages: [pageAt(document.elementFromPoint(a.x, a.y)), pageAt(document.elementFromPoint(b.x, b.y))], ys: [a.y, b.y], done: false };
    }
  };
  const onReaderPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || !touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (!p || p.done || touches.current.size !== 2) return;
    const [a, b] = [...touches.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const d = Math.abs(a.y - b.y);
    const [pa, pb] = p.pages;
    if (d < p.start * 0.6 && pa !== null && pb !== null) {
      // Pinch in: the document closes up between the two fingers.
      p.done = collapseBetween(pa, pb);
    } else if (d > p.start * 1.6) {
      // Spread: reopen anything collapsed between the fingers.
      const [lo, hi] = [Math.min(...p.ys), Math.max(...p.ys)];
      const bars = Array.from(scroller.current?.querySelectorAll<HTMLElement>(".rs-collapsed-bar") ?? []).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 >= lo && r.top + r.height / 2 <= hi;
      });
      if (bars.length) {
        const keep = collapsed.filter((pg) => !bars.some((el) => pg >= Number(el.dataset.from) && pg <= Number(el.dataset.to)));
        props.onCollapsedChange(keep);
        p.done = true;
      }
    }
  };
  const onReaderPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
  };
  // Ctrl+wheel (and trackpad pinch) zooms the document, not the whole page.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const cur = z === "fit" ? fitScale : z;
        return Math.max(0.3, Math.min(4, cur * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fitScale, pdf]);

  // Track the page in view.
  // The selection toolbar and handles live in the scrolled content, so they move with the page.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const mid = el.scrollTop + el.clientHeight / 3;
    let current = 0;
    for (const p of Array.from(el.querySelectorAll<HTMLElement>("[data-page]"))) if (p.offsetTop <= mid) current = Number(p.dataset.page);
    if (current !== page) {
      setPage(current);
      setPageInput(String(current + 1));
      if (!older) props.onPageChange?.(current);
    }
    if (handles) placeHandles();
  };

  // Find in this document.
  const findHits = useMemo(() => {
    const q = find.open ? find.q : props.searchQuery;
    if (!index || q.trim().length < 2 || older) return [];
    return index.pages.flatMap((p) => findAll(p, q).map(([s, e]) => ({ page: p.page, rects: rectsFor(p, s, e) })));
  }, [index, find.open, find.q, props.searchQuery, older]);
  const currentHit = find.open && findHits.length ? findHits[Math.min(find.at, findHits.length - 1)] : null;
  const goHit = (delta: number) => {
    if (!findHits.length) return;
    const at = (find.at + delta + findHits.length) % findHits.length;
    setFind((f) => ({ ...f, at }));
    const h = findHits[at]!;
    scrollToPage(h.page, h.rects);
  };

  /** The current selection as a passage, if it lies within one page. */
  const fromSelection = (): Passage | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
    const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    const pageEl = node?.closest<HTMLElement>(".rs-page");
    if (!pageEl || !scroller.current?.contains(pageEl)) return null;
    const p = Number(pageEl.dataset.page);
    const vp = viewports.current.get(p);
    if (!vp) return null;
    const rects = selectionRects(sel, pageEl, vp);
    const selected = sel.toString().replace(/\s+/g, " ").trim();
    if (!rects.length || !selected) return null;
    // The page's text index gives the exact captured text, offsets and line boxes.
    const pageIndex = older ? undefined : index?.pages[p];
    const anchor = pageIndex ? anchorSelection(pageIndex, selected) : null;
    if (anchor) return { documentId: doc.id, page: p, rects: anchor.rects, quote: anchor.quote, start: anchor.start, end: anchor.end };
    return { documentId: doc.id, page: p, rects, quote: selected };
  };

  const onLasso = useCallback(
    (page: number, rect: PdfRect) => {
      const pg = index?.pages[page];
      const inside = pg ? pg.runs.filter((r) => r.x + r.w / 2 >= rect[0] && r.x + r.w / 2 <= rect[2] && r.y + r.h / 2 >= rect[1] && r.y + r.h / 2 <= rect[3]) : [];
      // Reading order: top to bottom, then left to right.
      const quote = inside
        .sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x))
        .map((r) => r.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      props.onPassage("excerpt", { documentId: doc.id, page, rects: [rect], quote: quote || `[Area of page ${page + 1}]`, area: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, doc.id, props.onPassage],
  );

  // Selection handles: drag either end to adjust the selection (pointer, pen or touch).
  const [handles, setHandles] = useState<{ a: { x: number; y: number; h: number }; b: { x: number; y: number; h: number } } | null>(null);
  const placeHandles = () => {
    const sel = window.getSelection();
    const el = scroller.current;
    if (!sel || sel.isCollapsed || !sel.rangeCount || !el) return setHandles(null);
    const rects = Array.from(sel.getRangeAt(0).getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) return setHandles(null);
    const box = el.getBoundingClientRect();
    const first = rects[0]!;
    const last = rects[rects.length - 1]!;
    const pos = (x: number, y: number) => ({ x: x - box.left + el.scrollLeft, y: y - box.top + el.scrollTop });
    setHandles({ a: { ...pos(first.left, first.top), h: first.height }, b: { ...pos(last.right, last.top), h: last.height } });
  };
  const handleDrag = useRef<{ which: "a" | "b"; fixed: { node: Node; offset: number } } | null>(null);
  const onHandleDown = (which: "a" | "b") => (e: React.PointerEvent) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = sel.getRangeAt(0);
    handleDrag.current = { which, fixed: which === "a" ? { node: r.endContainer, offset: r.endOffset } : { node: r.startContainer, offset: r.startOffset } };
    setChip(null);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = handleDrag.current;
    if (!d || !handles) return;
    // Aim at the text line, not at the handle's knob.
    const h = d.which === "a" ? handles.a.h : handles.b.h;
    const y = e.clientY + (d.which === "a" ? h * 0.9 : -h * 0.9);
    const caret = caretAt(e.clientX, y);
    if (!caret || !caret.node.parentElement?.closest(".pdf-text-layer")) return;
    const samePage = (n: Node) => (n instanceof Element ? n : n.parentElement)?.closest(".rs-page");
    if (samePage(caret.node) !== samePage(d.fixed.node)) return;
    const sel = window.getSelection()!;
    sel.setBaseAndExtent(d.fixed.node, d.fixed.offset, caret.node, caret.offset);
    placeHandles();
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (!handleDrag.current) return;
    handleDrag.current = null;
    const p = fromSelection();
    if (!p) return setHandles(null);
    const box = scroller.current!.getBoundingClientRect();
    setChip({ p, x: Math.min(Math.max(e.clientX - box.left, 180), box.width - 180) + scroller.current!.scrollLeft, y: e.clientY - box.top + scroller.current!.scrollTop + 18 });
    placeHandles();
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".rs-chip, .rs-handle")) return;
    requestAnimationFrame(() => {
      const p = fromSelection();
      if (!p) {
        setHandles(null);
        return setChip(null);
      }
      placeHandles();
      const box = scroller.current!.getBoundingClientRect();
      setChip({ p, x: Math.min(Math.max(e.clientX - box.left, 180), box.width - 180) + scroller.current!.scrollLeft, y: e.clientY - box.top + scroller.current!.scrollTop + 14 });
    });
  };

  const onDragStart = (e: React.DragEvent) => {
    const p = chip?.p ?? fromSelection();
    if (!p) return;
    e.dataTransfer.setData(PASSAGE_MIME, JSON.stringify(p));
    e.dataTransfer.setData("text/plain", p.quote);
    e.dataTransfer.effectAllowed = "copy";
  };

  const act = (action: "excerpt" | "relink" | "link" | AnnotationKind, color?: string) => {
    if (!chip) return;
    props.onPassage(action, chip.p, color);
    setChip(null);
    setHandles(null);
    window.getSelection()?.removeAllRanges();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea")) return;
    if (e.key === "PageDown" || (e.key === "ArrowRight" && e.altKey)) {
        e.preventDefault(); scrollToPage(Math.min(sizes.length - 1, page + 1));
      }
    if (e.key === "PageUp" || (e.key === "ArrowLeft" && e.altKey)) {
        e.preventDefault(); scrollToPage(Math.max(0, page - 1));
      }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault(); setFind((f) => ({ ...f, open: true }));
      }
    if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault(); setZoom(Math.min(4, scale * 1.2));
      }
    if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault(); setZoom(Math.max(0.3, scale / 1.2));
      }
  };

  // Overview strip positions (fractions of the scroll height).
  const total = scroller.current?.scrollHeight ?? 1;
  const at = (p: number, r?: PdfRect) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-page="${p}"]`);
    if (!el) return null;
    const vp = viewports.current.get(p);
    return Math.min(1, (el.offsetTop + (vp && r ? toView(vp, r).top : 0)) / total);
  };
  const ovColor: Record<ViewerMark["kind"], string> = { excerpt: "#7056e8", highlight: "#eab308", underline: "#2563eb", comment: "#0ea5e9" };

  const hidden = new Set(collapsed);
  const ranges: [number, number][] = [];
  for (const p of [...hidden].filter((x) => x < sizes.length).sort((a, b) => a - b)) {
    const last = ranges[ranges.length - 1];
    if (last && p === last[1] + 1) last[1] = p;
    else ranges.push([p, p]);
  }
  const rangeStart = new Map(ranges.map((r) => [r[0], r]));

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-200/60" aria-label={`Document: ${doc.name}`} data-viewer-doc={doc.id} onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1">
        <span className="mr-1 max-w-[16rem] truncate text-[13px] font-semibold text-ink-900" title={doc.name}>
          {doc.name}
        </span>
        {doc.textMode === "ocr" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800" title="Text was recognised by OCR and may contain errors">OCR text</span>}
        {doc.textMode === "converted" && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800" title="Laid out from the original file for reading; the original is unchanged">Converted copy</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label="Previous page" onClick={() => scrollToPage(Math.max(0, page - 1))} disabled={page === 0}>
            <ChevronUp className="size-4" aria-hidden />
          </IconButton>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <span className="sr-only">Page</span>
            <input
              aria-label="Page number"
              className="h-7 w-10 rounded border border-slate-300 text-center text-xs tabular-nums"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Math.max(1, Math.min(sizes.length, Number(pageInput) || 1));
                  scrollToPage(n - 1);
                }
              }}
            />
            <span className="tabular-nums">/ {sizes.length || "–"}</span>
          </label>
          <IconButton label="Next page" onClick={() => scrollToPage(Math.min(sizes.length - 1, page + 1))} disabled={page >= sizes.length - 1}>
            <ChevronDown className="size-4" aria-hidden />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <IconButton label="Zoom out" onClick={() => setZoom(Math.max(0.3, scale / 1.2))}>
            <Minus className="size-4" aria-hidden />
          </IconButton>
          <button type="button" className="w-12 text-center text-xs text-slate-600 tabular-nums hover:text-slate-900" onClick={() => setZoom("fit")} title="Fit to width">
            {Math.round(scale * 100)}%
          </button>
          <IconButton label="Zoom in" onClick={() => setZoom(Math.min(4, scale * 1.2))}>
            <Plus className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Fit to width" on={zoom === "fit"} onClick={() => setZoom("fit")}>
            <Maximize2 className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Rotate view" onClick={() => setRotation((r) => (r + 90) % 360)}>
            <RotateCw className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Bring together" title="Bring two distant places together: click one, then the other, and the pages between collapse (or pinch with two fingers)" on={!!together} onClick={() => setTogether((t) => (t ? null : { first: null }))}>
            <FoldVertical className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Find in document" on={find.open} onClick={() => setFind((f) => ({ ...f, open: !f.open }))}>
            <Search className="size-4" aria-hidden />
          </IconButton>
          {props.onClose && (
            <IconButton label="Close this viewer" onClick={props.onClose}>
              <X className="size-4" aria-hidden />
            </IconButton>
          )}
        </div>
      </div>
      {find.open && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
          <input
            autoFocus
            aria-label="Find in this document"
            placeholder="Find in this document"
            className="h-7 min-w-0 flex-1 rounded border border-slate-300 px-2 text-sm"
            value={find.q}
            onChange={(e) => setFind({ open: true, q: e.target.value, at: 0 })}
            onKeyDown={(e) => {
              if (e.key === "Enter") goHit(e.shiftKey ? -1 : 1);
              if (e.key === "Escape") setFind({ open: false, q: "", at: 0 });
            }}
          />
          <span className="text-xs text-slate-600 tabular-nums" aria-live="polite">
            {find.q.trim().length < 2 ? "" : findHits.length ? `${Math.min(find.at, findHits.length - 1) + 1} of ${findHits.length}` : "No matches"}
          </span>
          <IconButton label="Previous match" onClick={() => goHit(-1)} disabled={!findHits.length}>
            <ChevronUp className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Next match" onClick={() => goHit(1)} disabled={!findHits.length}>
            <ChevronDown className="size-4" aria-hidden />
          </IconButton>
        </div>
      )}
      {together && (
        <div role="status" className="flex items-center gap-2 border-b border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-700">
          <FoldVertical className="size-3.5" aria-hidden />
          {together.note ?? (together.first === null ? "Click the first place you want to bring together." : `Now click the second place (first: page ${together.first + 1}).`)}
          <button className="ml-auto font-semibold underline" onClick={() => setTogether(null)}>
            Cancel
          </button>
        </div>
      )}
      {props.relink && (
        <div role="status" className="flex items-center gap-2 border-b border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-700">
          <Link2 className="size-3.5" aria-hidden /> Select the passage again to re-link “{props.relink.label}”.
          <button className="ml-auto font-semibold underline" onClick={props.onCancelRelink}>
            Cancel
          </button>
        </div>
      )}
      {older && (
        <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          Showing an earlier version (revision {older.revision}) where this passage was captured.
          <button className="ml-auto font-semibold underline" onClick={() => setOlder(null)}>
            Back to current version
          </button>
        </div>
      )}
      {doc.warnings?.length ? <p className="border-b border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600">{doc.warnings[0]}</p> : null}
      <div className="relative flex min-h-0 flex-1">
        {props.rail}
        <div
          ref={scroller}
          data-reader-scroll
          data-tool={props.tool}
          className="relative min-w-0 flex-1 overflow-auto outline-none"
          style={{ touchAction: "pan-x pan-y" }}
          tabIndex={0}
          onScroll={onScroll}
          onMouseUp={onMouseUp}
          onDragStart={onDragStart}
          onClickCapture={onTogetherClick}
          onPointerDown={onReaderPointerDown}
          onPointerMove={onReaderPointerMove}
          onPointerUp={onReaderPointerUp}
          onPointerCancel={onReaderPointerUp}
        >
          {error ? (
            <p className="p-6 text-sm text-red-700">{error}</p>
          ) : !pdf ? (
            <p className="p-6 text-sm text-slate-500">Opening document…</p>
          ) : (
            <div className="rs-pages">
              {sizes.map((size, i) => {
                const range = rangeStart.get(i);
                if (range)
                  return (
                    <button key={`c${i}`} type="button" className="rs-collapsed-bar" data-from={range[0]} data-to={range[1]} onClick={() => props.onCollapsedChange(collapsed.filter((p) => p < range[0] || p > range[1]))}>
                      <ChevronsDownUp className="size-4" aria-hidden />
                      {range[0] === range[1] ? `Page ${range[0] + 1} collapsed` : `Pages ${range[0] + 1}–${range[1] + 1} collapsed`} · Expand
                    </button>
                  );
                if (hidden.has(i)) return null;
                const pageMarks = older ? marks.filter((m) => m.source.viewFileId === older.fileId && m.source.viewRevision === older.revision && m.source.page === i) : marks.filter((m) => m.source.page === i && m.source.viewFileId === doc.viewFileId && m.source.viewRevision === doc.viewRevision);
                return (
                  <Page
                    key={`${fileId}-${revision}-${i}`}
                    pdf={pdf}
                    index={i}
                    scale={scale}
                    rotation={rotation}
                    size={size}
                    marks={pageMarks}
                    hits={findHits.filter((h) => h.page === i).map((h) => ({ rects: h.rects, current: h === currentHit }))}
                    flash={flash && flash.page === i ? flash.rects : null}
                    activeIds={props.activeIds}
                    tool={props.tool}
                    inkColor={props.inkColor}
                    ink={older ? [] : props.ink.filter((s) => s.page === i)}
                    onStroke={props.onInk}
                    onErase={props.onErase}
                    onLasso={onLasso}
                    onViewport={onViewport}
                    onMark={props.onMark}
                    onMarkHover={props.onMarkHover}
                    onCollapse={() => props.onCollapsedChange([...collapsed, i])}
                  />
                );
              })}
            </div>
          )}
          {chip && (
            <div className="rs-chip" style={{ left: chip.x, top: chip.y }} role="toolbar" aria-label="Selected text">
              {props.relink ? (
                <button type="button" className="rs-chip-primary" onMouseDown={(e) => e.preventDefault()} onClick={() => act("relink")}>
                  <Link2 className="size-3.5" aria-hidden /> Use as new source
                </button>
              ) : (
                <button type="button" className="rs-chip-primary" onMouseDown={(e) => e.preventDefault()} onClick={() => act("excerpt")}>
                  <Quote className="size-3.5" aria-hidden /> Add excerpt
                </button>
              )}
              <span className="rs-chip-sep" />
              {HIGHLIGHT_COLORS.slice(0, 3).map((c) => (
                <button key={c} type="button" aria-label={`Highlight in ${c}`} title="Highlight" className="!px-1.5" onMouseDown={(e) => e.preventDefault()} onClick={() => act("highlight", c)}>
                  <span className="size-4 rounded-sm border border-white/30" style={{ background: c }} />
                </button>
              ))}
              <button type="button" aria-label="Highlight" title="Highlight" onMouseDown={(e) => e.preventDefault()} onClick={() => act("highlight", HIGHLIGHT_COLORS[0])}>
                <Highlighter className="size-3.5" aria-hidden />
              </button>
              <button type="button" aria-label="Underline" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => act("underline", "#2563eb")}>
                <Underline className="size-3.5" aria-hidden />
              </button>
              <button type="button" aria-label="Link to a card" title="Link this passage to a card on the workspace (then click the card)" onMouseDown={(e) => e.preventDefault()} onClick={() => act("link")}>
                <Link2 className="size-3.5" aria-hidden />
              </button>
              <button type="button" aria-label="Comment" title="Comment" onMouseDown={(e) => e.preventDefault()} onClick={() => act("comment", "#7dd3fc")}>
                <MessageSquarePlus className="size-3.5" aria-hidden />
              </button>
              <button type="button" aria-label="Copy with citation" title="Copy with citation" onMouseDown={(e) => e.preventDefault()} onClick={() => void navigator.clipboard?.writeText(`“${chip.p.quote}” (${doc.short || doc.name.replace(/\.[^.]+$/, "")}, p. ${chip.p.page + 1})`).then(() => setChip(null))}>
                <Copy className="size-3.5" aria-hidden />
              </button>
              <span className="rs-chip-grip" draggable onDragStart={onDragStart} title="Drag onto the workspace">
                <GripVertical className="size-3.5" aria-hidden /> drag
              </span>
            </div>
          )}
          {handles &&
            (["a", "b"] as const).map((w) => (
              <span
                key={w}
                className={`rs-handle rs-handle-${w}`}
                role="slider"
                aria-label={w === "a" ? "Selection start" : "Selection end"}
                aria-valuenow={0}
                style={{ left: handles[w].x, top: handles[w].y, height: handles[w].h }}
                onPointerDown={onHandleDown(w)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
              />
            ))}
        </div>
        <div className="rs-overview" aria-label="Where marks are in this document">
          {pdf &&
            [
              ...marks.filter((m) => !older && m.source.viewFileId === doc.viewFileId && m.source.viewRevision === doc.viewRevision).map((m) => ({ key: m.id, p: m.source.page, r: m.source.rects, color: ovColor[m.kind], label: `${m.kind === "excerpt" ? "Excerpt" : m.kind[0]!.toUpperCase() + m.kind.slice(1)} on page ${m.source.page + 1}` })),
              ...findHits.slice(0, 300).map((h, i) => ({ key: `hit${i}`, p: h.page, r: h.rects, color: "#f97316", label: `Match on page ${h.page + 1}` })),
            ].map((m) => {
              const y = at(m.p, m.r[0]);
              return y === null ? null : <button key={m.key} type="button" className="rs-ov" style={{ top: `${y * 100}%`, background: m.color }} aria-label={m.label} title={m.label} onClick={() => scrollToPage(m.p, m.r, true)} />;
            })}
        </div>
      </div>
    </section>
  );
}
