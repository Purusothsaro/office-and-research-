import {
  acknowledgeSource,
  citation,
  addAnnotation,
  addExcerpt,
  addGroup,
  addNote,
  align,
  bounds,
  connect,
  deleteItems,
  duplicateCards,
  filterCards,
  freeSpot,
  GROUP_CATEGORIES,
  groupCards,
  History,
  isFilterActive,
  markBroken,
  relinkSource,
  separateCards,
  gatherConnected,
  linkPassage,
  addBookmark,
  addDocInk,
  addSheet,
  deleteSheet,
  moveToSheet,
  renameSheet,
  sheetOf,
  MAIN_SHEET,
  validateAnchor,
  parseWorkspace,
  RELATIONS,
  REVIEW_STATUSES,
  rectsFor,
  remapSources,
  removeDocument,
  serializeWorkspace,
  setTags,
  updateAnnotation,
  updateCard,
  updateConnector,
  upsertDocument,
  WorkspaceSync,
  type Annotation,
  type CardFilter,
  type DocumentIndex,
  type ExcerptCard,
  type GroupCategory,
  type PendingWorkspace,
  type ProjectMeta,
  type Relation,
  type ResearchDocument,
  type ResearchWorkspace,
  type RevisionInfo,
  type SaveStatus,
  type SearchHit,
} from "@octo/research";
import {
  Check,
  CircleAlert,
  CloudOff,
  Files,
  Filter,
  Group as GroupIcon,
  Highlighter,
  Link2,
  Loader2,
  Maximize,
  Minus,
  PanelLeft,
  ChevronsLeft,
  ChevronsRight,
  PenTool,
  Plus,
  ScrollText,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Dialog, Field, IconButton, inputClass, Menu, MenuItem, useToast } from "../components/ui";
import { useApp } from "../lib/app";
import { ProjectDialog } from "../projects/ProjectDialog";
import { ResearchCanvas, type CanvasMode, type LinkStart, type Update } from "./Canvas";
import { LinkOverlay, type CrossLink } from "./LinkOverlay";
import { TogetherView } from "./TogetherView";
import { AppToolbar, PEN_COLORS as INK_COLORS, ReaderRail, SheetSwitcher, WorkspaceRail } from "./Chrome";
import { INK, type Tool } from "./Viewer";
import { DocumentService } from "./documents";
import { AnnotationPopover, ContextMenu, CtxItem, RelationsPanel, SelectionBar, ShortcutsDialog, TagsDialog } from "./Popovers";
import { CompareDialog, ExportDialog, HistoryDialog, SummaryDialog } from "./Reports";
import { AnnotationsTab, DocumentsTab, SearchTab, type Job } from "./Sidebar";
import { Viewer, type FocusRequest, type Passage, type ViewerMark } from "./Viewer";

type Recovery = { kind: "restored"; at: number } | { kind: "stale"; pending: PendingWorkspace } | null;
type DialogState =
  | { kind: "details" }
  | { kind: "tags"; ids: string[] }
  | { kind: "compare"; ids: string[] }
  | { kind: "summary" }
  | { kind: "export" }
  | { kind: "history"; revisions: RevisionInfo[] }
  | { kind: "shortcuts" }
  | { kind: "remove-doc"; doc: ResearchDocument }
  | { kind: "label"; doc: ResearchDocument }
  | null;


