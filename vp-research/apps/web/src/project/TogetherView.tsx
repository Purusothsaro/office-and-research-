import { citation, rectsFor, search, type DocumentIndex, type PdfRect, type ResearchWorkspace } from "@octo/research";
import { Minus, Plus, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { OpenPdf } from "../lib/pdf";
import type { DocumentService } from "./documents";
import { PASSAGE_MIME, type Passage } from "./Viewer";

export interface TogetherItem {
  key: string;
  documentId: string;
  page: number;
  rects: PdfRect[];
  label: string;
  kind: "hit" | "highlight" | "underline" | "comment" | "excerpt";
  quote: string;
  start?: number;
  end?: number;
}

const KIND_COLOR: Record<TogetherItem["kind"], string> = { hit: "rgba(249,115,22,.4)", highlight: "rgba(234,179,8,.4)", underline: "rgba(37,99,235,.28)", comment: "rgba(14,165,233,.3)", excerpt: "rgba(112,86,232,.3)" };

/** Renders whole pages once and shares them between strips (keyed by file revision and page). */
class PageImages {
  private docs = new Map<string, Promise<OpenPdf>>();
  private pages = new Map<string, Promise<{ canvas: HTMLCanvasElement; vp: { convertToViewportPoint(x: number, y: number): number[] } }>>();
  constructor(private readonly service: DocumentService) {}
  get(fileId: string, revision: number, page: number) {
    const key = `${fileId}@${revision}:${page}`;
    let p = this.pages.get(key);
    if (!p) {
      const docKey = `${fileId}@${revision}`;
      let d = this.docs.get(docKey);
      if (!d) this.docs.set(docKey, (d = this.service.openPdf(fileId, revision)));
      p = d.then(async (pdf) => {
        const pg = await pdf.getPage(page + 1);
        const vp = pg.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        await pg.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        return { canvas, vp };
      });
      this.pages.set(key, p);
    }
    return p;
  }
  dispose() {
    for (const d of this.docs.values()) void d.then((x) => x.destroy()).catch(() => undefined);
  }
}

const Strip = memo(function Strip({ item, ws, images, context, onOpen }: { item: TogetherItem; ws: ResearchWorkspace; images: PageImages; context: number; onOpen: (i: TogetherItem) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "400px 0px" });
    io.observe(box.current!);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const doc = ws.documents.find((d) => d.id === item.documentId);
    if (!doc) return;
    let cancelled = false;
    void images.get(doc.viewFileId, doc.viewRevision, item.page).then(({ canvas, vp }) => {
      const c = ref.current;
      if (cancelled || !c) return;
      const pts = item.rects.flatMap((r) => [vp.convertToViewportPoint(r[0], r[1]), vp.convertToViewportPoint(r[2], r[3])]);
      const ys = pts.map((p) => p[1]!);
      // "Context" is how much of the page around the passage is shown (PDF points at 1.6×).
      const pad = context * 1.6;
      const top = Math.max(0, Math.min(...ys) - pad);
      const bottom = Math.min(canvas.height, Math.max(...ys) + pad);
      c.width = canvas.width;
      c.height = Math.max(24, Math.round(bottom - top));
      const ctx = c.getContext("2d")!;
      ctx.drawImage(canvas, 0, top, canvas.width, c.height, 0, 0, canvas.width, c.height);
      ctx.fillStyle = KIND_COLOR[item.kind];
      for (const r of item.rects) {
        const [a, b] = vp.convertToViewportPoint(r[0], r[1]) as [number, number];
        const [d, e] = vp.convertToViewportPoint(r[2], r[3]) as [number, number];
        ctx.fillRect(Math.min(a, d) - 2, Math.min(b, e) - top - 1, Math.abs(d - a) + 4, Math.abs(e - b) + 2);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, item, ws.documents, images, context]);
  const passage: Passage = { documentId: item.documentId, page: item.page, rects: item.rects, quote: item.quote, ...(item.start !== undefined && item.end !== undefined ? { start: item.start, end: item.end } : {}) };
  return (
    <div ref={box} className="group rounded-lg border border-slate-200 bg-white shadow-sm" data-together-item={item.key}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-1">
        <span className="text-[11px] font-semibold text-brand-700">{item.label}</span>
        <span className="ml-auto text-[10px] text-slate-400 opacity-0 group-hover:opacity-100">drag to the workspace</span>
      </div>
      <button
        type="button"
        className="block w-full cursor-pointer"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(PASSAGE_MIME, JSON.stringify(passage));
          e.dataTransfer.setData("text/plain", item.quote);
        }}
        onClick={() => onOpen(item)}
        aria-label={`Open in the document: ${item.label}`}
        title="Open this place in the full document"
      >
        <canvas ref={ref} className="block w-full" />
      </button>
    </div>
  );
});

/**
 * Search results or marks from every document gathered into one column, each
 * shown on its page with adjustable context. Pinch (trackpad, Ctrl+scroll or
 * two fingers) or the − / + buttons change how much of the page is shown.
 */
