import {
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Highlighter,
  Info,
  LayoutList,
  MessageSquare,
  MessageSquareText,
  MousePointer2,
  PenLine,
  Printer,
  Redo2,
  RotateCw,
  Search,
  Signature,
  TextCursorInput,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ANNOTATION_COLORS, type FormFieldInfo, type FormValue, type PdfAnnotation, type PdfEditState, type PdfRect, type TextEdit } from "../model";
import { PageView, type Tool } from "./PageView";
import { CommentsPanel, SignatureDialog, Thumbnails } from "./panels";
import "./pdf-editor.css";
import { findInText, matchRects, openPdf, pageText, type PageText } from "./pdfjs";

export interface PdfEditorProps {
  /** The document to render (without our own annotations). */
  base: Uint8Array;
  initial: PdfEditState;
  fields: FormFieldInfo[];
  readOnly?: boolean;
  onChange: (state: PdfEditState) => void;
  onDownload?: () => void;
  onPrint?: () => void;
  onShowHistory?: () => void;
  onError?: (message: string) => void;
}

const TOOLS: { id: Tool; label: string; key: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "edittext", label: "Edit text", key: "E", icon: TextCursorInput },
  { id: "highlight", label: "Highlight", key: "H", icon: Highlighter },
  { id: "note", label: "Note", key: "N", icon: MessageSquare },
  { id: "ink", label: "Draw", key: "D", icon: PenLine },
  { id: "text", label: "Text box", key: "T", icon: Type },
  { id: "signature", label: "Signature", key: "S", icon: Signature },
];

