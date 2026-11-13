import { formatRelativeTime } from "@octo/core";
import { exportOutlineDocx, exportOutlinePdf, parseWorkspace, serializeWorkspace, WorkspaceEditor, type Workspace } from "@octo/editor-workspace";
import { FORMATS } from "@octo/core";
import { downloadBytes } from "../lib/files";
import type { DraftRecord, FileRecord, RevisionRecord } from "@octo/storage";
import { AlertTriangle, Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Dialog";
import { useToast } from "../components/Toasts";
import { useRepository } from "../lib/repository";
import { EditorHeader } from "./EditorPage";
import { SaveIndicator } from "./PlainTextEditor";
import { useAutosave } from "./useAutosave";
import { VersionHistoryPanel } from "./VersionHistory";

type Loaded = { ws: Workspace; draft?: DraftRecord; conflict: boolean };

export function WorkspacePage({ file, content, draft }: { file: FileRecord; content: Uint8Array; draft?: DraftRecord | undefined }) {
  const repo = useRepository();
  const [loaded, setLoaded] = useState<Loaded | { error: string } | null>(null);
  const [current, setCurrent] = useState(file);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    (async () => {
      if (reloadKey === 0 && draft) {
        try {
          const ws = parseWorkspace(draft.content);
          if (!cancelled) setLoaded({ ws, draft, conflict: draft.baseRevision !== file.revision });
          return;
        } catch {
          // Fall through to the saved file.
        }
      }
      const bytes = reloadKey === 0 ? content : await repo.getContent(file.id);
      if (!cancelled) setLoaded({ ws: parseWorkspace(bytes), conflict: false });
    })().catch(() => !cancelled && setLoaded({ error: "This workspace could not be opened." }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, reloadKey]);

  if (!loaded) return <p className="p-8 text-sm text-slate-500">Opening workspace…</p>;
  if ("error" in loaded) {
    return (
      <div className="flex h-full flex-col">
        <EditorHeader file={current} />
        <p role="alert" className="m-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loaded.error}
        </p>
      </div>
    );
  }
  return (
    <WorkspaceSession
      key={`${file.id}:${reloadKey}`}
      file={current}
      loaded={loaded}
      onReload={(updated) => {
        setCurrent(updated);
        setReloadKey((k) => k + 1);
      }}
    />
  );
}

function WorkspaceSession({ file, loaded, onReload }: { file: FileRecord; loaded: Loaded; onReload: (f: FileRecord) => void }) {
  const repo = useRepository();
  const toast = useToast();
  const navigate = useNavigate();
  const [history, setHistory] = useState<RevisionRecord[] | null>(null);
  const [recovered, setRecovered] = useState(!!loaded.draft && !loaded.conflict);
  // Drafts and saved files use the same JSON format.
  const autosave = useAutosave(repo, file, loaded.draft ? { recovered: loaded.draft.content, conflict: loaded.conflict } : {});

  const onChange = useCallback((ws: Workspace) => autosave.change(serializeWorkspace(ws)), [autosave]);

  // Live sync: when another device or tab saves this workspace, reload it here
  // unless there are local edits (those keep the usual conflict protection).
  const statusRef = useRef(autosave.status);
  statusRef.current = autosave.status;
  const revisionRef = useRef(autosave.revision);
  revisionRef.current = autosave.revision;
  // Stable references so the server subscription isn't recreated on every render.
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  useEffect(
    () =>
      repo.subscribe((event) => {
        if (event.type !== "file-saved" || event.fileId !== file.id || event.revision <= revisionRef.current) return;
        if (statusRef.current !== "saved") return;
        void repo.get(file.id).then((latest) => {
          toastRef.current("Updated with changes saved on another device.", "info");
          reloadRef.current(latest);
        });
      }),
    [repo, file.id],
  );

  const exportPdf = async (ws: Workspace) => {
    try {
      const base = file.name.replace(/\.octows$/i, "");
      const bytes = await exportOutlinePdf(ws, base);
      const created = await repo.create({ name: `${base} - outline.pdf`, format: "pdf", bytes });
      downloadBytes(bytes, created.name, FORMATS.pdf.mime);
      toast(`Saved ${created.name} to your files`, "success");
    } catch {
      toast("The PDF could not be exported.", "error");
    }
  };
  const loadDocument = useCallback((fileId: string) => repo.getContent(fileId), [repo]);
  const listDocuments = useCallback(async () => (await repo.list()).filter((f) => f.format === "pdf").map((f) => ({ id: f.id, name: f.name })), [repo]);

  const exportOutline = async (ws: Workspace) => {
    try {
      const base = file.name.replace(/\.octows$/i, "");
      const bytes = await exportOutlineDocx(ws, base);
      const created = await repo.create({ name: `${base} - outline.docx`, format: "docx", bytes });
      toast(`Saved ${created.name} to your files`, "success");
      navigate(`/edit/${created.id}`);
    } catch {
      toast("The outline could not be exported.", "error");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader file={file}>
        <SaveIndicator status={autosave.status} />
        <Button
          variant="ghost"
          aria-label="Version history"
          onClick={async () => {
            await autosave.flush();
            setHistory(await repo.listRevisions(file.id));
          }}
        >
          <Clock aria-hidden className="size-4" />
          <span className="hidden md:inline">History</span>
        </Button>
      </EditorHeader>
      {autosave.status === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">
          <AlertTriangle aria-hidden className="size-4" />
          <span className="mr-auto">This workspace was changed in another tab or session. Your edits have not overwritten it.</span>
          <Button onClick={async () => onReload(await autosave.discard())}>Discard my changes</Button>
        </div>
      )}
      {recovered && autosave.status !== "conflict" && (
        <div role="status" className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span className="mr-auto">Restored unsaved changes from {formatRelativeTime(loaded.draft!.updatedAt)}. They are not saved yet.</span>
          <Button variant="ghost" onClick={async () => onReload(await autosave.discard())}>
            Discard restored changes
          </Button>
          <Button variant="ghost" onClick={() => (setRecovered(false), void autosave.keepRecovered())}>
            Keep and save
          </Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <WorkspaceEditor initial={loaded.ws} onChange={onChange} loadDocument={loadDocument} listDocuments={listDocuments} onExportOutline={(ws) => void exportOutline(ws)} onExportPdf={(ws) => void exportPdf(ws)} onError={(m) => toast(m, "error")} />
        {history && (
          <VersionHistoryPanel
            file={file}
            revisions={history}
            currentRevision={autosave.revision}
            beforeRestore={() => autosave.flush()}
            onRestored={(updated) => {
              setHistory(null);
              onReload(updated);
            }}
            onClose={() => setHistory(null)}
          />
        )}
      </div>
    </div>
  );
}
