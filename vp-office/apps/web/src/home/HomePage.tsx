import { ACCEPT_ATTRIBUTE, createBlankFile, createBlankText, createBlankWorkspace, FORMATS, KIND_LABELS, type FileKind, type TemplateInfo } from "@octo/core";
import type { FileRecord } from "@octo/storage";
import { FileSpreadsheet, FileText, FileType2, Waypoints, History, LayoutGrid, LayoutList, Menu, Presentation, Search, Shapes, Upload, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Dialog";
import { useToast } from "../components/Toasts";
import { downloadFile, importFiles } from "../lib/files";
import { useFiles, useRepository, useSession } from "../lib/repository";
import { FileBrowser, type FileAction, type ViewMode } from "./FileBrowser";
import { DeleteDialog, RenameDialog, ShortcutsDialog } from "./FileDialogs";
import { RecoveryBanner } from "./RecoveryBanner";
import { StartPanel, type NewFileKind } from "./StartPanel";

type Section = "recent" | FileKind | "templates";
type SortKey = "updated" | "name" | "size";

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "recent", label: "Recent", icon: History },
  { id: "document", label: KIND_LABELS.document.plural, icon: FileText },
  { id: "spreadsheet", label: KIND_LABELS.spreadsheet.plural, icon: FileSpreadsheet },
  { id: "presentation", label: KIND_LABELS.presentation.plural, icon: Presentation },
  { id: "pdf", label: KIND_LABELS.pdf.plural, icon: FileType2 },
  { id: "workspace", label: KIND_LABELS.workspace.plural, icon: Waypoints },
  { id: "templates", label: "Templates", icon: Shapes },
];

const VIEW_KEY = "octo.home.view";