export function TogetherView({ ws, service, indexes, query, onOpen, onClose }: { ws: ResearchWorkspace; service: DocumentService; indexes: Map<string, DocumentIndex>; query: string; onOpen: (i: TogetherItem) => void; onClose: () => void }) {
  const images = useMemo(() => new PageImages(service), [service]);
  useEffect(() => () => images.dispose(), [images]);
  const [context, setContext] = useState(28);
  const [q, setQ] = useState(query);
  const [show, setShow] = useState<"search" | "marks">(query.trim().length >= 2 ? "search" : "marks");
  const root = useRef<HTMLDivElement>(null);
  const label = (docId: string, page: number) => {
    const d = ws.documents.find((x) => x.id === docId);
    return `${d?.short || d?.name.replace(/\.[^.]+$/, "") || "Document"}, p. ${page + 1}`;
  };
  const items: TogetherItem[] = useMemo(() => {
    if (show === "search") {
      if (q.trim().length < 2) return [];
      return search([...indexes.values()], q, { limit: 120 }).hits.map((h, i) => {
        const pg = indexes.get(h.documentId)!.pages[h.page]!;
        return { key: `h${i}`, documentId: h.documentId, page: h.page, rects: rectsFor(pg, h.start, h.end), label: label(h.documentId, h.page), kind: "hit" as const, quote: pg.text.slice(h.start, h.end), start: h.start, end: h.end };
      });
    }
    const out: TogetherItem[] = [];
    for (const a of ws.annotations) {
      const s = ws.sources[a.sourceId];
      if (s) out.push({ key: a.id, documentId: s.documentId, page: s.page, rects: s.rects, label: `${a.kind === "comment" ? "Comment" : a.kind === "underline" ? "Underline" : "Highlight"} · ${label(s.documentId, s.page)}${a.note ? ` — ${a.note}` : ""}`, kind: a.kind, quote: s.quote });
    }
    for (const c of ws.cards) {
      if (c.type !== "excerpt") continue;
      const s = ws.sources[c.sourceId];
      if (s) out.push({ key: c.id, documentId: s.documentId, page: s.page, rects: s.rects, label: `Excerpt · ${citation(ws, c.sourceId)}`, kind: "excerpt", quote: s.quote });
    }
    const order = (id: string) => ws.documents.findIndex((d) => d.id === id);
    return out.sort((a, b) => order(a.documentId) - order(b.documentId) || a.page - b.page || b.rects[0]![1] - a.rects[0]![1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, q, indexes, ws.annotations, ws.cards, ws.sources, ws.documents]);

  // Pinch / Ctrl+wheel changes the context shown around every item.
  useEffect(() => {
    const el = root.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setContext((c) => Math.max(4, Math.min(400, Math.round(c * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const touches = useRef(new Map<number, number>());
  const pinch = useRef<{ d: number; c: number } | null>(null);

  return (
    <section
      ref={root}
      aria-label="Together view"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-100"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        touches.current.set(e.pointerId, e.clientY);
        if (touches.current.size === 2) {
          const [a, b] = [...touches.current.values()] as [number, number];
          pinch.current = { d: Math.max(20, Math.abs(a - b)), c: context };
        }
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== "touch" || !touches.current.has(e.pointerId)) return;
        touches.current.set(e.pointerId, e.clientY);
        if (pinch.current && touches.current.size === 2) {
          const [a, b] = [...touches.current.values()] as [number, number];
          setContext(Math.max(4, Math.min(400, Math.round((pinch.current.c * Math.abs(a - b)) / pinch.current.d))));
        }
      }}
      onPointerUp={(e) => {
        touches.current.delete(e.pointerId);
        if (touches.current.size < 2) pinch.current = null;
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-2 py-1.5">
        <div role="tablist" aria-label="Show together" className="flex rounded-md bg-slate-100 p-0.5">
          {(
            [
              ["search", "Search results"],
              ["marks", "Highlights & excerpts"],
            ] as const
          ).map(([id, name]) => (
            <button key={id} role="tab" aria-selected={show === id} className={`rounded px-2 py-0.5 text-xs font-medium ${show === id ? "bg-white text-ink-900 shadow-sm" : "text-slate-600"}`} onClick={() => setShow(id)}>
              {name}
            </button>
          ))}
        </div>
        {show === "search" && <input className="h-7 min-w-0 flex-1 rounded border border-slate-300 px-2 text-sm" placeholder="Search all documents" aria-label="Search to show together" value={q} onChange={(e) => setQ(e.target.value)} />}
        <div className="ml-auto flex items-center gap-1 text-xs text-slate-600" role="group" aria-label="Context">
          <span>Context</span>
          <button className="rounded p-1 hover:bg-slate-100" aria-label="Less context" onClick={() => setContext((c) => Math.max(4, Math.round(c / 1.4)))}>
            <Minus className="size-3.5" aria-hidden />
          </button>
          <span className="w-12 text-center tabular-nums" aria-live="polite" data-testid="context-size">
            {Math.round(context / 14)} line{Math.round(context / 14) === 1 ? "" : "s"}
          </span>
          <button className="rounded p-1 hover:bg-slate-100" aria-label="More context" onClick={() => setContext((c) => Math.min(400, Math.round(c * 1.4)))}>
            <Plus className="size-3.5" aria-hidden />
          </button>
        </div>
        <button className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close together view" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="px-3 pt-2 text-[11px] text-slate-500" aria-live="polite">
        {items.length} {show === "search" ? (q.trim().length < 2 ? "— type at least 2 characters" : `result${items.length === 1 ? "" : "s"} for “${q}”`) : `mark${items.length === 1 ? "" : "s"}`} across {new Set(items.map((i) => i.documentId)).size} document{new Set(items.map((i) => i.documentId)).size === 1 ? "" : "s"}. Pinch or Ctrl+scroll to change the context; click a strip to open it in the document.
      </p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" role="list" aria-label="Gathered passages">
        {items.map((it) => (
          <div role="listitem" key={it.key}>
            <Strip item={it} ws={ws} images={images} context={context} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </section>
  );
}