function SaveIndicator({ status, detail }: { status: SaveStatus; detail?: string }) {
  const map: Record<SaveStatus, [React.ReactNode, string, string]> = {
    saved: [<Check key="i" className="size-3.5" aria-hidden />, "Saved", "text-emerald-300"],
    pending: [<Loader2 key="i" className="size-3.5" aria-hidden />, "Unsaved changes", "text-slate-300"],
    saving: [<Loader2 key="i" className="size-3.5 animate-spin" aria-hidden />, "Saving…", "text-slate-300"],
    offline: [<CloudOff key="i" className="size-3.5" aria-hidden />, "Offline — kept on this device", "text-amber-300"],
    conflict: [<CircleAlert key="i" className="size-3.5" aria-hidden />, "Changed elsewhere", "text-red-300"],
    error: [<CircleAlert key="i" className="size-3.5" aria-hidden />, "Not saved", "text-red-300"],
  };
  const [icon, text, cls] = map[status];
  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${cls}`} title={detail}>
      {icon} <span className="hidden sm:inline">{text}</span>
    </span>
  );
}

function useLayout() {
  const get = () => (window.innerWidth >= 1180 ? "wide" : window.innerWidth >= 760 ? "medium" : "narrow");
  const [layout, setLayout] = useState<"wide" | "medium" | "narrow">(get);
  useEffect(() => {
    const on = () => setLayout(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return layout;
}

/** A vertical drag handle that resizes the pane before it. */
function Splitter({ onDrag, label }: { onDrag: (dx: number) => void; label: string }) {
  const [active, setActive] = useState(false);
  const last = useRef(0);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      className="rs-splitter"
      data-active={active}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        last.current = e.clientX;
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (!active) return;
        onDrag(e.clientX - last.current);
        last.current = e.clientX;
      }}
      onPointerUp={() => setActive(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onDrag(-24);
        if (e.key === "ArrowRight") onDrag(24);
      }}
    />
  );
}

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const { api, local } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const service = useMemo(() => new DocumentService(api, local), [api, local]);
  const layout = useLayout();

  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [ws, setWs] = useState<ResearchWorkspace | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ s: SaveStatus; detail?: string }>({ s: "saved" });
  const [recovery, setRecovery] = useState<Recovery>(null);
  const wsRef = useRef<ResearchWorkspace | null>(null);
  const history = useRef(new History<ResearchWorkspace>());
  const sync = useRef<WorkspaceSync | null>(null);
  const dirtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const [, setHistoryTick] = useState(0);

  const [indexes, setIndexes] = useState<Map<string, DocumentIndex>>(new Map());
  const [jobs, setJobs] = useState<Map<string, Job>>(new Map());
  // Open documents as tabs; the active one is shown, optionally with a second one side by side.
  const [open, setOpen] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [split, setSplit] = useState<string | null>(null);
  const [hoverCard, setHoverCard] = useState<string | null>(null);
  const [hoverMark, setHoverMark] = useState<string | null>(null);
  const [relinkFor, setRelinkFor] = useState<string | null>(null);
  /** A connection being made, from a card or a passage, shared by the reader and the workspace. */
  const [linkStart, setLinkStart] = useState<LinkStart | null>(null);
  const [togetherOpen, setTogetherOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** Card whose relationships panel is open. */
  const [relationsFor, setRelationsFor] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem("rs-panel") !== "closed";
    } catch {
      return true;
    }
  });
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [cardFocus, setCardFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  /** The active tool (text selection, pen, highlighter, eraser, lasso), shared by reader and workspace. */
  const [tool, setTool] = useState<Tool>("text");
  const [inkColor, setInkColor] = useState(INK_COLORS[0]!);
  const [commenting, setCommenting] = useState(false);
  /** Which side is shown: both, only the reader, or only the workspace. */
  const [paneMode, setPaneMode] = useState<"both" | "reader" | "workspace">("both");
  const [areaImages, setAreaImages] = useState<Map<string, string>>(new Map());
  /** Reading places visited (for Back/Forward). */
  const nav = useRef<{ stack: { documentId: string; page: number }[]; at: number }>({ stack: [], at: -1 });
  const [, setNavTick] = useState(0);
  const importInput = useRef<HTMLInputElement>(null);
  const [relation, setRelation] = useState<Relation>("supports");
  const [filter, setFilter] = useState<CardFilter>({});
  const [tab, setTab] = useState<"documents" | "search" | "marks">("documents");
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [popover, setPopover] = useState<{ id: string; at: { x: number; y: number } } | null>(null);
  const [ctx, setCtx] = useState<{ target: { kind: "card"; id: string } | { kind: "connector"; id: string } | { kind: "canvas"; at: { x: number; y: number } }; at: { x: number; y: number } } | null>(null);
  const [leftW, setLeftW] = useState(280);
  // Share of the width (after the documents panel) given to the viewer.
  const [viewerFrac, setViewerFrac] = useState(0.5);
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const on = () => setWinW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const [drawer, setDrawer] = useState(false);
  const [narrowPane, setNarrowPane] = useState<"docs" | "viewer" | "canvas">("viewer");
  const canvasSize = useRef({ w: 800, h: 600 });
  const lastPointer = useRef({ x: 200, y: 200 });

  // ---- Loading, saving and recovery ----------------------------------------

  const serializeNow = useCallback(() => {
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current);
    dirtyTimer.current = null;
    if (!dirty.current || !wsRef.current) return;
    dirty.current = false;
    sync.current?.change(serializeWorkspace(wsRef.current));
  }, []);

  const markDirty = useCallback(() => {
    dirty.current = true;
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current);
    dirtyTimer.current = setTimeout(serializeNow, 300);
    setStatus((s) => (s.s === "conflict" ? s : { s: "pending" }));
  }, [serializeNow]);

  const apply = useCallback(
    (next: ResearchWorkspace) => {
      wsRef.current = next;
      setWs(next);
      markDirty();
    },
    [markDirty],
  );

  /** All edits go through here: history (unless disabled), state, then autosave. */
  const update: Update = useCallback(
    (fn, key = null, opts) => {
      const prev = wsRef.current;
      if (!prev) return;
      let next = fn(prev);
      if (next === prev) return;
      const sheet = prev.reader?.sheet ?? MAIN_SHEET;
      if (sheet !== MAIN_SHEET && next.cards.length > prev.cards.length) {
        const before = new Set(prev.cards.map((c) => c.id));
        next = { ...next, cards: next.cards.map((c) => (before.has(c.id) || c.sheet ? c : { ...c, sheet })) };
      }
      if (opts?.history !== false) {
        history.current.record(prev, key);
        setHistoryTick((n) => n + 1);
      }
      apply(next);
    },
    [apply],
  );

  const load = useCallback(async () => {
    const [meta, remote] = await Promise.all([api.getProject(projectId), api.getWorkspace(projectId)]);
    let current = parseWorkspace(remote.bytes);
    let rec: Recovery = null;
    const pending = await local.getPending(projectId).catch(() => undefined);
    if (pending) {
      try {
        const mine = parseWorkspace(pending.bytes);
        const same = (a: ResearchWorkspace, b: ResearchWorkspace) => JSON.stringify({ ...a, view: null }) === JSON.stringify({ ...b, view: null });
        if (same(mine, current)) {
          // The server already has these changes (e.g. saved as the tab closed).
          await local.deletePending(projectId).catch(() => undefined);
        } else if (pending.baseRevision === remote.revision) {
          current = mine;
          rec = { kind: "restored", at: pending.updatedAt };
        } else rec = { kind: "stale", pending };
      } catch {
        await local.deletePending(projectId).catch(() => undefined);
      }
    }
    sync.current?.dispose();
    sync.current = new WorkspaceSync({
      projectId,
      revision: remote.revision,
      save: async (bytes, base) => (await api.saveWorkspace(projectId, bytes, base)).revision,
      local,
      onStatus: (s, detail) => setStatus({ s, ...(detail ? { detail } : {}) }),
    });
    history.current.clear();
    wsRef.current = current;
    setProject(meta);
    setWs(current);
    setRecovery(rec);
    const linked = new URLSearchParams(window.location.search).get("card");
    const target = linked ? current.cards.find((c) => c.id === linked) : undefined;
    if (target) {
      const sheet = sheetOf(target);
      if (sheet !== (current.reader?.sheet ?? MAIN_SHEET)) {
        const next = { ...current, reader: { ...(current.reader ?? { open: [], active: null, pages: {} }), sheet } };
        wsRef.current = next;
        setWs(next);
      }
      setTimeout(() => {
        setSelected([target.id]);
        setCardFocus({ id: target.id, nonce: Date.now() });
      }, 300);
    }
    if (rec?.kind === "restored") sync.current.change(pending!.bytes);
    const known = (id: string | null | undefined) => !!id && current.documents.some((d) => d.id === id);
    const tabs = (current.reader?.open ?? []).filter(known);
    const active = known(current.reader?.active) ? current.reader!.active! : (tabs[0] ?? current.documents[0]?.id ?? null);
    setOpen(tabs.length ? tabs : active ? [active] : []);
    setActiveId(active);
    setSplit(null);
  }, [api, local, projectId]);

  useEffect(() => {
    load().catch((e) => setLoadError((e as Error).message));
    return () => sync.current?.dispose();
  }, [load]);

  // Save what's pending when the page is hidden or closed.
  useEffect(() => {
    const flush = () => {
      serializeNow();
      void sync.current?.flush();
    };
    window.addEventListener("pagehide", flush);
    const onVis = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [serializeNow]);

  // Documents whose file was deleted elsewhere are flagged, so their excerpts say the
  // source is unavailable instead of failing when opened.
  const checkFiles = useCallback(async () => {
    const w = wsRef.current;
    if (!w?.documents.length) return;
    let present: Set<string>;
    try {
      present = new Set((await api.listFiles()).map((f) => f.id));
    } catch {
      return;
    }
    const missing = (wsRef.current?.documents ?? []).filter((d) => d.status !== "error" && d.status !== "processing" && !present.has(d.fileId));
    if (missing.length) update((x) => missing.reduce((acc, d) => upsertDocument(acc, { ...d, status: "error", error: "The file is no longer available." }), x), null, { history: false });
  }, [api, update]);
  useEffect(() => {
    if (ws) void checkFiles();
    // Once per project load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!ws, checkFiles]);
  useEffect(() => api.subscribe((e) => e.type === "files-changed" && void checkFiles()), [api, checkFiles]);

  // Live updates from other tabs and devices.
  useEffect(
    () =>
      api.subscribe((e) => {
        if (e.type !== "project-saved" || e.projectId !== projectId) return;
        const s = sync.current;
        if (!s || e.revision <= s.revision || s.status !== "saved" || s.hasUnsaved || dirtyTimer.current) return;
        void api.getWorkspace(projectId).then(({ bytes, revision }) => {
          if (!sync.current || sync.current.status !== "saved" || revision <= sync.current.revision) return;
          const next = { ...parseWorkspace(bytes), view: wsRef.current?.view ?? parseWorkspace(bytes).view };
          sync.current.reset(revision);
          wsRef.current = next;
          setWs(next);
          toast("Updated with changes saved on another device.", "info");
        });
      }),
    [api, projectId, toast],
  );

  useEffect(() => {
    const w = wsRef.current;
    if (!w) return;
    const r = w.reader ?? { open: [], active: null, pages: {} };
    if (r.active === activeId && r.open.join() === open.join()) return;
    update((x) => ({ ...x, reader: { ...(x.reader ?? { pages: {} }), open, active: activeId, pages: x.reader?.pages ?? {} } }), null, { history: false });
  }, [open, activeId, update]);
  const pageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPageChange = useCallback(
    (docId: string, page: number) => {
      place.current = { documentId: docId, page };
      if (pageTimer.current) clearTimeout(pageTimer.current);
      pageTimer.current = setTimeout(() => update((x) => ({ ...x, reader: { open: x.reader?.open ?? [], active: x.reader?.active ?? null, pages: { ...x.reader?.pages, [docId]: page } } }), null, { history: false }), 600);
    },
    [update],
  );
  useEffect(() => {
    try {
      localStorage.setItem("rs-panel", panelOpen ? "open" : "closed");
    } catch {
      // Storage unavailable: the panel just won't remember its state.
    }
  }, [panelOpen]);

  // Track the pointer so popovers can open where the user was working.
  useEffect(() => {
    const on = (e: PointerEvent) => (lastPointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointerup", on, true);
    return () => window.removeEventListener("pointerup", on, true);
  }, []);

  // ---- Indexing --------------------------------------------------------------

  const setIndex = useCallback((docId: string, idx: DocumentIndex | null) => {
    setIndexes((m) => {
      const n = new Map(m);
      if (idx) n.set(docId, idx);
      else n.delete(docId);
      return n;
    });
  }, []);

  const docsKey = ws?.documents.map((d) => `${d.id}:${d.viewFileId}@${d.viewRevision}:${d.status}`).join("|") ?? "";
  useEffect(() => {
    if (!ws) return;
    let cancelled = false;
    void (async () => {
      for (const d of ws.documents) {
        if (cancelled) return;
        if (d.status !== "ready" && d.status !== "needs-ocr") continue;
        const have = indexes.get(d.id);
        if (have && have.viewFileId === d.viewFileId && have.viewRevision === d.viewRevision) continue;
        try {
          const idx = await service.index(d);
          if (!cancelled) setIndex(d.id, idx);
        } catch (e) {
          // A deleted file is flagged so its excerpts say their source is unavailable;
          // other failures only mean search skips the document for now.
          if (!cancelled && (e as { status?: number }).status === 404) update((w) => upsertDocument(w, { ...d, status: "error", error: "The file is no longer available." }), null, { history: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsKey, service]);

  // ---- Documents -------------------------------------------------------------

  const setJob = (id: string, job: Job | null) =>
    setJobs((m) => {
      const n = new Map(m);
      if (job) n.set(id, job);
      else n.delete(id);
      return n;
    });

  const docUpdate = (doc: ResearchDocument) => update((w) => upsertDocument(w, doc), null, { history: false });

  const processDoc = async (doc: ResearchDocument, bytes: Uint8Array): Promise<ResearchDocument> => {
    try {
      const done = await service.process(doc, bytes, (message, fraction) => setJob(doc.id, { documentId: doc.id, message, ...(fraction !== undefined ? { fraction } : {}) }));
      docUpdate(done);
      const idx = service.cachedIndex(done);
      if (idx) setIndex(done.id, idx);
      if (done.status === "needs-ocr") toast(`“${done.name}” looks like a scan with no text. Use “Recognise text (OCR)” from its menu to make it searchable.`, "warning");
      return done;
    } catch (e) {
      const failed = { ...doc, status: "error" as const, error: (e as Error).message.slice(0, 200) };
      docUpdate(failed);
      toast(`“${doc.name}” couldn't be processed: ${(e as Error).message}`, "error");
      return failed;
    } finally {
      setJob(doc.id, null);
    }
  };

  const importFiles = async (files: File[]) => {
    for (const file of files) {
      const tempId = `upload-${file.name}-${Date.now()}`;
      setJob(tempId, { documentId: tempId, message: `Uploading ${file.name}…` });
      try {
        const { doc, bytes } = await service.upload(file);
        setJob(tempId, null);
        docUpdate(doc);
        setOpen((o) => (o.includes(doc.id) ? o : [...o, doc.id]));
        setActiveId((a) => a ?? doc.id);
        const done = await processDoc(doc, bytes);
        if (done.status === "ready") toast(`Imported “${done.name}” (${done.pageCount} page${done.pageCount === 1 ? "" : "s"})`, "success");
      } catch (e) {
        setJob(tempId, null);
        toast((e as Error).message, "error");
      }
    }
  };

  const remapAfterChange = (doc: ResearchDocument) => {
    const idx = service.cachedIndex(doc);
    const cur = wsRef.current;
    if (!idx || !cur || !Object.values(cur.sources).some((s) => s.documentId === doc.id)) return;
    const { ws: next, report } = remapSources(cur, doc, idx);
    update(() => next, null, { history: false });
    if (report.moved || report.broken)
      toast(`Source links checked: ${report.ok} unchanged, ${report.moved} moved, ${report.broken} not found in the new version. Excerpts and marks that need checking show a warning.`, "warning");
    else toast(`All ${report.ok} source link${report.ok === 1 ? "" : "s"} found in the new version.`, "success");
  };

  const runOcr = async (doc: ResearchDocument) => {
    setJob(doc.id, { documentId: doc.id, message: "Preparing OCR…" });
    try {
      const done = await service.ocr(doc, (message, fraction) => setJob(doc.id, { documentId: doc.id, message, ...(fraction !== undefined ? { fraction } : {}) }));
      docUpdate(done);
      const idx = service.cachedIndex(done);
      if (idx) setIndex(done.id, idx);
      toast(`Text recognised in “${doc.name}”. It is searchable and selectable; check quotations against the page image.`, "success");
      remapAfterChange(done);
    } catch (e) {
      toast(`OCR failed for “${doc.name}”: ${(e as Error)?.message ?? String(e)}`, "error");
    } finally {
      setJob(doc.id, null);
    }
  };

  const replaceDoc = async (doc: ResearchDocument, file: File) => {
    setJob(doc.id, { documentId: doc.id, message: "Uploading new version…" });
    try {
      const { doc: replaced, bytes } = await service.replace(doc, file);
      const done = await processDoc(replaced, bytes);
      if (done.status === "ready") remapAfterChange(done);
      else if (done.status === "needs-ocr") toast("The new version has no text yet. Run OCR to re-link existing excerpts and marks.", "warning");
    } catch (e) {
      setJob(doc.id, null);
      toast(`The document couldn't be replaced: ${(e as Error).message}`, "error");
    }
  };

  const openDoc = (doc: ResearchDocument, sideBySide = false) => {
    setOpen((o) => (o.includes(doc.id) ? o : [...o, doc.id]));
    if (sideBySide && activeId && activeId !== doc.id) setSplit(doc.id);
    else {
      setActiveId(doc.id);
      if (split === doc.id) setSplit(null);
    }
    if (layout === "narrow") setNarrowPane("viewer");
    if (layout === "medium") setDrawer(false);
  };

  const closeTab = (id: string) => {
    setOpen((o) => {
      const next = o.filter((x) => x !== id);
      if (activeId === id) setActiveId(split && split !== id ? split : (next[next.length - 1] ?? null));
      return next;
    });
    if (split === id || activeId === id) setSplit(null);
  };

  // ---- Workspace edits --------------------------------------------------------

  /** The middle of the visible workspace, in canvas units (measured live: panes resize). */
  const viewCenter = () => {
    const w = wsRef.current!;
    const el = document.querySelector<HTMLElement>('[aria-label="Research workspace canvas"]');
    const cw = el?.clientWidth ?? canvasSize.current.w;
    const ch = el?.clientHeight ?? canvasSize.current.h;
    return { x: (cw / 2 - w.view.x) / w.view.zoom - 130, y: (ch / 3 - w.view.y) / w.view.zoom };
  };

  const passageAction = (action: "excerpt" | "relink" | "link" | Annotation["kind"], p: Passage, color?: string, at?: { x: number; y: number }) => {
    if (action === "link") {
      let made: Annotation | null = null;
      update((w) => {
        const [next, a] = addAnnotation(w, "underline", p, "#7056e8");
        made = a;
        return next;
      });
      const a = made as Annotation | null;
      if (!a) return;
      // If a card was already picked in Connect mode, link straight to it.
      if (linkStart?.kind === "card") {
        const cardId = linkStart.id;
        update((w) => linkPassage(w, cardId, { annotationId: a.id }, relation)[0]);
        setLinkStart(null);
        setMode("select");
        toast("Passage linked to the card.", "success");
      } else {
        setLinkStart({ kind: "annotation", id: a.id });
        setMode("connect");
      }
      return;
    }
    if (action === "relink") {
      if (!relinkFor) return;
      const id = relinkFor;
      update((w) => relinkSource(w, id, p));
      setRelinkFor(null);
      toast("Source re-linked to the selected passage.", "success");
      return;
    }
    if (action === "excerpt") {
      let created: ExcerptCard | null = null;
      update((w) => {
        const [next, card] = addExcerpt(w, p, at ?? freeSpot(w, viewCenter(), { w: 260, h: 120 }));
        created = card;
        return next;
      });
      if (created) {
        setSelected([(created as ExcerptCard).id]);
        if (!at) setCardFocus({ id: (created as ExcerptCard).id, nonce: Date.now() });
      }
      return;
    }
    let made: Annotation | null = null;
    update((w) => {
      const [next, a] = addAnnotation(w, action, p, color ?? "#fde047", action === "comment" ? "" : undefined);
      made = a;
      return next;
    });
    if (made && action === "comment") setPopover({ id: (made as Annotation).id, at: { x: lastPointer.current.x - 140, y: lastPointer.current.y + 16 } });
  };

  const openSource = useCallback(
    (sourceId: string, quiet = false) => {
      const w = wsRef.current;
      const src = w?.sources[sourceId];
      const doc = w?.documents.find((d) => d.id === src?.documentId);
      // A tap only shows context that is available; the card itself shows any problem.
      if (quiet && (!src || !doc || doc.status === "error" || src.status === "broken")) return;
      if (!src || !doc) return toast("The source document is no longer in this project. The excerpt keeps its captured text.", "error");
      if (doc.status === "error") return toast("The source document's file is unavailable (it may have been deleted). The excerpt keeps its captured text.", "error");
      setOpen((o) => (o.includes(doc.id) ? o : [...o, doc.id]));
      if (split !== doc.id) setActiveId(doc.id);
      if (layout === "narrow") setNarrowPane("viewer");
      const current = src.viewFileId === doc.viewFileId && src.viewRevision === doc.viewRevision;
      if (src.status === "broken" || !current) {
        // Show the passage where it was captured, in that revision.
        setFocus({ documentId: doc.id, page: src.page, rects: src.rects, viewFileId: src.viewFileId, viewRevision: src.viewRevision, nonce: Date.now() });
        toast(src.note ?? "This passage is from an earlier version of the document.", "warning");
        return;
      }
      // Only highlight where the captured text is verified to be.
      const idx = indexes.get(doc.id) ?? service.cachedIndex(doc);
      const check = idx ? validateAnchor(src, idx.pages[src.page]) : null;
      if (check?.state === "invalid") {
        update((x) => markBroken(x, sourceId, "The captured text is no longer at this place in the document."), null, { history: false });
        setFocus({ documentId: doc.id, page: src.page, rects: [], nonce: Date.now() });
        toast("The captured text couldn't be found on its page, so nothing was highlighted. Use “Fix link” on the excerpt to choose the passage again.", "warning");
        return;
      }
      if (check?.state === "relocated") update((x) => ({ ...x, sources: { ...x.sources, [sourceId]: { ...src, start: check.start, end: check.end, rects: check.rects } } }), null, { history: false });
      setFocus({ documentId: doc.id, page: src.page, rects: check ? check.rects : src.rects, nonce: Date.now() });
      if (src.status === "moved") toast(src.note ?? "This passage moved in a replaced version.", "warning");
    },
    [layout, toast, split, indexes, service, update],
  );

  const startRelink = (card: ExcerptCard) => {
    const src = wsRef.current?.sources[card.sourceId];
    const doc = wsRef.current?.documents.find((d) => d.id === src?.documentId);
    if (!src || !doc) return;
    setRelinkFor(card.sourceId);
    setOpen((o) => (o.includes(doc.id) ? o : [...o, doc.id]));
    setActiveId(doc.id);
    if (layout === "narrow") setNarrowPane("viewer");
    setFocus({ documentId: doc.id, page: Math.min(src.page, doc.pageCount - 1), rects: [], nonce: Date.now() });
  };

  /** Rendered card heights in canvas units, for packing merged stacks. */
  const cardHeights = () => {
    const out: Record<string, number> = {};
    document.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => (out[el.dataset.cardId!] = el.offsetHeight));
    return out;
  };

  /** Card text with citations, for the clipboard. */
  const copyText = (ids: string[]) =>
    (wsRef.current?.cards ?? [])
      .filter((c) => ids.includes(c.id) && c.type !== "group")
      .map((c) => (c.type === "excerpt" ? `“${c.text}” (${citation(wsRef.current!, c.sourceId)})` : c.type === "note" ? c.text : ""))
      .join("\n\n");

  const deleteSelection = () => {
    if (!selected.length) return;
    update((w) => deleteItems(w, selected));
    setSelected([]);
  };

  const fit = () => {
    const w = wsRef.current!;
    const b = bounds([...w.cards, ...w.ink.flatMap((s) => s.points.map(([x, y]) => ({ x, y, w: 1, h: 1 })))]);
    if (!b) return update((x) => ({ ...x, view: { x: 40, y: 40, zoom: 1 } }), "view", { history: false });
    const { w: cw, h: ch } = canvasSize.current;
    const zoom = Math.max(0.15, Math.min(1.5, Math.min((cw - 80) / b.w, (ch - 80) / b.h)));
    update((x) => ({ ...x, view: { zoom, x: (cw - b.w * zoom) / 2 - b.x * zoom, y: (ch - b.h * zoom) / 2 - b.y * zoom } }), "view", { history: false });
  };

  const zoomBy = (f: number) =>
    update(
      (w) => {
        const { w: cw, h: ch } = canvasSize.current;
        const next = Math.max(0.15, Math.min(3, w.view.zoom * f));
        return { ...w, view: { zoom: next, x: cw / 2 - ((cw / 2 - w.view.x) / w.view.zoom) * next, y: ch / 2 - ((ch / 2 - w.view.y) / w.view.zoom) * next } };
      },
      "view",
      { history: false },
    );

  const newNote = (at?: { x: number; y: number }) => {
    let id = "";
    update((w) => {
      const [next, n] = addNote(w, at ?? freeSpot(w, viewCenter(), { w: 220, h: 130 }));
      id = n.id;
      return next;
    });
    setSelected([id]);
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-card-id="${id}"] textarea`)?.focus());
  };

  const newGroup = (category: GroupCategory, at?: { x: number; y: number }) => {
    let id = "";
    update((w) => {
      const points = selected.filter((s) => w.cards.some((c) => c.id === s && c.type !== "group"));
      const [next, g] = points.length ? groupCards(w, points, "", category) : addGroup(w, { ...(at ?? viewCenter()), w: 520, h: 360 }, "", category);
      id = g?.id ?? "";
      return next;
    });
    if (id) {
      setSelected([id]);
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-card-id="${id}"] input`)?.focus());
    }
  };

  const undo = () => {
    const cur = wsRef.current;
    if (!cur) return;
    const prev = history.current.undo(cur);
    // Documents and the view aren't part of undo.
    if (prev) apply({ ...prev, documents: cur.documents, view: cur.view });
    setHistoryTick((n) => n + 1);
  };
  const redo = () => {
    const cur = wsRef.current;
    if (!cur) return;
    const next = history.current.redo(cur);
    if (next) apply({ ...next, documents: cur.documents, view: cur.view });
    setHistoryTick((n) => n + 1);
  };

  // ---- Back / Forward through reading places ----
  const place = useRef<{ documentId: string; page: number } | null>(null);
  const navJump = useRef(false);
  useEffect(() => {
    if (!focus) return;
    if (navJump.current) {
      navJump.current = false;
      return;
    }
    const n = nav.current;
    const prev = place.current;
    const target = { documentId: focus.documentId, page: focus.page };
    const same = (a?: { documentId: string; page: number }, b?: { documentId: string; page: number }) => !!a && !!b && a.documentId === b.documentId && a.page === b.page;
    n.stack = n.stack.slice(0, n.at + 1);
    if (prev && !same(n.stack[n.stack.length - 1], prev)) n.stack.push(prev);
    if (!same(n.stack[n.stack.length - 1], target)) n.stack.push(target);
    n.at = n.stack.length - 1;
    setNavTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  const navGo = (delta: number) => {
    const n = nav.current;
    const at = n.at + delta;
    const p = n.stack[at];
    const doc = wsRef.current?.documents.find((d) => d.id === p?.documentId);
    if (!p || !doc) return;
    n.at = at;
    navJump.current = true;
    setOpen((o) => (o.includes(doc.id) ? o : [...o, doc.id]));
    setActiveId(doc.id);
    setFocus({ documentId: doc.id, page: p.page, rects: [], nonce: Date.now() });
    setNavTick((t) => t + 1);
  };

  // ---- Workspaces (sheets) ----
  const switchSheet = (id: string) => {
    update(
      (w) => {
        const cur = w.reader?.sheet ?? MAIN_SHEET;
        if (cur === id) return w;
        const target = w.sheets.find((x) => x.id === id);
        return {
          ...w,
          sheets: w.sheets.map((x) => (x.id === cur ? { ...x, view: w.view } : x)),
          view: target?.view ?? { x: 40, y: 60, zoom: 1 },
          reader: { ...(w.reader ?? { open: [], active: null, pages: {} }), sheet: id },
        };
      },
      null,
      { history: false },
    );
    setSelected([]);
  };
  const newSheet = (parent: string, moveIds: string[] = []) => {
    const name = window.prompt("Name the new workspace", moveIds.length ? "Child workspace" : "New workspace");
    if (name === null) return;
    let id = "";
    update((w) => {
      const [next, sh] = addSheet(w, name, parent);
      id = sh.id;
      return moveIds.length ? moveToSheet(next, moveIds, sh.id) : next;
    });
    if (moveIds.length) toast(`Moved to “${name.trim() || "Untitled workspace"}”.`, "success");
    else switchSheet(id);
  };

  // ---- Lasso excerpt images ----
  useEffect(() => {
    if (!ws) return;
    const missing = ws.cards.flatMap((c) => (c.type === "excerpt" && ws.sources[c.sourceId]?.area && !areaImages.has(c.sourceId) ? [ws.sources[c.sourceId]!] : []));
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      for (const src of missing.slice(0, 20)) {
        try {
          const pdf = await service.openPdf(src.viewFileId, src.viewRevision);
          const pg = await pdf.getPage(src.page + 1);
          const vp = pg.getViewport({ scale: 2 });
          const full = document.createElement("canvas");
          full.width = Math.ceil(vp.width);
          full.height = Math.ceil(vp.height);
          await pg.render({ canvas: full, canvasContext: full.getContext("2d")!, viewport: vp }).promise;
          const r = src.rects[0]!;
          const [ax, ay] = vp.convertToViewportPoint(r[0], r[1]) as [number, number];
          const [bx, by] = vp.convertToViewportPoint(r[2], r[3]) as [number, number];
          const crop = document.createElement("canvas");
          crop.width = Math.max(1, Math.round(Math.abs(bx - ax)));
          crop.height = Math.max(1, Math.round(Math.abs(by - ay)));
          crop.getContext("2d")!.drawImage(full, Math.min(ax, bx), Math.min(ay, by), crop.width, crop.height, 0, 0, crop.width, crop.height);
          const url = crop.toDataURL("image/png");
          void pdf.destroy();
          if (cancelled) return;
          setAreaImages((m) => new Map(m).set(src.id, url));
        } catch {
          // The card still shows the text captured from the area.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.cards, service]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable]");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setTab("search");
        if (layout !== "wide") setDrawer(true);
        return;
      }
      if (typing || dialog) return;
      const inViewer = t.closest("[aria-label^='Document:']");
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault(); if (e.shiftKey) redo();
        else undo();
      }
      else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault(); redo();
      }
      else if (inViewer) return;
      else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault(); setSelected(wsRef.current!.cards.map((c) => c.id));
      }
      else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        let ids: string[] = [];
        update((w) => {
          const [next, copies] = duplicateCards(w, selected);
          ids = copies;
          return next;
        });
        setSelected(ids);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      }
      else if (e.key === "Escape") {
        setMode("select"); setSelected([]); setEditing(null);
      }
      else if (mod) return;
      else if (e.key === "n" || e.key === "N") {
        e.preventDefault(); newNote();
      }
      else if (e.key === "g" || e.key === "G") {
        e.preventDefault(); newGroup("issue");
      }
      else if (e.key === "c" || e.key === "C") setMode((m) => (m === "connect" ? "select" : "connect"));
      else if (e.key === "p" || e.key === "P") setTool((t) => (t === "pen" ? "text" : "pen"));
      else if (e.key === "h" || e.key === "H") setTool((t) => (t === "highlighter" ? "text" : "highlighter"));
      else if (e.key === "e" || e.key === "E") setTool((t) => (t === "eraser" ? "text" : "eraser"));
      else if (e.key === "l" || e.key === "L") setTool((t) => (t === "lasso" ? "text" : "lasso"));
      else if (e.key === "v" || e.key === "V") setTool("text");
      else if (e.key === "f" || e.key === "F") fit();
      else if (e.key === "?") setDialog({ kind: "shortcuts" });
      else if (e.key.startsWith("Arrow") && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
        const ids = new Set(selected);
        update((w) => ({ ...w, cards: w.cards.map((c) => (ids.has(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c)) }), `nudge:${selected.join(",")}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Derived -------------------------------------------------------------

  const matches = useMemo(() => (ws && isFilterActive(filter) ? new Set(filterCards(ws, filter).map((c) => c.id)) : null), [ws, filter]);
  const marksFor = useCallback(
    (docId: string): ViewerMark[] => {
      if (!ws) return [];
      const out: ViewerMark[] = [];
      for (const c of ws.cards) {
        if (c.type !== "excerpt") continue;
        const s = ws.sources[c.sourceId];
        if (s?.documentId === docId) out.push({ id: c.id, kind: "excerpt", source: s, color: c.color, label: `Excerpt on the workspace: ${c.text.slice(0, 60)}`, cardId: c.id });
      }
      for (const a of ws.annotations) {
        const s = ws.sources[a.sourceId];
        if (s?.documentId === docId) out.push({ id: a.id, kind: a.kind, source: s, color: a.color, label: `${a.kind === "comment" ? "Comment" : a.kind === "underline" ? "Underline" : "Highlight"}: ${s.quote.slice(0, 60)}`, annotation: a });
      }
      return out;
    },
    [ws],
  );

  if (loadError)
    return (
      <div className="p-8">
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </p>
        <Button className="mt-4" onClick={() => navigate("/")}>
          Back to projects
        </Button>
      </div>
    );
  if (!ws || !project) return <p className="p-8 text-sm text-slate-500">Opening project…</p>;

  const selectedCards = ws.cards.filter((c) => selected.includes(c.id));
  const selectedConnector = selected.length === 1 ? (ws.connectors.find((c) => c.id === selected[0]) ?? null) : null;
  const popAnnotation = popover ? ws.annotations.find((a) => a.id === popover.id) : undefined;
  const pendingIndexes = ws.documents.filter((d) => (d.status === "ready" || d.status === "needs-ocr") && !indexes.has(d.id)).length;
  const shownIds = [activeId, split].filter((id, i, a): id is string => !!id && a.indexOf(id) === i);
  const openDocs = shownIds.map((id) => ws.documents.find((d) => d.id === id)).filter((d): d is ResearchDocument => !!d);
  const tabDocs = open.map((id) => ws.documents.find((d) => d.id === id)).filter((d): d is ResearchDocument => !!d);
  const activeMarkIds = new Set([...selected, ...(hoverCard ? [hoverCard] : [])]);
  const linkedCardIds = new Set(hoverMark ? [hoverMark] : []);
  const relinkSrc = relinkFor ? ws.sources[relinkFor] : undefined;
  const uploadJobs = [...jobs.values()].filter((j) => j.documentId.startsWith("upload-"));

  const sidebar = (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-white" aria-label="Project panel" style={layout === "wide" ? { width: leftW } : undefined}>
      <div className="flex items-stretch border-b border-slate-200">
      <div role="tablist" aria-label="Project panel" className="flex min-w-0 flex-1">
        {(
          [
            ["documents", "Documents", Files],
            ["search", "Search", Search],
            ["marks", "Annotations", Highlighter],
          ] as const
        ).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium ${tab === id ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-600 hover:text-slate-900"}`}>
            <Icon className="size-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {/* Hide the panel (wide screens) or close the drawer (tablets). */}
      <button
        type="button"
        className="flex w-8 shrink-0 items-center justify-center border-l border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-ink-900"
        aria-label="Hide documents panel"
        title="Hide this panel (show it again from the strip on the left)"
        onClick={() => (layout === "wide" ? setPanelOpen(false) : setDrawer(false))}
      >
        <ChevronsLeft className="size-4" aria-hidden />
      </button>
      </div>
      {uploadJobs.map((j) => (
        <p key={j.documentId} className="flex items-center gap-1.5 border-b border-slate-100 bg-brand-50 px-3 py-1.5 text-xs text-brand-700" role="status">
          <Loader2 className="size-3 animate-spin" aria-hidden /> {j.message}
        </p>
      ))}
      {tab === "documents" && (
        <DocumentsTab
          ws={ws}
          jobs={jobs}
          activeId={activeId}
          onOpen={openDoc}
          onImport={(f) => void importFiles(f)}
          onOcr={(d) => void runOcr(d)}
          onReplace={(d, f) => void replaceDoc(d, f)}
          onRename={(d) => setDialog({ kind: "label", doc: d })}
          onRemove={(d) => setDialog({ kind: "remove-doc", doc: d })}
          onRetry={(d) => void service.pdfBytes(d.fileId, d.revision).then((b) => processDoc({ ...d, status: "processing" }, b))}
        />
      )}
      {tab === "search" && (
        <SearchTab
          ws={ws}
          indexes={[...indexes.values()]}
          pendingCount={pendingIndexes}
          activeId={activeId}
          onQuery={setSearchQuery}
          onViewTogether={() => setTogetherOpen(true)}
          onOpenHit={(h: SearchHit) => {
            const doc = ws.documents.find((d) => d.id === h.documentId)!;
            const idx = indexes.get(h.documentId);
            openDoc(doc);
            setFocus({ documentId: doc.id, page: h.page, rects: idx ? rectsFor(idx.pages[h.page]!, h.start, h.end) : [], nonce: Date.now() });
          }}
          onExcerptHit={(h) => {
            const idx = indexes.get(h.documentId);
            if (!idx) return;
            const p = idx.pages[h.page]!;
            // Take the whole sentence-ish context around the match.
            const s = Math.max(0, p.text.lastIndexOf(".", h.start) + 1);
            const endDot = p.text.indexOf(".", h.end);
            const e = endDot < 0 ? Math.min(p.text.length, h.end + 120) : endDot + 1;
            passageAction("excerpt", { documentId: h.documentId, page: h.page, quote: p.text.slice(s, e).replace(/\s+/g, " ").trim(), rects: rectsFor(p, s, e), start: s, end: e });
          }}
        />
      )}
      {tab === "marks" && <AnnotationsTab ws={ws} onOpen={(a) => openSource(a.sourceId)} onEdit={(a, at) => setPopover({ id: a.id, at })} />}
    </aside>
  );

  const shared = winW - (layout === "wide" ? (panelOpen ? leftW + 12 : 38) : 6);
  const viewerW = Math.round(Math.max(300, Math.min(shared - 300, shared * viewerFrac)));
  const dragViewer = (dx: number) => setViewerFrac((f) => Math.max(0.2, Math.min(0.8, f + dx / Math.max(1, shared))));
  // Lines across the reader and the workspace: passage links, and the selected excerpt's source.
  const crossLinks: CrossLink[] = (() => {
    if (layout === "narrow" || togetherOpen) return [];
    const out: CrossLink[] = [];
    const focusIds = new Set([...selected, ...(hoverCard ? [hoverCard] : [])]);
    for (const l of ws.passageLinks ?? []) {
      const a = ws.annotations.find((x) => x.id === l.annotationId);
      const src = a ? ws.sources[a.sourceId] : undefined;
      if (!src) continue;
      const rel = RELATIONS.find((r) => r.id === l.relation) ?? RELATIONS[3]!;
      out.push({ id: l.id, markId: l.annotationId, documentId: src.documentId, page: src.page, cardId: l.cardId, color: rel.color, strong: focusIds.has(l.cardId) || hoverMark === l.annotationId, label: l.label?.trim() || rel.label });
    }
    for (const id of focusIds) {
      const c = ws.cards.find((x) => x.id === id);
      if (c?.type !== "excerpt") continue;
      const src = ws.sources[c.sourceId];
      if (!src || src.status === "broken") continue;
      out.push({ id: `src-${c.id}`, markId: c.id, documentId: src.documentId, page: src.page, cardId: c.id, color: "#7056e8", strong: true, dashed: true });
    }
    return out;
  })();
  const pendingLink = mode === "connect" && linkStart ? { from: linkStart.kind === "card" ? { cardId: linkStart.id } : { markId: linkStart.id } } : null;

  // Round handle on the divider: give the whole width to the document or to the workspace.
  const dividerLeft = (layout === "wide" ? (panelOpen ? leftW + 6 : 32) : 0) + (paneMode === "both" ? viewerW + 3 : paneMode === "reader" ? winW - (layout === "wide" && panelOpen ? leftW + 6 : 0) - 22 : 22);
  const divider = (
    <div className="absolute bottom-16 z-30 flex -translate-x-1/2 overflow-hidden rounded-full border border-slate-300 bg-white shadow-lg" style={{ left: dividerLeft }} role="group" aria-label="Document and workspace layout">
      {paneMode !== "workspace" && (
        <button type="button" className="px-2 py-1.5 text-slate-600 hover:bg-slate-100" aria-label={paneMode === "reader" ? "Show document and workspace" : "Show workspace only"} title={paneMode === "reader" ? "Show both" : "Give the whole width to the workspace"} onClick={() => setPaneMode(paneMode === "reader" ? "both" : "workspace")}>
          ◀
        </button>
      )}
      {paneMode !== "reader" && (
        <button type="button" className="px-2 py-1.5 text-slate-600 hover:bg-slate-100" aria-label={paneMode === "workspace" ? "Show document and workspace" : "Show document only"} title={paneMode === "workspace" ? "Show both" : "Give the whole width to the document"} onClick={() => setPaneMode(paneMode === "workspace" ? "both" : "reader")}>
          ▶
        </button>
      )}
    </div>
  );

  const viewers = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" style={layout !== "narrow" ? { width: viewerW, flex: "none" } : undefined}>
      {tabDocs.length > 0 && (
        <div className="flex shrink-0 items-end border-b border-slate-200 bg-slate-100">
        <div role="tablist" aria-label="Open documents" className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto px-1.5 pt-1">
          {tabDocs.map((d) => {
            const on = d.id === activeId || d.id === split;
            return (
              <div key={d.id} className={`group flex max-w-52 items-center rounded-t-md ${on ? "bg-white shadow-[0_-1px_0_#e2e8f0_inset]" : "hover:bg-slate-200/70"}`}>
                <button role="tab" aria-selected={d.id === activeId} className={`min-w-0 truncate py-1.5 pr-1 pl-2.5 text-xs ${on ? "font-semibold text-ink-900" : "text-slate-600"}`} title={d.name} onClick={() => openDoc(d)}>
                  {d.short || d.name}
                </button>
                <button aria-label={`Close ${d.name}`} className="mr-1 rounded p-0.5 text-slate-400 opacity-60 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-700" onClick={() => closeTab(d.id)}>
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={togetherOpen}
          className={`mr-1.5 mb-1 shrink-0 rounded-md px-2 py-1 text-xs font-medium ${togetherOpen ? "bg-brand-600 text-white" : "text-brand-700 hover:bg-brand-50"}`}
          onClick={() => setTogetherOpen((o) => !o)}
          title="See search results or highlights from every document together, with adjustable context"
        >
          Together view
        </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
      {togetherOpen ? (
        <TogetherView
          ws={ws}
          service={service}
          indexes={indexes}
          query={searchQuery}
          onClose={() => setTogetherOpen(false)}
          onOpen={(it) => {
            setTogetherOpen(false);
            const doc = ws.documents.find((d) => d.id === it.documentId);
            if (!doc) return;
            openDoc(doc);
            setFocus({ documentId: doc.id, page: it.page, rects: it.rects, nonce: Date.now() });
          }}
        />
      ) : openDocs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center bg-slate-200/50 p-8 text-center text-sm text-slate-500">
          <div>
            <ScrollText className="mx-auto mb-2 size-8 text-slate-400" aria-hidden />
            <p className="font-medium text-slate-700">No document open</p>
            <p className="mt-1">Import PDFs, Word files, text or Markdown from the Documents panel.</p>
          </div>
        </div>
      ) : (
        openDocs.map((d, i) => (
          <div key={d.id} className={`flex min-w-0 flex-1 ${i ? "border-l border-slate-300" : ""}`} onFocusCapture={() => setActiveId(d.id)} onPointerDownCapture={() => setActiveId(d.id)}>
            <Viewer
              doc={d}
              service={service}
              index={indexes.get(d.id)}
              marks={marksFor(d.id)}
              focus={focus}
              searchQuery={tab === "search" ? searchQuery : ""}
              collapsed={ws.collapsed?.[d.id] ?? []}
              onCollapsedChange={(pages) => update((w) => ({ ...w, collapsed: { ...w.collapsed, [d.id]: pages } }), null, { history: false })}
              onPassage={(action, p, color) => passageAction(action, p, color)}
              activeIds={activeMarkIds}
              onMarkHover={setHoverMark}
              initialPage={ws.reader?.pages[d.id] ?? 0}
              tool={tool}
              inkColor={inkColor}
              ink={ws.docInk.filter((k) => k.documentId === d.id && k.viewFileId === d.viewFileId && k.viewRevision === d.viewRevision)}
              onInk={(page, points, kind) =>
                update((w) => addDocInk(w, { documentId: d.id, page, points, tool: kind, color: kind === "highlighter" ? INK.highlighter.color : inkColor, width: kind === "highlighter" ? INK.highlighter.width : INK.pen.width })[0])
              }
              onErase={(t) => update((w) => deleteItems(w, [t.id]))}
              rail={
                <ReaderRail
                  doc={d}
                  service={service}
                  page={ws.reader?.pages[d.id] ?? 0}
                  bookmarks={ws.bookmarks.filter((b) => b.documentId === d.id)}
                  onGo={(page) => setFocus({ documentId: d.id, page, rects: [], nonce: Date.now() })}
                  onAnnotations={() => {
                    setTab("marks");
                    if (layout === "wide") setPanelOpen(true);
                    else setDrawer(true);
                  }}
                  onAddDocument={() => importInput.current?.click()}
                  onBookmark={() => update((w) => addBookmark(w, d.id, w.reader?.pages[d.id] ?? 0)[0])}
                  onRemoveBookmark={(id) => update((w) => deleteItems(w, [id]))}
                />
              }
              onPageChange={(page) => onPageChange(d.id, page)}
              relink={relinkSrc && relinkSrc.documentId === d.id ? { label: relinkSrc.quote.length > 60 ? `${relinkSrc.quote.slice(0, 57)}…` : relinkSrc.quote } : null}
              onCancelRelink={() => setRelinkFor(null)}
              onUnavailable={() => {
                const cur = wsRef.current?.documents.find((x) => x.id === d.id);
                if (cur && cur.status !== "error") update((w) => upsertDocument(w, { ...cur, status: "error", error: "The file is no longer available." }), null, { history: false });
              }}
              onMark={(m, at) => {
                if (mode === "connect") {
                  const start = linkStart;
                  if (m.cardId) {
                    // An excerpt's mark stands for its card.
                    if (!start) setLinkStart({ kind: "card", id: m.cardId });
                    else if (start.kind === "annotation") {
                      update((w) => linkPassage(w, m.cardId!, { annotationId: start.id }, relation)[0]);
                      setLinkStart(null);
                      setMode("select");
                    } else if (start.id !== m.cardId) {
                      update((w) => connect(w, start.id, m.cardId!, relation)[0]);
                      setLinkStart(null);
                      setMode("select");
                    }
                  } else if (m.annotation) {
                    if (start?.kind === "card") {
                      const ann = m.annotation.id;
                      update((w) => linkPassage(w, start.id, { annotationId: ann }, relation)[0]);
                      setLinkStart(null);
                      setMode("select");
                      toast("Passage linked to the card.", "success");
                    } else setLinkStart({ kind: "annotation", id: m.annotation.id });
                  }
                  return;
                }
                if (m.cardId) {
                  if (layout === "narrow") setNarrowPane("canvas");
                  setCardFocus({ id: m.cardId, nonce: Date.now() });
                } else if (m.annotation) setPopover({ id: m.annotation.id, at: { x: at.x - 150, y: at.y + 12 } });
              }}
              {...(openDocs.length > 1 ? { onClose: () => (d.id === split ? setSplit(null) : (setActiveId(split), setSplit(null))) } : {})}
              compact={openDocs.length > 1}
            />
          </div>
        ))
      )}
      </div>
    </div>
  );

  const canvasPane = (
    <section className="@container relative flex h-full min-h-0 min-w-0 flex-1 flex-col" aria-label="Research workspace">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-1.5 py-1" role="toolbar" aria-label="Workspace tools">
        <Button variant="toolbar" onClick={() => newNote()} title="New note (N)">
          <StickyNote className="size-4" aria-hidden /> <span className="@max-[720px]:sr-only">Note</span>
        </Button>
        <Menu
          label="New group"
          trigger={(t) => (
            <Button variant="toolbar" title="Group (G)" {...t}>
              <GroupIcon className="size-4" aria-hidden /> <span className="@max-[720px]:sr-only">Group</span>
            </Button>
          )}
        >
          {(close) =>
            GROUP_CATEGORIES.map((c) => (
              <MenuItem key={c.id} onClick={() => (close(), newGroup(c.id))}>
                {c.label}
              </MenuItem>
            ))
          }
        </Menu>
        <Button variant="toolbar" on={mode === "connect"} aria-pressed={mode === "connect"} onClick={() => setMode((m) => (m === "connect" ? "select" : "connect"))} title="Connect two cards (C)">
          <Link2 className="size-4" aria-hidden /> <span className="@max-[720px]:sr-only">Connect</span>
        </Button>
        <select aria-label="Relationship for new connections" className="h-8 rounded-md border border-slate-200 px-1 text-xs text-slate-700" value={relation} onChange={(e) => setRelation(e.target.value as Relation)}>
          {RELATIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <Button variant="toolbar" on={tool === "pen"} aria-pressed={tool === "pen"} onClick={() => setTool((t) => (t === "pen" ? "text" : "pen"))} title="Pen (P)">
          <PenTool className="size-4" aria-hidden /> <span className="@max-[720px]:sr-only">Pen</span>
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
          <Minus className="size-4" aria-hidden />
        </IconButton>
        <span className="w-10 text-center text-xs text-slate-600 tabular-nums">{Math.round(ws.view.zoom * 100)}%</span>
        <IconButton label="Zoom in" onClick={() => zoomBy(1.2)}>
          <Plus className="size-4" aria-hidden />
        </IconButton>
        <IconButton label="Fit workspace" onClick={fit}>
          <Maximize className="size-4" aria-hidden />
        </IconButton>
        <div className="ml-auto flex items-center gap-1">
          <label className="relative">
            <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-slate-400" aria-hidden />
            <input className="h-8 w-28 rounded-md border border-slate-200 pr-2 pl-7 text-xs @min-[620px]:w-40" placeholder="Filter cards" aria-label="Filter workspace cards" value={filter.query ?? ""} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
          </label>
          <Menu
            label="Filter options"
            align="right"
            trigger={(t) => (
              <IconButton label="Filter options" on={!!(filter.tags?.length || filter.documentIds?.length || filter.types?.length || filter.statuses?.length)} {...t}>
                <Filter className="size-4" aria-hidden />
              </IconButton>
            )}
          >
            {() => (
              <div className="max-h-[60vh] w-64 overflow-y-auto p-2 text-xs">
                <FilterGroup title="Type" options={[["excerpt", "Excerpts"], ["note", "Notes"], ["group", "Groups"]]} value={filter.types ?? []} onChange={(v) => setFilter({ ...filter, types: v as CardFilter["types"] })} />
                <FilterGroup title="Tags" options={ws.tags.map((t) => [t.name, t.name])} value={filter.tags ?? []} onChange={(v) => setFilter({ ...filter, tags: v })} />
                <FilterGroup title="Document" options={ws.documents.map((d) => [d.id, d.name])} value={filter.documentIds ?? []} onChange={(v) => setFilter({ ...filter, documentIds: v })} />
                <FilterGroup title="Status" options={REVIEW_STATUSES.map((s) => [s.id, s.label])} value={filter.statuses ?? []} onChange={(v) => setFilter({ ...filter, statuses: v as CardFilter["statuses"] })} />
                <Button className="mt-2 h-7 w-full text-xs" onClick={() => setFilter({})}>
                  Clear filters
                </Button>
              </div>
            )}
          </Menu>
          {matches && (
            <span className="text-[11px] text-slate-500" aria-live="polite">
              {matches.size} match{matches.size === 1 ? "" : "es"}
            </span>
          )}
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <ResearchCanvas
          ws={ws}
          selected={selected}
          setSelected={setSelected}
          mode={tool === "pen" ? "pen" : mode}
          setMode={setMode}
          relation={relation}
          pen={{ color: inkColor, width: 3 }}
          matches={matches}
          focus={cardFocus}
          editing={editing}
          setEditing={setEditing}
          update={update}
          onOpenSource={(c) => openSource(c.sourceId)}
          onDropPassage={(p, at) => passageAction("excerpt", p, undefined, at)}
          onAddNote={(at) => newNote(at)}
          linkedIds={linkedCardIds}
          onHoverCard={setHoverCard}
          onRelink={startRelink}
          onAcceptSource={(c) => update((w) => acknowledgeSource(w, c.sourceId))}
          sheet={ws.reader?.sheet ?? MAIN_SHEET}
          erasing={tool === "eraser"}
          areaImages={areaImages}
          linkStart={linkStart}
          setLinkStart={setLinkStart}
          onLinkPassage={(annotationId, cardId) => {
            update((w) => linkPassage(w, cardId, { annotationId }, relation)[0]);
            toast("Passage linked to the card.", "success");
          }}
          onDropPassageOnCard={(p, cardId) => {
            update((w) => linkPassage(w, cardId, p, relation)[0]);
            toast("Passage linked to the card. Drop on empty space to make an excerpt instead.", "success");
          }}
          onTapCard={(c) => {
            // One tap on an excerpt shows its original context in the reader.
            if (c.type === "excerpt" && !relinkFor) openSource(c.sourceId, true);
          }}
          onContextMenu={(target, at) => setCtx({ target, at })}
          onResize={(s) => (canvasSize.current = s)}
        />
        {selectedCards.length === 1 && !selectedConnector && relationsFor === selectedCards[0]!.id && (
          <RelationsPanel
            ws={ws}
            card={selectedCards[0]!}
            onOpenSource={(id) => openSource(id)}
            onShowCard={(id) => {
              setSelected([id]);
              setCardFocus({ id, nonce: Date.now() });
            }}
            onGather={() => update((w) => gatherConnected(w, selected[0]!, cardHeights()))}
            onClose={() => setRelationsFor(null)}
          />
        )}
        <SheetSwitcher
          ws={ws}
          current={ws.reader?.sheet ?? MAIN_SHEET}
          onSwitch={switchSheet}
          onAdd={(parent) => newSheet(parent)}
          onRename={(id) => {
            const name = window.prompt("Rename workspace", ws.sheets.find((x) => x.id === id)?.name ?? "");
            if (name) update((w) => renameSheet(w, id, name));
          }}
          onDelete={(id) => {
            if (!window.confirm("Delete this workspace, its child workspaces and everything on them? You can undo this.")) return;
            const parent = ws.sheets.find((x) => x.id === id)?.parentId ?? MAIN_SHEET;
            switchSheet(parent);
            update((w) => deleteSheet(w, id));
          }}
        />
        <SelectionBar
          ws={ws}
          cards={selectedCards}
          connector={selectedConnector}
          onColor={(c) => update((w) => selected.reduce((x, id) => updateCard(x, id, { color: c }), w))}
          onStatus={(s) => update((w) => selected.reduce((x, id) => updateCard(x, id, s ? { status: s } : { status: undefined }), w))}
          onTags={() => setDialog({ kind: "tags", ids: selected })}
          onAlign={(m) => update((w) => align(w, selected, m))}
          onGroup={() => newGroup("issue")}
          onConnect={(r) => update((w) => connect(w, selected[0]!, selected[1]!, r)[0])}
          onCompare={() => setDialog({ kind: "compare", ids: selected })}
          onDuplicate={() => {
            let ids: string[] = [];
            update((w) => {
              const [next, copies] = duplicateCards(w, selected);
              ids = copies;
              return next;
            });
            setSelected(ids);
          }}
          onDelete={deleteSelection}
          onSeparate={() => update((w) => separateCards(w, selected, cardHeights()))}
          commenting={commenting}
          onComment={() => setCommenting((c) => !c)}
          onSaveComment={(text) => {
            const id = selected[0];
            if (id) update((w) => ({ ...w, cards: w.cards.map((c) => (c.id === id ? (text ? { ...c, comment: text, updatedAt: Date.now() } : (({ comment: _c, ...r }) => r as typeof c)(c)) : c)) }), `comment:${id}`);
            setCommenting(false);
          }}
          onCopy={() => void navigator.clipboard?.writeText(copyText(selected)).then(() => toast("Copied with citations.", "success"))}
          onCut={() => {
            void navigator.clipboard?.writeText(copyText(selected));
            deleteSelection();
            toast("Cut to the clipboard. Undo (Ctrl+Z) to restore.", "info");
          }}
          onCopyLink={() => {
            const url = `${window.location.origin}${import.meta.env.BASE_URL}p/${projectId}?card=${selected[0]}`;
            void navigator.clipboard?.writeText(url).then(() => toast("Link copied. It opens this card in this project.", "success"));
          }}
          childSheets={ws.sheets.filter((x) => x.parentId === (ws.reader?.sheet ?? MAIN_SHEET))}
          parentSheet={ws.sheets.find((x) => x.id === ws.sheets.find((y) => y.id === (ws.reader?.sheet ?? MAIN_SHEET))?.parentId) ?? null}
          onToSheet={(id) => {
            if (id === null) return newSheet((ws.reader?.sheet ?? MAIN_SHEET), selected);
            const name = ws.sheets.find((x) => x.id === id)?.name;
            update((w) => moveToSheet(w, selected, id));
            setSelected([]);
            toast(`Moved to “${name}”.`, "success");
          }}
          onFontSize={(px) => update((w) => ({ ...w, cards: w.cards.map((c) => (selected.includes(c.id) ? { ...c, fontSize: px } : c)) }))}
          relations={selected.length === 1 ? ws.connectors.filter((l) => l.from === selected[0] || l.to === selected[0]).length + (ws.passageLinks ?? []).filter((l) => l.cardId === selected[0]).length : 0}
          relationsOpen={relationsFor === selected[0]}
          onRelations={() => setRelationsFor((r) => (r === selected[0] ? null : (selected[0] ?? null)))}
          onEdit={() => setEditing(selected[0]!)}
          onCategory={(c) => update((w) => updateCard(w, selected[0]!, { category: c }))}
          onConnector={(patch) => selectedConnector && update((w) => updateConnector(w, selectedConnector.id, patch), `conn:${selectedConnector.id}`)}
        />
        <WorkspaceRail onNote={() => newNote()} onFit={fit} onAddWorkspace={() => newSheet(ws.reader?.sheet ?? MAIN_SHEET)} />
      </div>
    </section>
  );

  return (
    <div className="flex h-full flex-col">
      <input ref={importInput} type="file" multiple hidden aria-label="Add documents" onChange={(e) => (void importFiles(Array.from(e.target.files ?? [])), (e.target.value = ""))} />
      <AppToolbar
        title={
          <>
            <h1 className="truncate text-[14px] leading-tight font-semibold">{project.name}</h1>
            <p className="truncate text-[11px] leading-tight text-slate-400">{[project.caseName, project.court, project.reference].filter(Boolean).join(" · ") || "Add case details"}</p>
          </>
        }
        status={<SaveIndicator status={status.s} {...(status.detail ? { detail: status.detail } : {})} />}
        leading={
          layout === "wide" ? (
            <IconButton label="Show or hide the documents panel" className="text-slate-300 hover:bg-ink-700 hover:text-white" on={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
              <PanelLeft className="size-4" aria-hidden />
            </IconButton>
          ) : (
            <IconButton label="Documents panel" className="text-slate-300 hover:bg-ink-700 hover:text-white" on={drawer} onClick={() => setDrawer((d) => !d)}>
              <PanelLeft className="size-4" aria-hidden />
            </IconButton>
          )
        }
        onHome={() => (serializeNow(), void sync.current?.flush(), navigate("/"))}
        canBack={nav.current.at > 0}
        canForward={nav.current.at < nav.current.stack.length - 1}
        onBack={() => navGo(-1)}
        onForward={() => navGo(1)}
        canUndo={history.current.canUndo}
        canRedo={history.current.canRedo}
        onUndo={undo}
        onRedo={redo}
        tool={tool}
        setTool={setTool}
        inkColor={inkColor}
        setInkColor={setInkColor}
        onShare={() => setDialog({ kind: "export" })}
        onSearch={() => {
          setTab("search");
          if (layout === "wide") setPanelOpen(true);
          else setDrawer(true);
        }}
        onHelp={() => setDialog({ kind: "shortcuts" })}
        more={(close) => (
          <>
            <MenuItem onClick={() => (close(), setDialog({ kind: "details" }))}>Case details</MenuItem>
            <MenuItem
              onClick={async () => {
                close();
                serializeNow();
                await sync.current?.flush();
                setDialog({ kind: "history", revisions: await api.listRevisions(projectId) });
              }}
            >
              Version history
            </MenuItem>
            <MenuItem onClick={() => (close(), setDialog({ kind: "summary" }))}>Research summary</MenuItem>
            <MenuItem onClick={() => (close(), setDialog({ kind: "export" }))}>Export…</MenuItem>
            <MenuItem onClick={() => (close(), setPaneMode("both"))}>Show document and workspace</MenuItem>
          </>
        )}
      />
      {status.s === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          <span className="mr-auto">This project was changed in another tab or on another device, so your latest edits haven't been saved over it. They're kept on this device.</span>
          <Button onClick={() => void local.deletePending(projectId).then(load)}>Load the latest version</Button>
          <Button
            variant="danger"
            onClick={async () => {
              const { revision } = await api.getWorkspace(projectId);
              sync.current?.reset(revision);
              dirty.current = true;
              serializeNow();
            }}
          >
            Keep mine (replace theirs)
          </Button>
        </div>
      )}
      {recovery && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {recovery.kind === "restored" ? (
            <>
              <span className="mr-auto">Restored changes from {new Date(recovery.at).toLocaleString()} that hadn't reached the server. They're being saved now.</span>
              <Button variant="ghost" onClick={() => setRecovery(null)}>
                Dismiss
              </Button>
            </>
          ) : (
            <>
              <span className="mr-auto">This device has unsaved changes from {new Date(recovery.pending.updatedAt).toLocaleString()}, but the project has been saved elsewhere since.</span>
              <Button
                onClick={() => {
                  const mine = parseWorkspace(recovery.pending.bytes);
                  update(() => mine);
                  setRecovery(null);
                }}
              >
                Use this device's version
              </Button>
              <Button variant="ghost" onClick={() => void local.deletePending(projectId).then(() => setRecovery(null))}>
                Discard
              </Button>
            </>
          )}
        </div>
      )}
      {layout === "narrow" && (
        <div role="tablist" aria-label="Pane" className="flex border-b border-slate-200 bg-white">
          {(
            [
              ["docs", "Documents"],
              ["viewer", "Reader"],
              ["canvas", "Workspace"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={narrowPane === id} className={`flex-1 py-2 text-xs font-medium ${narrowPane === id ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-600"}`} onClick={() => setNarrowPane(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div ref={bodyRef} className="relative flex min-h-0 flex-1">
        <LinkOverlay
          container={bodyRef}
          links={crossLinks}
          pending={pendingLink}
          onStubClick={(l) => {
            const a = ws.annotations.find((x) => x.id === l.markId);
            const card = ws.cards.find((x) => x.id === l.markId);
            const sourceId = a?.sourceId ?? (card?.type === "excerpt" ? card.sourceId : undefined);
            if (sourceId) openSource(sourceId);
          }}
        />
        {layout === "wide" && (
          <>
            {panelOpen ? (
              sidebar
            ) : (
              <button
                type="button"
                className="group flex w-8 shrink-0 flex-col items-center gap-2 border-r border-slate-200 bg-white py-3 text-slate-500 hover:bg-brand-50 hover:text-brand-700"
                aria-label="Show documents panel"
                title="Show Documents, Search and Annotations"
                onClick={() => setPanelOpen(true)}
              >
                <ChevronsRight className="size-4" aria-hidden />
                <span className="text-[11px] font-medium tracking-wide [writing-mode:vertical-rl]">Documents · Search · Annotations</span>
              </button>
            )}
            {panelOpen && <Splitter label="Resize documents panel" onDrag={(dx) => setLeftW((w) => Math.max(200, Math.min(520, w + dx)))} />}
            {paneMode !== "workspace" && (paneMode === "reader" ? <div className="flex min-w-0 flex-1">{viewers}</div> : viewers)}
            {paneMode === "both" && <Splitter label="Resize document viewer" onDrag={dragViewer} />}
            {paneMode !== "reader" && canvasPane}
            {divider}
          </>
        )}
        {layout === "medium" && (
          <>
            {drawer && (
              <div className="absolute inset-y-0 left-0 z-30 w-80 max-w-[85vw] shadow-2xl">
                {sidebar}
                <IconButton label="Close panel" className="absolute top-1 right-1 bg-white" onClick={() => setDrawer(false)}>
                  <X className="size-4" aria-hidden />
                </IconButton>
              </div>
            )}
            {paneMode !== "workspace" && (paneMode === "reader" ? <div className="flex min-w-0 flex-1">{viewers}</div> : viewers)}
            {paneMode === "both" && <Splitter label="Resize document viewer" onDrag={dragViewer} />}
            {paneMode !== "reader" && canvasPane}
            {divider}
          </>
        )}
        {layout === "narrow" && (narrowPane === "docs" ? <div className="flex min-w-0 flex-1">{sidebar}</div> : narrowPane === "viewer" ? viewers : canvasPane)}
      </div>

      {popover && popAnnotation && (
        <AnnotationPopover
          key={popAnnotation.id}
          ws={ws}
          annotation={popAnnotation}
          at={popover.at}
          onClose={() => setPopover(null)}
          onChange={(patch) => update((w) => updateAnnotation(w, popAnnotation.id, patch), `ann:${popAnnotation.id}`)}
          onTags={(tags) => update((w) => setTags(w, popAnnotation.id, tags))}
          onDelete={() => update((w) => deleteItems(w, [popAnnotation.id]))}
          onToWorkspace={() => {
            const s = ws.sources[popAnnotation.sourceId]!;
            passageAction("excerpt", { documentId: s.documentId, page: s.page, rects: s.rects, quote: s.quote, ...(s.start !== undefined && s.end !== undefined ? { start: s.start, end: s.end } : {}) });
          }}
        />
      )}
      {ctx && (
        <ContextMenu at={ctx.at} onClose={() => setCtx(null)}>
          {ctx.target.kind === "canvas" && (
            <>
              <CtxItem onClick={() => newNote((ctx.target as { at: { x: number; y: number } }).at)} hint="N">
                New note here
              </CtxItem>
              {GROUP_CATEGORIES.slice(0, 4).map((c) => (
                <CtxItem key={c.id} onClick={() => newGroup(c.id, (ctx.target as { at: { x: number; y: number } }).at)}>
                  New {c.label.toLowerCase()} group here
                </CtxItem>
              ))}
              <CtxItem onClick={fit} hint="F">
                Fit workspace
              </CtxItem>
            </>
          )}
          {ctx.target.kind === "connector" &&
            (() => {
              const id = (ctx.target as { id: string }).id;
              return (
                <>
                  {RELATIONS.map((r) => (
                    <CtxItem key={r.id} onClick={() => update((w) => updateConnector(w, id, { relation: r.id }))}>
                      <span className="size-2.5 rounded-full" style={{ background: r.color }} /> {r.label}
                    </CtxItem>
                  ))}
                  <CtxItem danger onClick={() => update((w) => deleteItems(w, [id]))}>
                    Delete connection
                  </CtxItem>
                </>
              );
            })()}
          {ctx.target.kind === "card" &&
            (() => {
              const card = ws.cards.find((c) => c.id === (ctx.target as { id: string }).id);
              if (!card) return null;
              return (
                <>
                  {card.type === "excerpt" && <CtxItem onClick={() => openSource(card.sourceId)}>Open source passage</CtxItem>}
                  {card.type === "excerpt" && <CtxItem onClick={() => setEditing(card.id)}>Edit wording</CtxItem>}
                  <CtxItem onClick={() => setDialog({ kind: "tags", ids: selected.length ? selected : [card.id] })}>Tags…</CtxItem>
                  {REVIEW_STATUSES.map((s) => (
                    <CtxItem key={s.id} onClick={() => update((w) => (selected.length ? selected : [card.id]).reduce((x, id) => updateCard(x, id, { status: s.id }), w))}>
                      <span className="size-2.5 rounded-full" style={{ background: s.color }} /> Mark “{s.label}”
                    </CtxItem>
                  ))}
                  {card.stack && <CtxItem onClick={() => update((w) => separateCards(w, selected.length ? selected : [card.id], cardHeights()))} hint="Alt+drag">Separate from merged stack</CtxItem>}
                  <CtxItem onClick={() => (setSelected([card.id]), setMode("connect"))} hint="C">
                    Connect from here…
                  </CtxItem>
                  {selected.length > 1 && <CtxItem onClick={() => newGroup("issue")}>Group selected</CtxItem>}
                  <CtxItem
                    onClick={() => {
                      let ids: string[] = [];
                      update((w) => {
                        const [next, copies] = duplicateCards(w, selected.length ? selected : [card.id]);
                        ids = copies;
                        return next;
                      });
                      setSelected(ids);
                    }}
                    hint="Ctrl+D"
                  >
                    Duplicate
                  </CtxItem>
                  <CtxItem danger onClick={deleteSelection} hint="Del">
                    Delete
                  </CtxItem>
                </>
              );
            })()}
        </ContextMenu>
      )}

      {dialog?.kind === "details" && (
        <ProjectDialog
          project={project}
          onClose={() => setDialog(null)}
          onSave={async (fields) => {
            setProject(await api.updateProject(projectId, fields));
            toast("Case details saved", "success");
          }}
        />
      )}
      {dialog?.kind === "tags" && (
        <TagsDialog
          ws={ws}
          title={dialog.ids.length > 1 ? `Tags for ${dialog.ids.length} cards` : "Tags"}
          value={dialog.ids.length === 1 ? (ws.cards.find((c) => c.id === dialog.ids[0])?.tags ?? []) : [...new Set(dialog.ids.flatMap((id) => ws.cards.find((c) => c.id === id)?.tags ?? []))]}
          onSave={(tags) => update((w) => dialog.ids.reduce((x, id) => setTags(x, id, tags), w))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "compare" && <CompareDialog ws={ws} cards={ws.cards.filter((c): c is ExcerptCard => c.type === "excerpt" && dialog.ids.includes(c.id))} service={service} onOpen={(c) => openSource(c.sourceId)} onClose={() => setDialog(null)} />}
      {dialog?.kind === "summary" && <SummaryDialog ws={ws} project={project} selectedIds={selected} filteredIds={matches ? [...matches] : null} onClose={() => setDialog(null)} />}
      {dialog?.kind === "export" && <ExportDialog ws={ws} project={project} service={service} activeDocId={activeId} onSummary={() => setDialog({ kind: "summary" })} onClose={() => setDialog(null)} />}
      {dialog?.kind === "history" && (
        <HistoryDialog
          revisions={dialog.revisions}
          current={sync.current?.revision ?? 0}
          onClose={() => setDialog(null)}
          onRestore={async (rev) => {
            const { bytes } = await api.getWorkspace(projectId, rev);
            const restored = parseWorkspace(bytes);
            update((w) => ({ ...restored, documents: restored.documents.length ? restored.documents : w.documents, view: w.view }));
            toast(`Restored version #${rev}. Undo to go back.`, "success");
          }}
        />
      )}
      {dialog?.kind === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "remove-doc" && (
        <Dialog
          title="Remove document from project?"
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const d = dialog.doc;
                  update((w) => removeDocument(w, d.id));
                  closeTab(d.id);
                  setIndex(d.id, null);
                  setDialog(null);
                }}
              >
                Remove
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            “{dialog.doc.name}” will be removed from this project along with its excerpts, highlights and comments. The file itself stays in your OctoGenie files. You can undo this.
          </p>
        </Dialog>
      )}
      {dialog?.kind === "label" && <LabelDialog doc={dialog.doc} onClose={() => setDialog(null)} onSave={(short) => update((w) => upsertDocument(w, { ...dialog.doc, ...(short ? { short } : {}), ...(short ? {} : { short: undefined }) } as ResearchDocument))} />}
    </div>
  );
}

function FilterGroup({ title, options, value, onChange }: { title: string; options: string[][]; value: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return null;
  return (
    <fieldset className="mb-2">
      <legend className="mb-1 font-semibold text-slate-700">{title}</legend>
      {options.map(([id, label]) => (
        <label key={id} className="flex items-center gap-1.5 py-0.5 text-slate-700">
          <input type="checkbox" checked={value.includes(id!)} onChange={(e) => onChange(e.target.checked ? [...value, id!] : value.filter((v) => v !== id))} />
          <span className="truncate">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function LabelDialog({ doc, onSave, onClose }: { doc: ResearchDocument; onSave: (short: string) => void; onClose: () => void }) {
  const [short, setShort] = useState(doc.short ?? "");
  return (
    <Dialog
      title="Citation label"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => (onSave(short.trim()), onClose())}>
            Save
          </Button>
        </>
      }
    >
      <Field label={`Short label for “${doc.name}”`} hint="Used in citations, e.g. “Smith Dep., p. 12”. Leave empty to use the file name.">
        <input className={inputClass} value={short} maxLength={60} onChange={(e) => setShort(e.target.value)} placeholder="e.g. Smith Dep." />
      </Field>
    </Dialog>
  );
}