function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function HomePage() {
  const repo = useRepository();
  const toast = useToast();
  const navigate = useNavigate();
  const { files, loading, error } = useFiles();
  const { user, onSignOut } = useSession();

  const [section, setSection] = useState<Section>("recent");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>(readView);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [renaming, setRenaming] = useState<FileRecord | null>(null);
  const [deleting, setDeleting] = useState<FileRecord | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  const searchInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Storage may be unavailable (private mode); the preference is optional.
    }
  }, [view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === "/") {
        event.preventDefault();
        searchInput.current?.focus();
      } else if (event.key === "?") {
        event.preventDefault();
        setShowShortcuts(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = files.filter((f) => {
      if (section !== "recent" && section !== "templates" && f.kind !== section) return false;
      if (!q) return true;
      return f.name.toLowerCase().includes(q) || FORMATS[f.format].label.toLowerCase().includes(q);
    });
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    else if (sort === "size") sorted.sort((a, b) => b.size - a.size);
    return sorted;
  }, [files, section, query, sort]);

  const run = useCallback(
    async (task: () => Promise<void>, failure: string) => {
      setBusy(true);
      try {
        await task();
      } catch (e) {
        console.error(e);
        toast(failure, "error");
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const createFile = (kind: NewFileKind) =>
    run(async () => {
      const generated = kind === "text" ? createBlankText() : kind === "workspace" ? createBlankWorkspace() : await createBlankFile(kind);
      const file = await repo.create(generated);
      navigate(`/edit/${file.id}`);
    }, "The file could not be created.");

  const createFromTemplate = (template: TemplateInfo) =>
    run(async () => {
      const generated = await template.build();
      const file = await repo.create({ ...generated, templateId: template.id });
      navigate(`/edit/${file.id}`);
    }, `The "${template.title}" template could not be created.`);

  const upload = (list: FileList | File[]) =>
    run(async () => {
      const outcomes = await importFiles(repo, Array.from(list));
      const imported = outcomes.filter((o) => o.ok);
      for (const o of outcomes) if (!o.ok) toast(`${o.name}: ${o.reason}`, "error");
      if (imported.length) {
        toast(imported.length === 1 ? `Uploaded ${imported[0]!.name}` : `Uploaded ${imported.length} files`, "success");
        const last = imported[imported.length - 1];
        if (last?.ok) setFocusId(last.file.id);
        setSection("recent");
        setQuery("");
      }
    }, "Upload failed.");

  const onAction = (action: FileAction, file: FileRecord) => {
    switch (action) {
      case "open":
        navigate(`/edit/${file.id}`);
        break;
      case "rename":
        setRenaming(file);
        break;
      case "delete":
        setDeleting(file);
        break;
      case "duplicate":
        void run(async () => {
          const copy = await repo.duplicate(file.id);
          toast(`Created ${copy.name}`, "success");
          setFocusId(copy.id);
        }, "The file could not be duplicated.");
        break;
      case "download":
        void run(() => downloadFile(repo, file), "The file could not be downloaded.");
        break;
    }
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
  };

  const sectionLabel = NAV.find((n) => n.id === section)!.label;

  return (
    <div
      className="flex h-full flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={onDrop}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to files
      </a>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <button type="button" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Open navigation" onClick={() => setNavOpen(true)}>
          <Menu aria-hidden className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <img src="/og-logo.png" alt="" className="size-8 rounded-md object-contain" />
          <span className="hidden text-base font-semibold text-brand-700 sm:inline">
            OctoGenie <span className="font-normal text-slate-500">Office</span>
          </span>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInput}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
            placeholder="Search files"
            aria-label="Search files"
            className="w-full rounded-lg border border-transparent bg-slate-100 py-2 pl-9 pr-12 text-sm outline-none focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-300 px-1.5 text-xs text-slate-400 sm:block">/</kbd>
        </div>
        <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Upload aria-hidden className="size-4" />
          <span className="hidden sm:inline">Upload</span>
        </Button>
        {user && onSignOut && (
          <div className="flex items-center gap-2">
            <span className="hidden max-w-40 truncate text-sm text-slate-600 lg:inline" title={user.email}>
              {user.name}
            </span>
            <Button variant="ghost" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        {navOpen && <div className="fixed inset-0 z-20 bg-slate-900/30 md:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
        <nav
          aria-label="File sections"
          className={`${navOpen ? "fixed inset-y-0 left-0 z-30 flex shadow-xl" : "hidden"} w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-3 md:static md:flex md:shadow-none`}
        >
          <button type="button" className="mb-2 self-end rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Close navigation" onClick={() => setNavOpen(false)}>
            <X aria-hidden className="size-5" />
          </button>
          <ul className="space-y-0.5">
            {NAV.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => {
                    setSection(id);
                    setNavOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                    section === id ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon aria-hidden className="size-4" />
                  <span className="flex-1 text-left">{label}</span>
                  {id !== "recent" && id !== "templates" && <span className="text-xs text-slate-400">{files.filter((f) => f.kind === id).length}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
            {user ? "Files are stored privately in your account on the OctoGenie Office server." : "Files are stored privately in this browser."}
          </p>
        </nav>

        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8">
            <RecoveryBanner files={files} />

            {section === "templates" ? (
              <>
                <h1 className="text-xl font-semibold text-slate-900">Templates</h1>
                <StartPanel busy={busy} onCreate={createFile} onTemplate={createFromTemplate} full />
              </>
            ) : (
              <>
                {section === "recent" && !query && <StartPanel busy={busy} onCreate={createFile} onTemplate={createFromTemplate} onShowAllTemplates={() => setSection("templates")} />}

                <section aria-labelledby="files-heading" className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 id="files-heading" className="mr-auto text-xl font-semibold text-slate-900">
                      {query ? `Results for "${query}"` : section === "recent" ? "Recent files" : sectionLabel}
                    </h1>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      Sort
                      <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
                        <option value="updated">Last modified</option>
                        <option value="name">Name</option>
                        <option value="size">Size</option>
                      </select>
                    </label>
                    <div className="flex rounded-md border border-slate-300 bg-white" role="group" aria-label="View">
                      <button type="button" aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => setView("grid")} className={`rounded-l-md p-2 ${view === "grid" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}>
                        <LayoutGrid aria-hidden className="size-4" />
                      </button>
                      <button type="button" aria-pressed={view === "list"} aria-label="List view" onClick={() => setView("list")} className={`rounded-r-md p-2 ${view === "list" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}>
                        <LayoutList aria-hidden className="size-4" />
                      </button>
                    </div>
                  </div>

                  {error ? (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      Your files could not be loaded. Browser storage may be disabled or full.
                    </p>
                  ) : loading ? (
                    <p className="text-sm text-slate-500">Loading files…</p>
                  ) : visible.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                      <p className="font-medium text-slate-800">{query ? "No files match your search." : "No files yet."}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {query ? "Try a different name or file type." : "Create a new file, pick a template, or drop files here to upload."}
                      </p>
                    </div>
                  ) : (
                    <FileBrowser files={visible} view={view} onAction={onAction} focusId={focusId} />
                  )}
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-700/15 p-6">
          <div className="rounded-2xl border-2 border-dashed border-brand-600 bg-white px-10 py-8 text-center shadow-xl">
            <Upload aria-hidden className="mx-auto mb-2 size-8 text-brand-600" />
            <p className="font-semibold text-slate-900">Drop files to upload</p>
            <p className="text-sm text-slate-500">DOCX, XLSX, PPTX, PDF, TXT, MD, RTF, CSV · up to 100 MB</p>
          </div>
        </div>
      )}

      {renaming && (
        <RenameDialog
          file={renaming}
          onCancel={() => setRenaming(null)}
          onRename={async (name) => {
            try {
              const updated = await repo.rename(renaming.id, name);
              toast(`Renamed to ${updated.name}`, "success");
              setFocusId(updated.id);
              setRenaming(null);
            } catch {
              toast("The file could not be renamed.", "error");
            }
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          file={deleting}
          onCancel={() => setDeleting(null)}
          onDelete={async () => {
            try {
              await repo.delete(deleting.id);
              toast(`Deleted ${deleting.name}`, "success");
              setDeleting(null);
            } catch {
              toast("The file could not be deleted.", "error");
            }
          }}
        />
      )}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
