import { formatRelativeTime, FORMATS } from "@octo/core";
import { buildPdf, PdfEditor, preparePdf, type BuildReport, type PdfEditState, type PreparedPdf } from "@octo/editor-pdf";
import type { DraftRecord, FileRecord, RevisionRecord } from "@octo/storage";
import { AlertTriangle, Download, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Dialog";
import { useToast } from "../components/Toasts";
import { downloadBytes } from "../lib/files";
import { useRepository } from "../lib/repository";
import { EditorHeader } from "./EditorPage";
import { SaveIndicator } from "./PlainTextEditor";
import { useAutosave } from "./useAutosave";
import { VersionHistoryPanel } from "./VersionHistory";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Loaded = { prepared: PreparedPdf; state: PdfEditState; draft?: DraftRecord; conflict: boolean };

export function PdfEditorPage({ file, content, draft }: { file: FileRecord; content: Uint8Array; draft?: DraftRecord | undefined }) {
  const [loaded, setLoaded] = useState<Loaded | { error: string } | null>(null);
  const [current, setCurrent] = useState(file);
  const [reloadKey, setReloadKey] = useState(0);
  const repo = useRepository();

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    (async () => {
      const bytes = reloadKey === 0 ? content : await repo.getContent(file.id);
      const prepared = await preparePdf(bytes);
      // Drafts written by this editor hold the edit state as JSON.
      if (reloadKey === 0 && draft && draft.content[0] === 0x7b && !prepared.encrypted) {
        try {
          const state = JSON.parse(decoder.decode(draft.content)) as PdfEditState;
          if (state.version === 1) {
            if (!cancelled) setLoaded({ prepared, state, draft, conflict: draft.baseRevision !== file.revision });
            return;
          }
        } catch {
          // Unreadable draft: open the saved file.
        }
      }
      if (!cancelled) setLoaded({ prepared, state: prepared.state, conflict: false });
    })().catch(() => !cancelled && setLoaded({ error: "This PDF could not be opened. It may be damaged." }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, reloadKey]);

  if (!loaded) return <p className="p-8 text-sm text-slate-500">Opening PDF…</p>;
  if ("error" in loaded) {
    return (
      <div className="flex h-full flex-col">
        <EditorHeader file={current} />
        <p role="alert" className="m-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loaded.error} The original file is unchanged and can still be downloaded from the file list.
        </p>
      </div>
    );
  }
  return (
    <PdfSession
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

function PdfSession({ file, loaded, onReload }: { file: FileRecord; loaded: Loaded; onReload: (f: FileRecord) => void }) {
  const repo = useRepository();
  const toast = useToast();
  const navigate = useNavigate();
  const { prepared } = loaded;
  const [state, setState] = useState(loaded.state);
  const [warnings, setWarnings] = useState(prepared.warnings);
  const [recovered, setRecovered] = useState(!!loaded.draft && !loaded.conflict);
  const [history, setHistory] = useState<RevisionRecord[] | null>(null);
  const [covered, setCovered] = useState<number[]>([]);
  const encode = useCallback(
    async (draft: Uint8Array) => {
      const report: BuildReport = { coveredPages: [] };
      const bytes = await buildPdf(prepared.base, JSON.parse(decoder.decode(draft)) as PdfEditState, report);
      setCovered(report.coveredPages);
      return bytes;
    },
    [prepared.base],
  );
  const autosave = useAutosave(repo, file, { encode, ...(loaded.draft ? { recovered: loaded.draft.content, conflict: loaded.conflict } : {}) });

  const onChange = useCallback(
    (next: PdfEditState) => {
      setState(next);
      if (!prepared.encrypted) autosave.change(encoder.encode(JSON.stringify(next)));
    },
    [autosave, prepared.encrypted],
  );

  const build = () => (prepared.encrypted ? Promise.resolve(prepared.base) : buildPdf(prepared.base, state));

  const download = async () => {
    try {
      downloadBytes(await build(), file.name, FORMATS.pdf.mime);
    } catch {
      toast("The PDF could not be exported.", "error");
    }
  };

  const print = async () => {
    // Opening the PDF in the browser's own viewer gives faithful printing.
    const url = URL.createObjectURL(new Blob([(await build()) as BlobPart], { type: "application/pdf" }));
    const win = window.open(url, "_blank", "noopener");
    if (!win) toast("Allow pop-ups to print, or download the PDF and print it.", "error");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const saveAsCopy = async () => {
    const copy = await repo.create({ name: file.name.replace(/\.pdf$/i, " (conflicted copy).pdf"), format: "pdf", bytes: await buildPdf(prepared.base, state) });
    await autosave.discard();
    toast(`Saved your version as ${copy.name}`, "success");
    navigate(`/edit/${copy.id}`, { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader file={file}>
        <SaveIndicator status={autosave.status} />
        <Button onClick={() => void download()} aria-label="Download">
          <Download aria-hidden className="size-4" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      </EditorHeader>
      {autosave.status === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">
          <AlertTriangle aria-hidden className="size-4" />
          <span className="mr-auto">This PDF was changed in another tab or session. Your edits have not overwritten it.</span>
          <Button variant="primary" onClick={() => void saveAsCopy()}>
            Save my version as a copy
          </Button>
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
      {covered.length > 0 && (
        <div role="alert" className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Some edited text on page {covered.join(", ")} is stored in a way that can't be rewritten, so it was covered with white instead of removed. The original
            text may still be found by copying or searching the saved PDF.
          </span>
        </div>
      )}
      {warnings.length > 0 && (
        <div role="status" className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <ul className="mr-auto list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <button type="button" aria-label="Dismiss" className="rounded p-1 hover:bg-amber-100" onClick={() => setWarnings([])}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <PdfEditor
          base={prepared.base}
          initial={loaded.state}
          fields={prepared.fields}
          readOnly={prepared.encrypted}
          onChange={onChange}
          onDownload={() => void download()}
          onPrint={() => void print()}
          onShowHistory={async () => {
            await autosave.flush();
            setHistory(await repo.listRevisions(file.id));
          }}
          onError={(m) => toast(m, "error")}
        />
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
