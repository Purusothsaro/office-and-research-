import { openPdf } from "@octo/editor-pdf";
import { ChevronsDownUp, GripVertical, Highlighter, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { TextLayer, type PDFDocumentProxy, type PageViewport } from "pdfjs-dist";
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { collapsedRanges, ITEM_COLORS, type Annotation, type ExcerptItem, type PdfRect } from "../model";

export const EXCERPT_MIME = "application/x-octo-excerpt";

export interface ExcerptPayload {
  fileId: string;
  page: number;
  rects: PdfRect[];
  text: string;
}

export interface Focus {
  fileId: string;
  page: number;
  rects: PdfRect[];
  /** Changes on every request so the same place can be focused twice. */
  nonce: number;
}

const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#93c5fd", "#fca5a5", "#d8b4fe"];

function toView(vp: PageViewport, r: PdfRect) {
  const [a, b] = vp.convertToViewportPoint(r[0], r[1]) as [number, number];
  const [c, d] = vp.convertToViewportPoint(r[2], r[3]) as [number, number];
  return { left: Math.min(a, c), top: Math.min(b, d), width: Math.abs(c - a), height: Math.abs(d - b) };
}

/** Selection rectangles in PDF space, merged per line. */
function selectionRects(selection: Selection, box: HTMLElement, vp: PageViewport): PdfRect[] {
  const base = box.getBoundingClientRect();
  const rects: PdfRect[] = [];
  for (let i = 0; i < selection.rangeCount; i++) {
    for (const r of Array.from(selection.getRangeAt(i).getClientRects())) {
      if (r.width < 1 || r.height < 1) continue;
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
  doc: PDFDocumentProxy;
  index: number;
  scale: number;
  size: { w: number; h: number };
  excerpts: ExcerptItem[];
  annotations: Annotation[];
  flash: PdfRect[] | null;
  hits: PdfRect[];
  onViewport: (index: number, vp: PageViewport, el: HTMLDivElement) => void;
  onExcerptClick: (id: string) => void;
  onAnnotationClick: (a: Annotation, at: { x: number; y: number }) => void;
  onCollapse: () => void;
}

const Page = memo(function Page({ doc, index, scale, size, excerpts, annotations, flash, hits, onViewport, onExcerptClick, onAnnotationClick, onCollapse }: PageProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = box.current!;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let layer: TextLayer | null = null;
    let cancelRender = () => {};
    (async () => {
      const page = await doc.getPage(index + 1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setVp(viewport);
      onViewport(index, viewport, box.current!);
      const c = canvas.current!;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(viewport.width * ratio);
      c.height = Math.floor(viewport.height * ratio);
      const task = page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
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
  }, [doc, index, scale, visible, onViewport]);
  const w = vp?.width ?? size.w * scale;
  const h = vp?.height ?? size.h * scale;
  return (
    <div ref={box} className="ws-page" data-page={index} style={{ width: w, height: h, "--total-scale-factor": scale } as React.CSSProperties}>
      <canvas ref={canvas} className="ws-page-canvas" style={{ width: w, height: h }} aria-hidden />
      <div ref={text} className="pdf-text-layer" />
      {vp && (
        <div className="ws-page-marks">
          {hits.map((r, i) => (
            <span key={`h${i}`} className="ws-hit" style={toView(vp, r)} />
          ))}
          {annotations
            .filter((a) => a.kind === "highlight")
            .flatMap((a) =>
              a.rects.map((r, i) => (
                <button
                  key={`${a.id}-${i}`}
                  type="button"
                  className="ws-highlight-mark"
                  style={{ ...toView(vp, r), background: a.color }}
                  aria-label={`Highlight: ${a.text.slice(0, 60)}`}
                  onClick={(e) => onAnnotationClick(a, { x: e.clientX, y: e.clientY })}
                />
              )),
            )}
          {excerpts.flatMap((e) =>
            e.rects.map((r, i) => (
              <button
                key={`${e.id}-${i}`}
                type="button"
                className="ws-excerpt-mark"
                style={{ ...toView(vp, r), background: e.color }}
                title="Show this excerpt in the workspace"
                aria-label={`Excerpt: ${e.text.slice(0, 60)}`}
                onClick={() => onExcerptClick(e.id)}
              />
            )),
          )}
          {annotations
            .filter((a) => a.kind === "comment")
            .map((a) => {
              const first = a.rects[0] ? toView(vp, a.rects[0]) : { top: 0, left: 0, width: 0, height: 0 };
              return (
                <Fragment key={a.id}>
                  {a.rects.map((r, i) => (
                    <span key={i} className="ws-comment-underline" style={toView(vp, r)} />
                  ))}
                  <button
                    type="button"
                    className="ws-comment-pin"
                    style={{ top: first.top - 2 }}
                    aria-label={`Comment: ${a.note || "(empty)"}`}
                    title={a.note || "Comment"}
                    onClick={(e) => onAnnotationClick(a, { x: e.clientX, y: e.clientY })}
                  >
                    <MessageSquare aria-hidden className="size-3.5" />
                  </button>
                </Fragment>
              );
            })}
          {flash?.map((r, i) => (
            <span key={`f${i}`} className="ws-flash" style={toView(vp, r)} />
          ))}
        </div>
      )}
      <button type="button" className="ws-page-collapse" onClick={onCollapse} title="Collapse this page to bring passages before and after it together" aria-label={`Collapse page ${index + 1}`}>
        <ChevronsDownUp aria-hidden className="size-3.5" />
      </button>
      <span className="ws-page-num">{index + 1}</span>
    </div>
  );
});

export interface DocPaneProps {
  fileId: string;
  load: (fileId: string) => Promise<Uint8Array>;
  excerpts: ExcerptItem[];
  annotations: Annotation[];
  collapsed: number[];
  focus: Focus | null;
  hits: { page: number; rects: PdfRect[] }[];
  onExcerpt: (payload: ExcerptPayload) => void;
  onExcerptClick: (id: string) => void;
  onAnnotate: (kind: Annotation["kind"], payload: ExcerptPayload, color: string) => Annotation;
  onAnnotationChange: (a: Annotation) => void;
  onAnnotationDelete: (id: string) => void;
  onCollapsedChange: (pages: number[]) => void;
}

export function DocPane(props: DocPaneProps) {
  const { fileId, load, excerpts, annotations, collapsed, focus, hits } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [scale, setScale] = useState(1);
  const viewports = useRef(new Map<number, { vp: PageViewport; el: HTMLDivElement }>());
  const [pending, setPending] = useState<{ payload: ExcerptPayload; x: number; y: number } | null>(null);
  const [flash, setFlash] = useState<Focus | null>(null);
  const [popover, setPopover] = useState<{ a: Annotation; x: number; y: number } | null>(null);
  const [, setLayoutTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof openPdf> | null = null;
    setDoc(null);
    setError(null);
    viewports.current.clear();
    load(fileId)
      .then(async (bytes) => {
        task = openPdf(bytes);
        const d = await task.promise;
        if (cancelled) return;
        const list: { w: number; h: number }[] = [];
        for (let i = 1; i <= d.numPages; i++) {
          const v = (await d.getPage(i)).getViewport({ scale: 1 });
          list.push({ w: v.width, h: v.height });
        }
        if (cancelled) return;
        setSizes(list);
        setDoc(d);
      })
      .catch(() => !cancelled && setError("This document could not be opened. It may have been deleted or changed."));
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [fileId, load]);

  // Fit page width to the pane.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !sizes.length) return;
    const fit = () => setScale(Math.max(0.4, Math.min(2, (el.clientWidth - 64) / Math.max(...sizes.map((s) => s.w)))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sizes]);

  const jumpTo = (page: number, rects: PdfRect[], doFlash: boolean) => {
    // A collapsed page is expanded so the passage can be shown.
    if (collapsed.includes(page)) props.onCollapsedChange(collapsed.filter((p) => p !== page));
    requestAnimationFrame(() => {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
      if (!el) return;
      const entry = viewports.current.get(page);
      const top = entry && rects[0] ? toView(entry.vp, rects[0]).top : 0;
      scroller.current!.scrollTo({ top: el.offsetTop + top - 80, behavior: "smooth" });
      if (doFlash) setFlash({ fileId, page, rects, nonce: Date.now() });
    });
  };

  // Jump to a focused passage and flash it.
  useEffect(() => {
    if (!focus || focus.fileId !== fileId || !doc) return;
    jumpTo(focus.page, focus.rects, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, fileId, doc]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const onViewport = useRef((index: number, vp: PageViewport, el: HTMLDivElement) => {
    viewports.current.set(index, { vp, el });
    setLayoutTick((n) => n + 1);
  }).current;

  /** Builds a payload from the current text selection, if it lies in one page. */
  const fromSelection = (): ExcerptPayload | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
    const pageEl = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest<HTMLElement>(".ws-page");
    if (!pageEl || !scroller.current?.contains(pageEl)) return null;
    const page = Number(pageEl.dataset.page);
    const entry = viewports.current.get(page);
    if (!entry) return null;
    const rects = selectionRects(sel, pageEl, entry.vp);
    return rects.length ? { fileId, page, rects, text: sel.toString().replace(/\s+\n/g, "\n").trim() } : null;
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".ws-sel-chip, .ws-popover")) return;
    // Let the browser finish updating the selection first.
    requestAnimationFrame(() => {
      const payload = fromSelection();
      if (!payload) return setPending(null);
      const box = scroller.current!.getBoundingClientRect();
      setPending({ payload, x: e.clientX - box.left + scroller.current!.scrollLeft, y: e.clientY - box.top + scroller.current!.scrollTop + 12 });
    });
  };

  const onDragStart = (e: React.DragEvent) => {
    const payload = pending?.payload ?? fromSelection();
    if (!payload) return;
    e.dataTransfer.setData(EXCERPT_MIME, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", payload.text);
    e.dataTransfer.effectAllowed = "copy";
  };

  const finish = () => {
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  const openPopover = (a: Annotation, at: { x: number; y: number }) => {
    const box = scroller.current!.getBoundingClientRect();
    setPopover({ a, x: at.x - box.left + scroller.current!.scrollLeft, y: at.y - box.top + scroller.current!.scrollTop + 10 });
  };

  // Overview strip: where everything is in the document, as fractions of its height.
  const total = scroller.current?.scrollHeight ?? 1;
  const markAt = (page: number, rect?: PdfRect) => {
    const entry = viewports.current.get(page);
    const pageEl = scroller.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!pageEl) return null;
    const inner = entry && rect ? toView(entry.vp, rect).top : 0;
    return Math.min(1, (pageEl.offsetTop + inner) / total);
  };
  const marks: { key: string; at: number | null; cls: string; page: number; rects: PdfRect[]; label: string }[] = [
    ...excerpts.map((x) => ({ key: x.id, at: markAt(x.page, x.rects[0]), cls: "ws-ov-excerpt", page: x.page, rects: x.rects, label: `Excerpt on page ${x.page + 1}` })),
    ...annotations.map((a) => ({ key: a.id, at: markAt(a.page, a.rects[0]), cls: a.kind === "comment" ? "ws-ov-comment" : "ws-ov-highlight", page: a.page, rects: a.rects, label: `${a.kind === "comment" ? "Comment" : "Highlight"} on page ${a.page + 1}` })),
    ...hits.map((h, i) => ({ key: `hit${i}`, at: markAt(h.page, h.rects[0]), cls: "ws-ov-hit", page: h.page, rects: h.rects, label: `Search result on page ${h.page + 1}` })),
  ];

  if (error) return <p className="p-6 text-sm text-red-700">{error}</p>;
  const ranges = collapsedRanges(collapsed.filter((p) => p < sizes.length));
  const rangeStart = new Map(ranges.map((r) => [r[0], r]));
  const hidden = new Set(collapsed);

  return (
    <div className="ws-doc-frame">
      <div
        ref={scroller}
        className="ws-doc-scroll"
        onMouseUp={onMouseUp}
        onDragStart={onDragStart}
        onScroll={() => {
          if (pending) setPending(null);
          // Keep a comment open while it's being typed.
          if (popover && !(document.activeElement as HTMLElement | null)?.closest(".ws-popover")) setPopover(null);
        }}
      >
        {!doc ? (
          <p className="p-6 text-sm text-slate-500">Opening document…</p>
        ) : (
          sizes.map((size, i) => {
            const range = rangeStart.get(i);
            if (range) {
              const count = range[1] - range[0] + 1;
              return (
                <button key={`c${i}`} type="button" className="ws-collapsed" onClick={() => props.onCollapsedChange(collapsed.filter((p) => p < range[0] || p > range[1]))}>
                  <ChevronsDownUp aria-hidden className="size-4" />
                  {count === 1 ? `Page ${range[0] + 1} collapsed` : `Pages ${range[0] + 1}–${range[1] + 1} collapsed`} · Expand
                </button>
              );
            }
            if (hidden.has(i)) return null;
            return (
              <Page
                key={i}
                doc={doc}
                index={i}
                scale={scale}
                size={size}
                excerpts={excerpts.filter((x) => x.page === i)}
                annotations={annotations.filter((a) => a.page === i)}
                flash={flash && flash.page === i ? flash.rects : null}
                hits={hits.filter((h) => h.page === i).flatMap((h) => h.rects)}
                onViewport={onViewport}
                onExcerptClick={props.onExcerptClick}
                onAnnotationClick={openPopover}
                onCollapse={() => props.onCollapsedChange([...collapsed, i])}
              />
            );
          })
        )}
        {pending && (
          <div className="ws-sel-chip" style={{ left: pending.x, top: pending.y }} draggable onDragStart={onDragStart}>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => (props.onExcerpt(pending.payload), finish())}>
              <Plus aria-hidden className="size-3.5" /> Add to workspace
            </button>
            <span className="ws-chip-sep" />
            {HIGHLIGHT_COLORS.slice(0, 3).map((c) => (
              <button key={c} type="button" className="ws-chip-swatch" aria-label={`Highlight ${c}`} title="Highlight" style={{ background: c }} onMouseDown={(e) => e.preventDefault()} onClick={() => (props.onAnnotate("highlight", pending.payload, c), finish())} />
            ))}
            <button type="button" className="ws-chip-plain" aria-label="Highlight" onMouseDown={(e) => e.preventDefault()} onClick={() => (props.onAnnotate("highlight", pending.payload, HIGHLIGHT_COLORS[0]!), finish())}>
              <Highlighter aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              className="ws-chip-plain"
              aria-label="Comment"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const created = props.onAnnotate("comment", pending.payload, "#93c5fd");
                // Open the new comment for typing where the selection was.
                setPopover({ a: created, x: pending.x, y: pending.y });
                finish();
              }}
            >
              <MessageSquare aria-hidden className="size-3.5" />
            </button>
            <span className="ws-sel-hint" title="Drag onto the workspace">
              <GripVertical aria-hidden className="size-3.5" /> or drag
            </span>
          </div>
        )}
        {popover && (
          <div className="ws-popover" role="dialog" aria-label={popover.a.kind === "comment" ? "Comment" : "Highlight"} style={{ left: popover.x, top: popover.y }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">{popover.a.kind === "comment" ? "Comment" : "Highlight"} · p. {popover.a.page + 1}</span>
              <button type="button" aria-label="Close" onClick={() => setPopover(null)}>
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
            <blockquote className="ws-popover-quote">“{popover.a.text.slice(0, 200)}”</blockquote>
            {popover.a.kind === "comment" ? (
              <textarea
                autoFocus
                aria-label="Comment text"
                className="ws-popover-input"
                defaultValue={popover.a.note ?? ""}
                placeholder="Write a comment"
                onBlur={(e) => props.onAnnotationChange({ ...popover.a, note: e.currentTarget.value })}
              />
            ) : (
              <div className="flex gap-1.5">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button key={c} type="button" className="ws-chip-swatch" aria-label={`Colour ${c}`} style={{ background: c }} onClick={() => (props.onAnnotationChange({ ...popover.a, color: c }), setPopover({ ...popover, a: { ...popover.a, color: c } }))} />
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button type="button" className="ws-popover-btn" onClick={() => (props.onExcerpt({ fileId, page: popover.a.page, rects: popover.a.rects, text: popover.a.text }), setPopover(null))}>
                <Plus aria-hidden className="size-3.5" /> To workspace
              </button>
              <button type="button" className="ws-popover-btn ws-popover-delete" onClick={() => (props.onAnnotationDelete(popover.a.id), setPopover(null))}>
                <Trash2 aria-hidden className="size-3.5" /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="ws-overview" aria-label="Document overview">
        {marks.map((m) =>
          m.at === null ? null : (
            <button key={m.key} type="button" className={`ws-ov-mark ${m.cls}`} style={{ top: `${m.at * 100}%` }} aria-label={m.label} title={m.label} onClick={() => jumpTo(m.page, m.rects, true)} />
          ),
        )}
      </div>
    </div>
  );
}

export { HIGHLIGHT_COLORS, ITEM_COLORS };
