import { ArrowDown, ArrowUp, Highlighter, MessageSquare, PenLine, RotateCcw, RotateCw, Signature, Trash2, Type, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import type { PageEntry, PdfAnnotation, TextEdit } from "../model";

function Thumb({ doc, source, rotation }: { doc: PDFDocumentProxy; source: number; rotation: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = canvas.current;
    if (!el || typeof IntersectionObserver === "undefined") return setVisible(true);
    const observer = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "300px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let cancel = () => {};
    void doc.getPage(source + 1).then((page) => {
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1, rotation });
      const vp = page.getViewport({ scale: 110 / base.width, rotation });
      const c = canvas.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const task = page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp });
      cancel = () => task.cancel();
      task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [doc, source, rotation, visible]);
  return <canvas ref={canvas} className="pdf-thumb-canvas" width={110} height={142} aria-hidden />;
}

export function Thumbnails({
  doc,
  pages,
  intrinsic,
  current,
  readOnly,
  onGo,
  onRotate,
  onMove,
  onDelete,
}: {
  doc: PDFDocumentProxy;
  pages: PageEntry[];
  intrinsic: number[];
  current: number;
  readOnly: boolean;
  onGo: (index: number) => void;
  onRotate: (index: number, delta: number) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (index: number) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  return (
    <nav className="pdf-thumbs" aria-label="Pages">
      <ol>
        {pages.map((p, i) => (
          <li
            key={`${p.source}`}
            className={`pdf-thumb ${i === current ? "pdf-thumb-current" : ""}`}
            draggable={!readOnly}
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => dragFrom !== null && e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i);
              setDragFrom(null);
            }}
          >
            <button type="button" className="pdf-thumb-btn" aria-label={`Go to page ${i + 1}`} aria-current={i === current ? "page" : undefined} onClick={() => onGo(i)}>
              <Thumb doc={doc} source={p.source} rotation={((intrinsic[p.source] ?? 0) + p.rotation) % 360} />
              <span className="pdf-thumb-num">{i + 1}</span>
            </button>
            {!readOnly && (
              <div className="pdf-thumb-actions">
                <button type="button" aria-label={`Rotate page ${i + 1} left`} title="Rotate left" onClick={() => onRotate(i, 270)}>
                  <RotateCcw aria-hidden className="size-3.5" />
                </button>
                <button type="button" aria-label={`Rotate page ${i + 1} right`} title="Rotate right" onClick={() => onRotate(i, 90)}>
                  <RotateCw aria-hidden className="size-3.5" />
                </button>
                <button type="button" aria-label={`Move page ${i + 1} up`} title="Move up" disabled={i === 0} onClick={() => onMove(i, i - 1)}>
                  <ArrowUp aria-hidden className="size-3.5" />
                </button>
                <button type="button" aria-label={`Move page ${i + 1} down`} title="Move down" disabled={i === pages.length - 1} onClick={() => onMove(i, i + 1)}>
                  <ArrowDown aria-hidden className="size-3.5" />
                </button>
                <button type="button" aria-label={`Delete page ${i + 1}`} title="Delete page" disabled={pages.length === 1} onClick={() => onDelete(i)}>
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const KIND_LABEL: Record<PdfAnnotation["kind"], { label: string; icon: typeof Highlighter }> = {
  highlight: { label: "Highlight", icon: Highlighter },
  note: { label: "Note", icon: MessageSquare },
  ink: { label: "Drawing", icon: PenLine },
  text: { label: "Text box", icon: Type },
  signature: { label: "Signature", icon: Signature },
};

export function CommentsPanel({
  textEdits,
  onRevertEdit,
  annotations,
  pageOf,
  selectedId,
  readOnly,
  onSelect,
  onComment,
  onDelete,
  onClose,
}: {
  textEdits: TextEdit[];
  onRevertEdit: (e: TextEdit) => void;
  annotations: PdfAnnotation[];
  pageOf: (a: PdfAnnotation) => number;
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (a: PdfAnnotation) => void;
  onComment: (a: PdfAnnotation, comment: string) => void;
  onDelete: (a: PdfAnnotation) => void;
  onClose: () => void;
}) {
  const sorted = [...annotations].filter((a) => pageOf(a) >= 0).sort((a, b) => pageOf(a) - pageOf(b) || b.rect[3] - a.rect[3]);
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // scrollIntoView may return a promise; never return it as a cleanup.
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);
  return (
    <aside className="pdf-comments" aria-label="Comments and annotations">
      <div className="pdf-panel-head">
        <h2>Annotations ({sorted.length})</h2>
        <button type="button" aria-label="Close annotations panel" onClick={onClose}>
          <X aria-hidden className="size-4" />
        </button>
      </div>
      {textEdits.length > 0 && (
        <section aria-label="Text edits" className="border-b border-slate-200">
          <h3 className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Text edits ({textEdits.length})</h3>
          <ul>
            {textEdits.map((e) => (
              <li key={e.id} className="pdf-comment">
                <p className="pdf-comment-quote">
                  <del className="text-red-700">{e.original}</del>
                </p>
                <p className="mt-1 text-slate-800">{e.text ? <ins className="text-green-800 no-underline">{e.text}</ins> : <em className="text-slate-500">(deleted)</em>}</p>
                {!readOnly && (
                  <button type="button" className="pdf-comment-delete" onClick={() => onRevertEdit(e)} aria-label={`Revert edit of "${e.original}"`}>
                    Revert
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {sorted.length === 0 ? (
        <p className="px-3 text-xs text-slate-500">Highlights, notes, drawings, text boxes and signatures you add appear here.</p>
      ) : (
        <ul>
          {sorted.map((a) => {
            const { label, icon: Icon } = KIND_LABEL[a.kind];
            return (
              <li key={a.id} ref={a.id === selectedId ? selectedRef : undefined} className={`pdf-comment ${a.id === selectedId ? "pdf-comment-selected" : ""}`}>
                <button type="button" className="pdf-comment-head" onClick={() => onSelect(a)}>
                  <span className="pdf-comment-swatch" style={{ background: a.color }} aria-hidden />
                  <Icon aria-hidden className="size-3.5" />
                  <span className="font-medium">{label}</span>
                  <span className="ml-auto text-slate-500">Page {pageOf(a) + 1}</span>
                </button>
                {a.kind === "highlight" && a.quote && <blockquote className="pdf-comment-quote">“{a.quote.length > 160 ? `${a.quote.slice(0, 160)}…` : a.quote}”</blockquote>}
                {a.kind === "text" && <p className="pdf-comment-quote">{a.text || "(empty)"}</p>}
                {a.kind !== "text" && (
                  <textarea
                    key={a.id + a.comment}
                    aria-label={`Comment on ${label.toLowerCase()} on page ${pageOf(a) + 1}`}
                    placeholder={readOnly ? "" : "Add a comment"}
                    defaultValue={a.comment}
                    readOnly={readOnly}
                    rows={a.comment ? 3 : 1}
                    className="pdf-comment-input"
                    onBlur={(e) => e.currentTarget.value !== a.comment && onComment(a, e.currentTarget.value)}
                  />
                )}
                {!readOnly && (
                  <button type="button" className="pdf-comment-delete" onClick={() => onDelete(a)} aria-label={`Delete ${label.toLowerCase()} on page ${pageOf(a) + 1}`}>
                    <Trash2 aria-hidden className="size-3.5" /> Delete
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

/** Draw a signature with mouse, pen or touch. Produces a transparent PNG. */
export function SignatureDialog({ onSave, onClose }: { onSave: (dataUrl: string) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#10213a";
  }, []);
  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * canvas.current!.width) / r.width, ((e.clientY - r.top) * canvas.current!.height) / r.height] as const;
  };
  const trimmed = (): string => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3]! > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
    const pad = 6;
    const out = document.createElement("canvas");
    out.width = Math.max(1, maxX - minX + pad * 2);
    out.height = Math.max(1, maxY - minY + pad * 2);
    out.getContext("2d")!.drawImage(c, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="sig-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h2 id="sig-title" className="px-5 pt-4 text-base font-semibold text-slate-900">
          Draw your signature
        </h2>
        <div className="px-5 py-4">
          <canvas
            ref={canvas}
            width={900}
            height={300}
            aria-label="Signature pad"
            className="h-[150px] w-full touch-none rounded-lg border border-dashed border-slate-300 bg-slate-50"
            onPointerDown={(e) => {
              drawing.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              const ctx = e.currentTarget.getContext("2d")!;
              const [x, y] = point(e);
              ctx.beginPath();
              ctx.moveTo(x, y);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const ctx = e.currentTarget.getContext("2d")!;
              const [x, y] = point(e);
              ctx.lineTo(x, y);
              ctx.stroke();
              setEmpty(false);
            }}
            onPointerUp={() => (drawing.current = false)}
          />
          <p className="mt-2 text-xs text-slate-500">This adds a visible signature image. It is not a certificate-based digital signature.</p>
        </div>
        <div className="flex justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm"
            onClick={() => {
              const c = canvas.current!;
              c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
              setEmpty(true);
            }}
          >
            Clear
          </button>
          <button type="button" className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={empty} className="rounded-md bg-[#1e4f8a] px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={() => onSave(trimmed())}>
            Use signature
          </button>
        </div>
      </div>
    </div>
  );
}
