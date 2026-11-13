import { sheetPath, type Bookmark, type ResearchDocument, type ResearchWorkspace, type Sheet } from "@octo/research";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark as BookmarkIcon,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eraser,
  FilePlus2,
  Highlighter,
  House,
  LayoutGrid,
  ListTree,
  MoreHorizontal,
  PenLine,
  Plus,
  Redo2,
  Search,
  Share2,
  SquareDashedMousePointer,
  StickyNote,
  TextCursor,
  Trash2,
  Undo2,
  X,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton, Menu, MenuItem } from "../components/ui";
import type { DocumentService } from "./documents";
import type { Tool } from "./Viewer";

const TOOLS: { id: Tool; label: string; hint: string; icon: typeof TextCursor }[] = [
  { id: "text", label: "Select text", hint: "Select text to excerpt, highlight, comment or link (V)", icon: TextCursor },
  { id: "pen", label: "Pen", hint: "Draw on documents and the workspace (P)", icon: PenLine },
  { id: "highlighter", label: "Highlighter", hint: "Highlight freehand on documents (H)", icon: Highlighter },
  { id: "eraser", label: "Eraser", hint: "Erase ink, highlights and marks (E)", icon: Eraser },
  { id: "lasso", label: "Lasso", hint: "Drag a box on a page to excerpt that area (L)", icon: SquareDashedMousePointer },
];

export const PEN_COLORS = ["#1d4ed8", "#111827", "#dc2626", "#16a34a", "#7c3aed"];

/** The project's main toolbar: navigation, history, tools, sharing and help. */
export function AppToolbar(props: {
  title: ReactNode;
  status: ReactNode;
  onHome: () => void;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  inkColor: string;
  setInkColor: (c: string) => void;
  onShare: () => void;
  onSearch: () => void;
  onHelp: () => void;
  more: (close: () => void) => ReactNode;
  leading?: ReactNode;
}) {
  const dark = "text-slate-300 hover:bg-ink-700 hover:text-white";
  return (
    <header className="flex items-center gap-1 bg-ink-900 px-2 py-1.5 text-white" role="toolbar" aria-label="Project toolbar">
      <IconButton label="Back to projects" title="Home: all projects" className={dark} onClick={props.onHome}>
        <House className="size-4" aria-hidden />
      </IconButton>
      <IconButton label="Back" title="Back to the previous place you were reading" className={dark} disabled={!props.canBack} onClick={props.onBack}>
        <ArrowLeft className="size-4" aria-hidden />
      </IconButton>
      <IconButton label="Forward" className={dark} disabled={!props.canForward} onClick={props.onForward}>
        <ArrowRight className="size-4" aria-hidden />
      </IconButton>
      {props.leading}
      <div className="ml-1 min-w-0 max-w-[22vw]">{props.title}</div>
      {props.status}
      <span className="mx-1 h-5 w-px bg-ink-700" />
      <IconButton label="Undo" className={dark} disabled={!props.canUndo} onClick={props.onUndo}>
        <Undo2 className="size-4" aria-hidden />
      </IconButton>
      <IconButton label="Redo" className={dark} disabled={!props.canRedo} onClick={props.onRedo}>
        <Redo2 className="size-4" aria-hidden />
      </IconButton>
      <div className="mx-auto flex items-center gap-0.5 rounded-full bg-ink-800 px-1 py-0.5" role="radiogroup" aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={props.tool === t.id}
            aria-label={t.label}
            title={t.hint}
            onClick={() => props.setTool(t.id)}
            className={`inline-flex size-8 items-center justify-center rounded-full transition-colors ${props.tool === t.id ? "bg-brand-500 text-white shadow" : "text-slate-300 hover:bg-ink-700 hover:text-white"}`}
          >
            <t.icon className="size-4" aria-hidden />
          </button>
        ))}
        {props.tool === "pen" &&
          PEN_COLORS.map((c) => <button key={c} type="button" aria-label={`Ink colour ${c}`} className={`ml-0.5 size-4 rounded-full border border-white/30 ${props.inkColor === c ? "ring-2 ring-white" : ""}`} style={{ background: c }} onClick={() => props.setInkColor(c)} />)}
      </div>
      <button type="button" onClick={props.onShare} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-500">
        <Share2 className="size-4" aria-hidden /> Share
      </button>
      <IconButton label="Search all documents" className={dark} onClick={props.onSearch}>
        <Search className="size-4" aria-hidden />
      </IconButton>
      <IconButton label="Help and shortcuts" className={dark} onClick={props.onHelp}>
        <CircleHelp className="size-4" aria-hidden />
      </IconButton>
      <Menu
        label="More"
        align="right"
        trigger={(t) => (
          <IconButton label="More" className={dark} {...t}>
            <MoreHorizontal className="size-4" aria-hidden />
          </IconButton>
        )}
      >
        {props.more}
      </Menu>
    </header>
  );
}