interface SearchHit {
  view: number;
  rects: PdfRect[];
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function PdfEditor({ base, initial, fields, readOnly = false, onChange, onDownload, onPrint, onShowHistory, onError }: PdfEditorProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sizes, setSizes] = useState<{ width: number; height: number; rotate: number }[]>([]);
  const [state, setState] = useState<PdfEditState>(initial);
  const history = useRef<{ past: PdfEditState[]; future: PdfEditState[]; lastKey: string | null; lastAt: number }>({ past: [], future: [], lastKey: null, lastAt: 0 });
  const [, forceRender] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  // Each tool keeps its own colour: highlights and notes default to yellow, ink and text to dark.
  const [colors, setColors] = useState<Record<Tool, string>>({ select: "#ffd400", edittext: "#000000", highlight: "#ffd400", note: "#ffd400", ink: "#d32f2f", text: "#1e3a5f", signature: "#1e3a5f" });
  const color = colors[tool];
  const setColor = (c: string) => setColors((all) => ({ ...all, [tool]: c }));
  const [inkWidth, setInkWidth] = useState(2);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scale, setScale] = useState(1.25);
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureDialog, setSignatureDialog] = useState(false);
  const [showThumbs, setShowThumbs] = useState(true);
  const [showComments, setShowComments] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hitIndex, setHitIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const texts = useRef(new Map<number, PageText>());
  const searchInput = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    const task = openPdf(base);
    task.promise
      .then(async (d) => {
        if (cancelled) return;
        const first = await d.getPage(1);
        const v = first.getViewport({ scale: 1 });
        const fallback = { width: v.width, height: v.height, rotate: first.rotate };
        setSizes(Array.from({ length: d.numPages }, () => fallback));
        setDoc(d);
        // Fit width on open, within sensible bounds.
        const available = (scroller.current?.clientWidth ?? 900) - 48;
        setScale(Math.max(0.5, Math.min(1.5, available / v.width)));
        for (let i = 2; i <= d.numPages && !cancelled; i++) {
          const p = await d.getPage(i);
          const pv = p.getViewport({ scale: 1 });
          setSizes((s) => s.map((old, idx) => (idx === i - 1 ? { width: pv.width, height: pv.height, rotate: p.rotate } : old)));
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = (e as { name?: string }).name;
        setLoadError(name === "PasswordException" ? "This PDF is password-protected and can't be opened here." : "This PDF could not be displayed. It may be damaged.");
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [base]);

  /** Applies a change, records history, and reports it. Coalesces rapid edits to the same thing. */
  const commit = useCallback((next: PdfEditState, key: string | null = null) => {
    const h = history.current;
    const now = Date.now();
    setState((prev) => {
      if (!(key && h.lastKey === key && now - h.lastAt < 1500)) {
        h.past.push(prev);
        if (h.past.length > 200) h.past.shift();
      }
      h.future = [];
      h.lastKey = key;
      h.lastAt = now;
      return next;
    });
    onChangeRef.current(next);
    forceRender((n) => n + 1);
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;
  const update = useCallback((fn: (s: PdfEditState) => PdfEditState, key: string | null = null) => commit(fn(stateRef.current), key), [commit]);

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(stateRef.current);
    h.lastKey = null;
    setState(prev);
    onChangeRef.current(prev);
    setSelectedId(null);
    forceRender((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(stateRef.current);
    h.lastKey = null;
    setState(next);
    onChangeRef.current(next);
    forceRender((n) => n + 1);
  }, []);

  const viewIndexOf = useCallback((source: number) => state.pages.findIndex((p) => p.source === source), [state.pages]);

  const scrollToView = useCallback((view: number) => {
    const el = scroller.current?.querySelectorAll<HTMLElement>(".pdf-page")[view];
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  // Track the page in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const pages = el.querySelectorAll<HTMLElement>(".pdf-page");
      const mid = el.getBoundingClientRect().top + el.clientHeight / 3;
      let found = 0;
      pages.forEach((p, i) => {
        if (p.getBoundingClientRect().top <= mid) found = i;
      });
      setCurrentPage(found);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [doc]);

  // Search across all pages (text is cached after the first search).
  useEffect(() => {
    if (!doc) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found: SearchHit[] = [];
      for (const [view, entry] of state.pages.entries()) {
        let pt = texts.current.get(entry.source);
        if (!pt) {
          pt = await pageText(await doc.getPage(entry.source + 1));
          texts.current.set(entry.source, pt);
        }
        if (cancelled) return;
        for (const [s, e] of findInText(pt, q)) found.push({ view, rects: matchRects(pt, s, e) });
      }
      if (!cancelled) {
        setHits(found);
        setHitIndex(0);
        if (found[0]) scrollToView(found[0].view);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc, query, state.pages, scrollToView]);

  const goHit = (delta: number) => {
    if (!hits.length) return;
    const i = (hitIndex + delta + hits.length) % hits.length;
    setHitIndex(i);
    scrollToView(hits[i]!.view);
  };

  const deleteAnnotation = useCallback((id: string) => update((s) => ({ ...s, annotations: s.annotations.filter((a) => a.id !== id) })), [update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInput.current?.focus();
        return;
      }
      if (isTyping(e.target) || readOnly) return;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteAnnotation(selectedId);
        setSelectedId(null);
      } else if (e.key === "Escape") {
        setTool("select");
        setSelectedId(null);
      } else if (!mod && !e.altKey) {
        const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
        if (t) setTool(t.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, deleteAnnotation, readOnly]);

  const onCreate = useCallback(
    (a: PdfAnnotation) => {
      update((s) => ({ ...s, annotations: [...s.annotations, a] }));
      setSelectedId(a.id);
      if (a.kind === "note") setShowComments(true);
    },
    [update],
  );
  const onUpdate = useCallback((a: PdfAnnotation, coalesce = false) => update((s) => ({ ...s, annotations: s.annotations.map((x) => (x.id === a.id ? a : x)) }), coalesce ? `annot:${a.id}` : null), [update]);
  const onFormChange = useCallback((name: string, value: FormValue, coalesce: boolean) => update((s) => ({ ...s, formValues: { ...s.formValues, [name]: value } }), coalesce ? `form:${name}` : null), [update]);
  const onNeedSignature = useCallback(() => setSignatureDialog(true), []);
  const onEdit = useCallback((id: string | null) => setEditingId(id), []);
  const onTextEdit = useCallback(
    (e: TextEdit) =>
      update((s) => {
        const others = (s.textEdits ?? []).filter((x) => x.id !== e.id);
        // Typing the original text back removes the edit.
        return { ...s, textEdits: e.text === e.original ? others : [...others, e] };
      }),
    [update],
  );

  const byPage = useMemo(() => {
    const map = new Map<number, PdfAnnotation[]>();
    for (const a of state.annotations) map.set(a.page, [...(map.get(a.page) ?? []), a]);
    return map;
  }, [state.annotations]);

  const editsByPage = useMemo(() => {
    const map = new Map<number, TextEdit[]>();
    for (const e of state.textEdits ?? []) map.set(e.page, [...(map.get(e.page) ?? []), e]);
    return map;
  }, [state.textEdits]);

  const hitsByView = useMemo(() => {
    const map = new Map<number, PdfRect[]>();
    hits.forEach((h) => map.set(h.view, [...(map.get(h.view) ?? []), ...h.rects]));
    return map;
  }, [hits]);

  if (loadError) return <p role="alert" className="m-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</p>;

  const zoom = (factor: number) => setScale((s) => Math.max(0.4, Math.min(3, Math.round(s * factor * 100) / 100)));
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;

  return (
    <div className="pdf-editor">
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF tools">
        <div className="pdf-tool-group" role="radiogroup" aria-label="Tool">
          {TOOLS.map(({ id, label, key, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={tool === id}
              disabled={readOnly && id !== "select"}
              title={`${label} (${key})`}
              className={`pdf-tbtn ${tool === id ? "pdf-tbtn-active" : ""}`}
              onClick={() => {
                setTool(id);
                if (id === "signature" && !signature) setSignatureDialog(true);
              }}
            >
              <Icon aria-hidden className="size-4" />
              <span className="pdf-tbtn-label">{label}</span>
            </button>
          ))}
        </div>
        {!readOnly && tool !== "select" && tool !== "signature" && tool !== "edittext" && (
          <div className="pdf-tool-group" role="group" aria-label="Colour">
            {ANNOTATION_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} className={`pdf-swatch ${color === c ? "pdf-swatch-active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
            {tool === "ink" && (
              <label className="ml-1 flex items-center gap-1 text-xs text-slate-600">
                Width
                <select aria-label="Pen width" value={inkWidth} onChange={(e) => setInkWidth(Number(e.target.value))} className="pdf-select">
                  {[1, 2, 3, 5, 8].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {!readOnly && (
          <div className="pdf-tool-group">
            <button type="button" className="pdf-tbtn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
              <Undo2 aria-hidden className="size-4" />
            </button>
            <button type="button" className="pdf-tbtn" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
              <Redo2 aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              className="pdf-tbtn"
              title="Rotate current page"
              aria-label="Rotate current page"
              onClick={() => update((s) => ({ ...s, pages: s.pages.map((p, i) => (i === currentPage ? { ...p, rotation: (p.rotation + 90) % 360 } : p)) }))}
            >
              <RotateCw aria-hidden className="size-4" />
            </button>
          </div>
        )}
        <div className="pdf-tool-group">
          <button type="button" className="pdf-tbtn" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1 / 1.15)}>
            <ZoomOut aria-hidden className="size-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" className="pdf-tbtn" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.15)}>
            <ZoomIn aria-hidden className="size-4" />
          </button>
        </div>
        <div className="pdf-tool-group pdf-search" role="search">
          <Search aria-hidden className="size-4 text-slate-400" />
          <input
            ref={searchInput}
            aria-label="Search PDF"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), goHit(e.shiftKey ? -1 : 1))}
          />
          <span className="text-xs tabular-nums text-slate-500" aria-live="polite">
            {query.trim() ? (hits.length ? `${hitIndex + 1} of ${hits.length}` : "No results") : ""}
          </span>
          <button type="button" className="pdf-tbtn" aria-label="Previous result" disabled={!hits.length} onClick={() => goHit(-1)}>
            <ChevronUp aria-hidden className="size-4" />
          </button>
          <button type="button" className="pdf-tbtn" aria-label="Next result" disabled={!hits.length} onClick={() => goHit(1)}>
            <ChevronDown aria-hidden className="size-4" />
          </button>
        </div>
        <div className="pdf-tool-group ml-auto">
          <button type="button" className="pdf-tbtn" aria-label="Pages panel" aria-pressed={showThumbs} title="Pages" onClick={() => setShowThumbs(!showThumbs)}>
            <LayoutList aria-hidden className="size-4" />
          </button>
          <button type="button" className="pdf-tbtn" aria-label="Annotations panel" aria-pressed={showComments} title="Annotations" onClick={() => setShowComments(!showComments)}>
            <MessageSquareText aria-hidden className="size-4" />
          </button>
          {onShowHistory && (
            <button type="button" className="pdf-tbtn" aria-label="Version history" title="Version history" onClick={onShowHistory}>
              <Clock aria-hidden className="size-4" />
            </button>
          )}
          {onPrint && (
            <button type="button" className="pdf-tbtn" aria-label="Print" title="Print" onClick={onPrint}>
              <Printer aria-hidden className="size-4" />
            </button>
          )}
          {onDownload && (
            <button type="button" className="pdf-tbtn" aria-label="Download PDF" title="Download PDF" onClick={onDownload}>
              <Download aria-hidden className="size-4" />
            </button>
          )}
        </div>
      </div>

      {showInfo && (
        <div className="pdf-info" role="note">
          <Info aria-hidden className="size-4 shrink-0" />
          <span>
            {readOnly
              ? "This PDF is protected and opens read-only."
              : tool === "edittext"
                ? "Click any line of text to change or delete it. The original text is removed from the page when you save, and the new text uses the closest standard font (Helvetica, Times or Courier)."
                : "Edit the PDF's text with Edit text (E). You can also highlight, comment, draw, add text boxes and signatures, fill in forms, and rotate, reorder or delete pages."}
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => setShowInfo(false)}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}

      <div className="pdf-body">
        {showThumbs && doc && (
          <Thumbnails
            doc={doc}
            pages={state.pages}
            intrinsic={sizes.map((s) => s.rotate)}
            current={currentPage}
            readOnly={readOnly}
            onGo={scrollToView}
            onRotate={(i, delta) => update((s) => ({ ...s, pages: s.pages.map((p, idx) => (idx === i ? { ...p, rotation: (p.rotation + delta) % 360 } : p)) }))}
            onMove={(from, to) =>
              update((s) => {
                const pages = [...s.pages];
                const [moved] = pages.splice(from, 1);
                pages.splice(to, 0, moved!);
                return { ...s, pages };
              })
            }
            onDelete={(i) => {
              if (state.pages.length <= 1) return onError?.("A PDF needs at least one page.");
              update((s) => ({ ...s, pages: s.pages.filter((_, idx) => idx !== i) }));
            }}
          />
        )}
        <div ref={scroller} className="pdf-scroller" tabIndex={-1}>
          {!doc ? (
            <p className="p-8 text-sm text-slate-500">Rendering PDF…</p>
          ) : (
            state.pages.map((entry, view) => {
              const size = sizes[entry.source] ?? sizes[0]!;
              const rotation = (size.rotate + entry.rotation) % 360;
              const rotated = rotation % 180 === 0 ? { width: size.width, height: size.height } : { width: size.height, height: size.width };
              const current = hits[hitIndex];
              return (
                <PageView
                  key={entry.source}
                  doc={doc}
                  source={entry.source}
                  rotation={rotation}
                  scale={scale}
                  size={rotated}
                  annotations={byPage.get(entry.source) ?? []}
                  textEdits={editsByPage.get(entry.source) ?? []}
                  onTextEdit={onTextEdit}
                  fields={fields}
                  formValues={state.formValues}
                  tool={tool}
                  color={color}
                  inkWidth={inkWidth}
                  signature={signature}
                  selectedId={selectedId}
                  editingId={editingId}
                  readOnly={readOnly}
                  searchRects={hitsByView.get(view) ?? []}
                  currentSearch={current && current.view === view ? current.rects : null}
                  label={`Page ${view + 1} of ${state.pages.length}`}
                  onCreate={onCreate}
                  onUpdate={onUpdate}
                  onSelect={setSelectedId}
                  onEdit={onEdit}
                  onFormChange={onFormChange}
                  onNeedSignature={onNeedSignature}
                />
              );
            })
          )}
        </div>
        {showComments && (
          <CommentsPanel
            textEdits={state.textEdits ?? []}
            onRevertEdit={(e) => update((s) => ({ ...s, textEdits: (s.textEdits ?? []).filter((x) => x.id !== e.id) }))}
            annotations={state.annotations}
            pageOf={(a) => viewIndexOf(a.page)}
            selectedId={selectedId}
            readOnly={readOnly}
            onSelect={(a) => {
              setSelectedId(a.id);
              scrollToView(viewIndexOf(a.page));
            }}
            onComment={(a, comment) => onUpdate({ ...a, comment })}
            onDelete={(a) => deleteAnnotation(a.id)}
            onClose={() => setShowComments(false)}
          />
        )}
      </div>
      <footer className="pdf-status" aria-label="PDF status">
        <span>
          Page {Math.min(currentPage + 1, state.pages.length)} of {state.pages.length}
        </span>
        <span>{state.annotations.length} annotations</span>
        {(state.textEdits?.length ?? 0) > 0 && <span>{state.textEdits!.length} text edits</span>}
        {fields.length > 0 && <span>{fields.length} form fields</span>}
      </footer>
      {signatureDialog && (
        <SignatureDialog
          onClose={() => {
            setSignatureDialog(false);
            if (!signature) setTool("select");
          }}
          onSave={(dataUrl) => {
            setSignature(dataUrl);
            setSignatureDialog(false);
            setTool("signature");
          }}
        />
      )}
    </div>
  );
}
