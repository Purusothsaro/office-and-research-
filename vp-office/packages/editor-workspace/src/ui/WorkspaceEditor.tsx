import { findInText, matchRects, openPdf, pageText, type PageText } from "@octo/editor-pdf";
import { Columns2, FileDown, FileText, Link2, ListTree, Maximize, PenLine, Plus, Redo2, Search, SquareDashed, StickyNote, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { citation, ITEM_COLORS, newId, outline, passageCitation, type Annotation, type ExcerptItem, type PdfRect, type Workspace, type WorkspaceItem } from "../model";
import { Canvas } from "./Canvas";
import { DocPane, type ExcerptPayload, type Focus } from "./DocPane";
import "./workspace.css";

export interface WorkspaceEditorProps {
  initial: Workspace;
  onChange: (ws: Workspace) => void;
  /** PDF bytes for a document in the workspace. */
  loadDocument: (fileId: string) => Promise<Uint8Array>;
  /** The user's PDFs that can be added. */
  listDocuments: () => Promise<{ id: string; name: string }[]>;
  onExportOutline: (ws: Workspace) => void;
  onExportPdf?: (ws: Workspace) => void;
  onError?: (message: string) => void;
}

interface SearchHit {
  fileId: string;
  page: number;
  rects: PdfRect[];
  snippet: string;
  text: string;
}

export function WorkspaceEditor({ initial, onChange, loadDocument, listDocuments, onExportOutline, onExportPdf, onError }: WorkspaceEditorProps) {
  const [ws, setWs] = useState(initial);
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const history = useRef<{ past: Workspace[]; future: Workspace[]; key: string | null; at: number }>({ past: [], future: [], key: null, at: 0 });
  const [, rerender] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [selected, setSelected] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [pen, setPen] = useState<{ color: string; width: number } | null>(null);
  const [active, setActive] = useState<[string | null, string | null]>([initial.documents[0]?.fileId ?? null, initial.documents[1]?.fileId ?? initial.documents[0]?.fileId ?? null]);
  const [split, setSplit] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [focusItem, setFocusItem] = useState<{ id: string; nonce: number } | null>(null);
  const [picker, setPicker] = useState<{ id: string; name: string }[] | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const texts = useRef(new Map<string, PageText[]>());

  /** Applies a change with undo history; rapid edits to the same thing coalesce. View-only changes skip history. */
  const update = useCallback((fn: (w: Workspace) => Workspace, key: string | null = null) => {
    const prev = wsRef.current;
    const next = fn(prev);
    if (next === prev) return;
    const h = history.current;
    const now = Date.now();
    if (key !== "view" && !(key && h.key === key && now - h.at < 1200)) {
      h.past.push(prev);
      if (h.past.length > 200) h.past.shift();
      h.future = [];
    }
    h.key = key;
    h.at = now;
    wsRef.current = next;
    setWs(next);
    onChangeRef.current(next);
    rerender((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.past.pop();
    if (!prev) return;
    history.current.future.push(wsRef.current);
    history.current.key = null;
    wsRef.current = prev;
    setWs(prev);
    onChangeRef.current(prev);
    rerender((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(wsRef.current);
    history.current.key = null;
    wsRef.current = next;
    setWs(next);
    onChangeRef.current(next);
    rerender((n) => n + 1);
  }, []);

  /**
   * Where a new item of size w×h goes: near the middle of the view, moved
   * down (then to the next column) until it doesn't cover another card.
   */
  const viewCenter = (w = 260, h = 110) => {
    const el = document.querySelector(".ws-canvas");
    const r = el?.getBoundingClientRect();
    const { x, y, zoom } = wsRef.current.view;
    const start = { x: Math.round(((r?.width ?? 800) / 2 - x) / zoom - w / 2), y: Math.round(((r?.height ?? 600) / 3 - y) / zoom) };
    const cards = wsRef.current.items.filter((i) => i.type !== "group");
    const overlaps = (px: number, py: number) => cards.some((c) => px < c.x + c.w + 12 && px + w + 12 > c.x && py < c.y + c.h + 12 && py + h + 12 > c.y);
    for (let col = 0; col < 6; col++) {
      for (let row = 0; row < 12; row++) {
        const px = start.x + col * (w + 24);
        const py = start.y + row * 40;
        if (!overlaps(px, py)) return { x: px, y: py };
      }
    }
    return start;
  };

  const addExcerpt = (payload: ExcerptPayload, at = viewCenter()) => {
    const item: ExcerptItem = { id: newId(), type: "excerpt", x: Math.round(at.x), y: Math.round(at.y), w: 260, h: 90, color: ITEM_COLORS[0]!, ...payload };
    update((w) => ({ ...w, items: [...w.items, item] }));
    setSelected([item.id]);
  };

  const addNote = () => {
    const at = viewCenter(220, 120);
    const item: WorkspaceItem = { id: newId(), type: "note", x: Math.round(at.x), y: Math.round(at.y), w: 220, h: 120, color: "#fef9c3", text: "" };
    update((w) => ({ ...w, items: [...w.items, item] }));
    setSelected([item.id]);
  };

  const addGroup = () => {
    const at = viewCenter(260, 110);
    const n = wsRef.current.items.filter((i) => i.type === "group").length;
    const item: WorkspaceItem = { id: newId(), type: "group", x: Math.round(at.x - 120), y: Math.round(at.y - 80), w: 520, h: 360, color: ITEM_COLORS[(n + 1) % ITEM_COLORS.length]!, title: `Issue ${n + 1}` };
    update((w) => ({ ...w, items: [...w.items, item] }));
    setSelected([item.id]);
  };

  const deleteSelected = () => {
    if (!selected.length) return;
    update((w) => ({
      ...w,
      items: w.items.filter((i) => !selected.includes(i.id)),
      links: w.links.filter((l) => !selected.includes(l.id) && !selected.includes(l.from) && !selected.includes(l.to)),
      ink: (w.ink ?? []).filter((s) => !selected.includes(s.id)),
    }));
    setSelected([]);
  };

  const recolor = (color: string) => update((w) => ({ ...w, items: w.items.map((i) => (selected.includes(i.id) ? { ...i, color } : i)) }));

  const fit = () => {
    const items = wsRef.current.items;
    const el = document.querySelector(".ws-canvas")?.getBoundingClientRect();
    if (!items.length || !el) return update((w) => ({ ...w, view: { x: 0, y: 0, zoom: 1 } }), "view");
    const x1 = Math.min(...items.map((i) => i.x));
    const y1 = Math.min(...items.map((i) => i.y));
    const x2 = Math.max(...items.map((i) => i.x + i.w));
    const y2 = Math.max(...items.map((i) => i.y + i.h));
    const zoom = Math.max(0.25, Math.min(1.5, Math.min((el.width - 80) / (x2 - x1), (el.height - 80) / (y2 - y1))));
    update((w) => ({ ...w, view: { zoom, x: (el.width - (x2 - x1) * zoom) / 2 - x1 * zoom, y: (el.height - (y2 - y1) * zoom) / 2 - y1 * zoom } }), "view");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") return void (e.preventDefault(), e.shiftKey ? redo() : undo());
      if (mod && e.key.toLowerCase() === "y") return void (e.preventDefault(), redo());
      if (mod && e.key.toLowerCase() === "f") return void (e.preventDefault(), setSearchOpen(true));
      if ((e.key === "Delete" || e.key === "Backspace") && selected.length) return void (e.preventDefault(), deleteSelected());
      if (e.key === "Escape") {
        setPen(null);
        setConnecting(false);
        setSelected([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const addDocument = async (doc: { id: string; name: string }) => {
    setPicker(null);
    if (wsRef.current.documents.some((d) => d.fileId === doc.id)) return void setActive(([, b]) => [doc.id, b]);
    update((w) => ({ ...w, documents: [...w.documents, { fileId: doc.id, name: doc.name }] }));
    setActive(([a, b]) => [doc.id, b ?? a ?? doc.id]);
  };

  const removeDocument = (fileId: string) => {
    const used = wsRef.current.items.some((i) => i.type === "excerpt" && i.fileId === fileId);
    if (used && !window.confirm("Excerpts from this document stay on the canvas, but their links back to it will stop working. Remove the document?")) return;
    update((w) => ({ ...w, documents: w.documents.filter((d) => d.fileId !== fileId) }));
    const rest = wsRef.current.documents.filter((d) => d.fileId !== fileId);
    setActive(([a, b]) => [a === fileId ? (rest[0]?.fileId ?? null) : a, b === fileId ? (rest[0]?.fileId ?? null) : b]);
  };

  const showSource = (item: ExcerptItem) => {
    if (!wsRef.current.documents.some((d) => d.fileId === item.fileId)) return onError?.("The source document was removed from this workspace.");
    setActive(([a, b]) => (split && b === item.fileId ? [a, b] : [item.fileId, b]));
    setFocus({ fileId: item.fileId, page: item.page, rects: item.rects, nonce: Date.now() });
  };

  const showItem = (id: string) => setFocusItem({ id, nonce: Date.now() });

  // Search across every document in the workspace.
  useEffect(() => {
    const q = query.trim();
    if (!searchOpen || q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const out: SearchHit[] = [];
      for (const d of wsRef.current.documents) {
        let pages = texts.current.get(d.fileId);
        if (!pages) {
          try {
            const task = openPdf(await loadDocument(d.fileId));
            const pdf = await task.promise;
            pages = [];
            for (let i = 1; i <= pdf.numPages; i++) pages.push(await pageText(await pdf.getPage(i)));
            void task.destroy();
            texts.current.set(d.fileId, pages);
          } catch {
            continue;
          }
        }
        pages.forEach((pt, page) => {
          for (const [s, e] of findInText(pt, q)) {
            const from = Math.max(0, s - 60);
            out.push({ fileId: d.fileId, page, rects: matchRects(pt, s, e), text: pt.text.slice(s, e), snippet: `${from > 0 ? "…" : ""}${pt.text.slice(from, e + 60).trim()}…` });
          }
        });
        if (cancelled) return;
      }
      if (!cancelled) {
        setHits(out);
        setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, searchOpen, loadDocument, ws.documents]);

  const excerptsFor = useMemo(() => {
    const map = new Map<string, ExcerptItem[]>();
    for (const i of ws.items) if (i.type === "excerpt") map.set(i.fileId, [...(map.get(i.fileId) ?? []), i]);
    return map;
  }, [ws.items]);

  const nameOf = (fileId: string | null) => ws.documents.find((d) => d.fileId === fileId)?.name ?? "";
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  const selectedItems = ws.items.filter((i) => selected.includes(i.id));

  const pane = (slot: 0 | 1) => {
    const fileId = active[slot];
    return (
      <div className="ws-doc">
        <div className="ws-tabs" role="tablist" aria-label={slot === 0 ? "Documents" : "Second document"}>
          {ws.documents.map((d) => (
            <div key={d.fileId} className={`ws-tab ${fileId === d.fileId ? "ws-tab-active" : ""}`}>
              <button type="button" role="tab" aria-selected={fileId === d.fileId} title={d.name} onClick={() => setActive((a) => (slot === 0 ? [d.fileId, a[1]] : [a[0], d.fileId]))}>
                <FileText aria-hidden className="size-3.5" />
                <span className="truncate">{d.name.replace(/\.pdf$/i, "")}</span>
              </button>
              {slot === 0 && (
                <button type="button" className="ws-tab-x" aria-label={`Remove ${d.name} from workspace`} onClick={() => removeDocument(d.fileId)}>
                  <X aria-hidden className="size-3" />
                </button>
              )}
            </div>
          ))}
          {slot === 0 && (
            <button type="button" className="ws-tab-add" onClick={async () => setPicker((await listDocuments()).filter((f) => !ws.documents.some((d) => d.fileId === f.id)))}>
              <Plus aria-hidden className="size-3.5" /> Add document
            </button>
          )}
        </div>
        {fileId ? (
          <DocPane
            key={fileId}
            fileId={fileId}
            load={loadDocument}
            excerpts={excerptsFor.get(fileId) ?? []}
            annotations={(ws.annotations ?? []).filter((a) => a.fileId === fileId)}
            collapsed={ws.collapsed?.[fileId] ?? []}
            focus={focus}
            hits={hits.filter((h) => h.fileId === fileId)}
            onExcerpt={(p) => addExcerpt(p)}
            onExcerptClick={showItem}
            onAnnotate={(kind, p, color) => {
              const a: Annotation = { id: newId(), kind, ...p, color, createdAt: Date.now(), ...(kind === "comment" ? { note: "" } : {}) };
              update((w) => ({ ...w, annotations: [...(w.annotations ?? []), a] }));
              return a;
            }}
            onAnnotationChange={(a) => update((w) => ({ ...w, annotations: (w.annotations ?? []).map((x) => (x.id === a.id ? a : x)) }), `ann:${a.id}`)}
            onAnnotationDelete={(id) => update((w) => ({ ...w, annotations: (w.annotations ?? []).filter((x) => x.id !== id) }))}
            onCollapsedChange={(pages) => update((w) => ({ ...w, collapsed: { ...(w.collapsed ?? {}), [fileId]: [...new Set(pages)].sort((a, b) => a - b) } }))}
          />
        ) : (
          <div className="ws-doc-empty">
            <p className="font-medium text-slate-700">Add a document to start</p>
            <p>Add depositions, exhibits or any PDF from your files. Select text to pull excerpts into the workspace.</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ws-editor">
      <div className="ws-toolbar" role="toolbar" aria-label="Workspace tools">
        <button type="button" className="ws-btn" onClick={addNote}>
          <StickyNote aria-hidden className="size-4" /> Note
        </button>
        <button type="button" className="ws-btn" onClick={addGroup}>
          <SquareDashed aria-hidden className="size-4" /> Issue group
        </button>
        <button type="button" className={`ws-btn ${connecting ? "ws-btn-on" : ""}`} aria-pressed={connecting} onClick={() => (setPen(null), setConnecting(!connecting))}>
          <Link2 aria-hidden className="size-4" /> Connect
        </button>
        <button type="button" className={`ws-btn ${pen ? "ws-btn-on" : ""}`} aria-pressed={!!pen} title="Draw on the workspace with mouse, touch or pen (Esc to stop)" onClick={() => (setConnecting(false), setPen(pen ? null : { color: "#7c3aed", width: 3 }))}>
          <PenLine aria-hidden className="size-4" /> Pen
        </button>
        {pen && (
          <span className="ws-swatches" role="group" aria-label="Pen colour">
            {["#7c3aed", "#dc2626", "#1e3a5f", "#16a34a", "#0f172a"].map((c) => (
              <button key={c} type="button" aria-label={`Pen colour ${c}`} aria-pressed={pen.color === c} className={`ws-swatch ${pen.color === c ? "ws-swatch-on" : ""}`} style={{ background: c }} onClick={() => setPen({ ...pen, color: c })} />
            ))}
          </span>
        )}
        {selectedItems.length > 0 && (
          <span className="ws-swatches" role="group" aria-label="Colour">
            {ITEM_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} className="ws-swatch" style={{ background: c }} onClick={() => recolor(c)} />
            ))}
          </span>
        )}
        <span className="ws-sep" />
        <button type="button" className="ws-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 aria-hidden className="size-4" />
        </button>
        <button type="button" className="ws-btn" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <Redo2 aria-hidden className="size-4" />
        </button>
        <button type="button" className="ws-btn" title="Fit everything in view" onClick={fit}>
          <Maximize aria-hidden className="size-4" /> Fit
        </button>
        <span className="ws-sep" />
        <button type="button" className={`ws-btn ${split ? "ws-btn-on" : ""}`} aria-pressed={split} title="Show two documents (or two places in one) side by side" onClick={() => setSplit(!split)}>
          <Columns2 aria-hidden className="size-4" /> Compare
        </button>
        <button type="button" className={`ws-btn ${searchOpen ? "ws-btn-on" : ""}`} aria-pressed={searchOpen} title="Search all documents (Ctrl+F)" onClick={() => setSearchOpen(!searchOpen)}>
          <Search aria-hidden className="size-4" /> Search
        </button>
        <button type="button" className={`ws-btn ${showOutline ? "ws-btn-on" : ""}`} aria-pressed={showOutline} onClick={() => setShowOutline(!showOutline)}>
          <ListTree aria-hidden className="size-4" /> Outline
        </button>
        {onExportPdf && (
          <button type="button" className="ws-btn ws-btn-export" onClick={() => onExportPdf(wsRef.current)}>
            <FileDown aria-hidden className="size-4" /> Export PDF
          </button>
        )}
        <button type="button" className="ws-btn ws-btn-primary" onClick={() => onExportOutline(wsRef.current)}>
          Export to Word
        </button>
      </div>

      <div className="ws-body">
        <div className={`ws-docs ${split ? "ws-docs-split" : ""}`}>
          {searchOpen && (
            <div className="ws-search" role="search">
              <div className="flex items-center gap-2">
                <Search aria-hidden className="size-4 text-slate-400" />
                <input autoFocus aria-label="Search all documents" placeholder="Search all documents" value={query} onChange={(e) => setQuery(e.target.value)} />
                <button type="button" aria-label="Close search" onClick={() => (setSearchOpen(false), setQuery(""))}>
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              {query.trim().length >= 2 && (
                <p className="ws-search-count" aria-live="polite">
                  {searching ? "Searching…" : `${hits.length} result${hits.length === 1 ? "" : "s"} in ${new Set(hits.map((h) => h.fileId)).size} document(s)`}
                </p>
              )}
              <ul className="ws-search-results">
                {hits.slice(0, 200).map((h, i) => (
                  <li key={i}>
                    <button type="button" className="ws-result" onClick={() => (setActive(([, b]) => [h.fileId, b]), setFocus({ fileId: h.fileId, page: h.page, rects: h.rects, nonce: Date.now() }))}>
                      <span className="ws-result-cite">
                        {nameOf(h.fileId).replace(/\.pdf$/i, "")}, p. {h.page + 1}
                      </span>
                      <span className="ws-result-snippet">{h.snippet}</span>
                    </button>
                    <button type="button" className="ws-result-add" aria-label={`Add result from page ${h.page + 1} to workspace`} title="Add to workspace" onClick={() => addExcerpt({ fileId: h.fileId, page: h.page, rects: h.rects, text: h.text })}>
                      <Plus aria-hidden className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pane(0)}
          {split && pane(1)}
        </div>
        <div className="ws-canvas-wrap">
          <Canvas
            ws={ws}
            selected={selected}
            setSelected={setSelected}
            connecting={connecting}
            setConnecting={setConnecting}
            focusId={focusItem}
            update={update}
            onCitation={showSource}
            onDropExcerpt={addExcerpt}
            pen={pen}
          />
          {showOutline && (
            <aside className="ws-outline" aria-label="Outline">
              <div className="ws-outline-head">
                <h2>Outline</h2>
                <button type="button" aria-label="Close outline" onClick={() => setShowOutline(false)}>
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              {(ws.annotations ?? []).length > 0 && (
                <section>
                  <h3>Highlights &amp; comments</h3>
                  <ol>
                    {[...(ws.annotations ?? [])]
                      .sort((a, b) => a.fileId.localeCompare(b.fileId) || a.page - b.page)
                      .map((a) => (
                        <li key={a.id}>
                          <button type="button" onClick={() => (setActive(([, b]) => [a.fileId, b]), setFocus({ fileId: a.fileId, page: a.page, rects: a.rects, nonce: Date.now() }))}>
                            <span className="ws-outline-quote">“{a.text.slice(0, 120)}{a.text.length > 120 ? "…" : ""}”</span>
                            {a.kind === "comment" && a.note && <span className="block">💬 {a.note}</span>}
                            <span className="ws-outline-cite">{passageCitation(ws, a.fileId, a.page)}</span>
                          </button>
                        </li>
                      ))}
                  </ol>
                </section>
              )}
              {outline(ws).map((s, i) => (
                <section key={i}>
                  <h3>{s.title}</h3>
                  {s.items.length === 0 && <p className="ws-outline-empty">No points yet. Drag excerpts into this group.</p>}
                  <ol>
                    {s.items.map((item) => (
                      <li key={item.id}>
                        <button type="button" onClick={() => showItem(item.id)}>
                          {item.type === "excerpt" ? (
                            <>
                              <span className="ws-outline-quote">“{item.text.slice(0, 140)}{item.text.length > 140 ? "…" : ""}”</span>
                              <span className="ws-outline-cite">{citation(ws, item)}</span>
                            </>
                          ) : (
                            <span>{item.text.slice(0, 140) || "(empty note)"}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </aside>
          )}
        </div>
      </div>

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setPicker(null)}>
          <div role="dialog" aria-modal="true" aria-label="Add a document" className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onKeyDown={(e) => e.key === "Escape" && setPicker(null)}>
            <h2 className="text-base font-semibold text-slate-900">Add a document</h2>
            {picker.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No other PDFs in your files. Upload depositions or exhibits from the home screen first.</p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
                {picker.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={() => void addDocument(f)}>
                      <FileText aria-hidden className="size-4 text-red-700" /> {f.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded-md border border-slate-300 px-3.5 py-2 text-sm" onClick={() => setPicker(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