/** Small page images for the thumbnails panel. */
function Thumb({ service, doc, page, onGo }: { service: DocumentService; doc: ResearchDocument; page: number; onGo: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let close: (() => void) | null = null;
    void service.openPdf(doc.viewFileId, doc.viewRevision).then(async (pdf) => {
      close = () => void pdf.destroy();
      const pg = await pdf.getPage(page + 1);
      const vp = pg.getViewport({ scale: 0.22 });
      const c = ref.current;
      if (cancelled || !c) return;
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      await pg.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      close?.();
    };
  }, [service, doc.viewFileId, doc.viewRevision, page]);
  return (
    <button type="button" onClick={onGo} className="flex flex-col items-center gap-0.5 rounded p-1 hover:bg-brand-50" aria-label={`Go to page ${page + 1}`}>
      <canvas ref={ref} className="w-full border border-slate-200 bg-white shadow-sm" />
      <span className="text-[10px] text-slate-500">{page + 1}</span>
    </button>
  );
}

type OutlineNode = { title: string; dest: unknown; items: OutlineNode[] };

/** Rail on the left edge of the reader: outline, annotations, pages, add document, bookmarks. */
export function ReaderRail(props: {
  doc: ResearchDocument;
  service: DocumentService;
  page: number;
  bookmarks: Bookmark[];
  onGo: (page: number) => void;
  onAnnotations: () => void;
  onAddDocument: () => void;
  onBookmark: () => void;
  onRemoveBookmark: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [panel, setPanel] = useState<"outline" | "pages" | "bookmarks" | null>(null);
  const [outline, setOutline] = useState<{ title: string; page: number | null; depth: number }[] | null>(null);
  useEffect(() => {
    if (panel !== "outline") return;
    let cancelled = false;
    void props.service.openPdf(props.doc.viewFileId, props.doc.viewRevision).then(async (pdf) => {
      const raw = ((await pdf.getOutline()) ?? []) as OutlineNode[];
      const flat: { title: string; page: number | null; depth: number }[] = [];
      const walk = async (nodes: OutlineNode[], depth: number) => {
        for (const n of nodes.slice(0, 300)) {
          let page: number | null = null;
          try {
            const dest = typeof n.dest === "string" ? await pdf.getDestination(n.dest) : (n.dest as unknown[] | null);
            if (dest && dest[0]) page = await pdf.getPageIndex(dest[0] as never);
          } catch {
            page = null;
          }
          flat.push({ title: n.title, page, depth });
          await walk(n.items ?? [], depth + 1);
        }
      };
      await walk(raw, 0);
      void pdf.destroy();
      if (!cancelled) setOutline(flat);
    });
    return () => {
      cancelled = true;
    };
  }, [panel, props.service, props.doc.viewFileId, props.doc.viewRevision]);
  const toggle = (p: typeof panel) => setPanel((cur) => (cur === p ? null : p));
  const btn = "inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-ink-900 data-[on=true]:bg-brand-100 data-[on=true]:text-brand-700";
  return (
    <div className="pointer-events-none absolute top-1/2 left-2 z-20 flex -translate-y-1/2 items-center gap-2">
      <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-lg" role="toolbar" aria-label="Reader tools" aria-orientation="vertical">
        {open && (
          <>
            <button type="button" className={btn} data-on={panel === "outline"} aria-label="Outline" title="Document outline" onClick={() => toggle("outline")}>
              <ListTree className="size-4" aria-hidden />
            </button>
            <button type="button" className={btn} aria-label="Annotations" title="All highlights, comments and marks" onClick={props.onAnnotations}>
              <Highlighter className="size-4" aria-hidden />
            </button>
            <button type="button" className={btn} data-on={panel === "pages"} aria-label="Pages" title="Page thumbnails" onClick={() => toggle("pages")}>
              <LayoutGrid className="size-4" aria-hidden />
            </button>
            <button type="button" className={btn} aria-label="Add document" title="Import another document into this project" onClick={props.onAddDocument}>
              <FilePlus2 className="size-4" aria-hidden />
            </button>
            <button type="button" className={btn} data-on={panel === "bookmarks"} aria-label="Bookmarks" title="Bookmarks" onClick={() => toggle("bookmarks")}>
              <BookmarkIcon className="size-4" aria-hidden />
            </button>
          </>
        )}
        <button type="button" className="inline-flex h-7 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label={open ? "Hide reader tools" : "Show reader tools"} onClick={() => (setOpen(!open), setPanel(null))}>
          {open ? <ChevronLeft className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        </button>
      </div>
      {panel && (
        <div className="pointer-events-auto flex max-h-[70vh] w-60 flex-col rounded-xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-label={panel === "outline" ? "Outline" : panel === "pages" ? "Pages" : "Bookmarks"}>
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
            <span className="text-xs font-semibold text-slate-700">{panel === "outline" ? "Outline" : panel === "pages" ? "Pages" : "Bookmarks"}</span>
            <IconButton label="Close panel" className="size-6" onClick={() => setPanel(null)}>
              <X className="size-3.5" aria-hidden />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {panel === "outline" &&
              (outline === null ? (
                <p className="p-2 text-xs text-slate-500">Reading outline…</p>
              ) : outline.length === 0 ? (
                <p className="p-2 text-xs text-slate-500">This document has no outline. Use Bookmarks to mark pages.</p>
              ) : (
                <ul>
                  {outline.map((o, i) => (
                    <li key={i}>
                      <button type="button" disabled={o.page === null} className="w-full truncate rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-brand-50 disabled:opacity-50" style={{ paddingLeft: 8 + o.depth * 12 }} onClick={() => o.page !== null && props.onGo(o.page)}>
                        {o.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
            {panel === "pages" && (
              <div className="grid grid-cols-2 gap-1">
                {Array.from({ length: Math.min(props.doc.pageCount, 400) }, (_, i) => (
                  <Thumb key={i} service={props.service} doc={props.doc} page={i} onGo={() => props.onGo(i)} />
                ))}
              </div>
            )}
            {panel === "bookmarks" && (
              <>
                <button type="button" className="mb-1 flex w-full items-center gap-1.5 rounded-md border border-dashed border-brand-300 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50" onClick={props.onBookmark}>
                  <BookmarkPlus className="size-3.5" aria-hidden /> Bookmark page {props.page + 1}
                </button>
                {!props.bookmarks.length && <p className="p-2 text-xs text-slate-500">No bookmarks in this document yet.</p>}
                <ul aria-label="Bookmarks in this document">
                  {props.bookmarks.map((b) => (
                    <li key={b.id} className="group flex items-center">
                      <button type="button" className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-brand-50" onClick={() => props.onGo(b.page)}>
                        {b.label}
                      </button>
                      <IconButton label={`Remove bookmark ${b.label}`} className="size-6 opacity-50 group-hover:opacity-100" onClick={() => props.onRemoveBookmark(b.id)}>
                        <Trash2 className="size-3" aria-hidden />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Rail on the right edge of the workspace: add a text note, see everything, add a child workspace. */
export function WorkspaceRail({ onNote, onFit, onAddWorkspace }: { onNote: () => void; onFit: () => void; onAddWorkspace: () => void }) {
  const [open, setOpen] = useState(true);
  const btn = "inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-ink-900";
  return (
    <div className="absolute top-1/2 right-2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-lg" role="toolbar" aria-label="Workspace rail" aria-orientation="vertical">
      {open && (
        <>
          <button type="button" className={btn} aria-label="Add text box" title="Add a text note (N)" onClick={onNote}>
            <StickyNote className="size-4" aria-hidden />
          </button>
          <button type="button" className={btn} aria-label="See whole workspace" title="Zoom out to fit everything (F)" onClick={onFit}>
            <ZoomOut className="size-4" aria-hidden />
          </button>
          <button type="button" className={btn} aria-label="Add workspace" title="Add a child workspace" onClick={onAddWorkspace}>
            <Plus className="size-4" aria-hidden />
          </button>
        </>
      )}
      <button type="button" className="inline-flex h-7 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label={open ? "Hide workspace rail" : "Show workspace rail"} onClick={() => setOpen(!open)}>
        {open ? <ChevronRight className="size-4" aria-hidden /> : <ChevronLeft className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

/** Which workspace is shown: breadcrumb to it, with a menu of every workspace in the project. */
export function SheetSwitcher({ ws, current, onSwitch, onAdd, onRename, onDelete }: { ws: ResearchWorkspace; current: string; onSwitch: (id: string) => void; onAdd: (parent: string) => void; onRename: (id: string) => void; onDelete: (id: string) => void }) {
  const path = sheetPath(ws, current);
  const depth = (s: Sheet) => sheetPath(ws, s.id).length - 1;
  const counts = new Map<string, number>();
  for (const c of ws.cards) counts.set(c.sheet ?? "main", (counts.get(c.sheet ?? "main") ?? 0) + 1);
  return (
    <nav aria-label="Workspaces" className="absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-1.5 py-1 text-xs shadow-sm">
      {path.map((s, i) => (
        <span key={s.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3 text-slate-400" aria-hidden />}
          <button type="button" className={`rounded px-1 ${s.id === current ? "font-semibold text-ink-900" : "text-brand-700 hover:underline"}`} onClick={() => onSwitch(s.id)} aria-current={s.id === current ? "page" : undefined}>
            {s.name}
          </button>
        </span>
      ))}
      <Menu
        label="All workspaces"
        trigger={(t) => (
          <IconButton label="All workspaces" className="size-6" {...t}>
            <ChevronRight className="size-3.5 rotate-90" aria-hidden />
          </IconButton>
        )}
      >
        {(close) => (
          <>
            {ws.sheets.map((s) => (
              <MenuItem key={s.id} onClick={() => (close(), onSwitch(s.id))} hint={String(counts.get(s.id) ?? 0)}>
                <span style={{ paddingLeft: depth(s) * 12 }} className={s.id === current ? "font-semibold" : ""}>
                  {s.name}
                </span>
              </MenuItem>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <MenuItem onClick={() => (close(), onAdd(current))}>New child workspace…</MenuItem>
            <MenuItem onClick={() => (close(), onRename(current))}>Rename this workspace…</MenuItem>
            {current !== "main" && (
              <MenuItem danger onClick={() => (close(), onDelete(current))}>
                Delete this workspace…
              </MenuItem>
            )}
          </>
        )}
      </Menu>
    </nav>
  );
}
