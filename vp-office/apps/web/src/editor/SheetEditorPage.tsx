import { formatRelativeTime, FORMATS } from "@octo/core";
import { exportCsv, exportXlsx, importCsv, importXlsx, SheetEditor, type WorkbookData } from "@octo/editor-sheet";
import type { DraftRecord, FileRecord, RevisionRecord } from "@octo/storage";
import { AlertTriangle, BarChart3, Clock, Download, FileSpreadsheet, X } from "lucide-react";
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

type Loaded = { workbook: WorkbookData; warnings: string[]; draft?: DraftRecord; conflict: boolean };

async function load(file: FileRecord, bytes: Uint8Array): Promise<{ workbook: WorkbookData; warnings: string[] }> {
  const base = file.name.replace(/\.[^.]+$/, "");
  if (file.format === "csv") return { workbook: importCsv(decoder.decode(bytes), base), warnings: [] };
  const { workbook, warnings } = await importXlsx(bytes, base);
  return { workbook, warnings };
}

export function SheetEditorPage({ file, content, draft }: { file: FileRecord; content: Uint8Array; draft?: DraftRecord | undefined }) {
  const repo = useRepository();
  const [loaded, setLoaded] = useState<Loaded | { error: string } | null>(null);
  const [current, setCurrent] = useState(file);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    (async () => {
      const bytes = reloadKey === 0 ? content : await repo.getContent(file.id);
      // Drafts written by this editor hold the workbook snapshot as JSON.
      if (reloadKey === 0 && draft && draft.content[0] === 0x7b && file.format === "xlsx") {
        try {
          const workbook = JSON.parse(decoder.decode(draft.content)) as WorkbookData;
          if (workbook.sheetOrder) {
            if (!cancelled) setLoaded({ workbook, warnings: [], draft, conflict: draft.baseRevision !== file.revision });
            return;
          }
        } catch {
          // Fall through to the saved file.
        }
      }
      if (reloadKey === 0 && draft && file.format === "csv") {
        try {
          const workbook = JSON.parse(decoder.decode(draft.content)) as WorkbookData;
          if (workbook.sheetOrder && !cancelled) return setLoaded({ workbook, warnings: [], draft, conflict: draft.baseRevision !== file.revision });
        } catch {
          // A plain-text draft from the older CSV editor: ignore it.
        }
      }
      const result = await load(file, bytes);
      if (!cancelled) setLoaded({ ...result, conflict: false });
    })().catch(() => !cancelled && setLoaded({ error: "This spreadsheet could not be opened. It may be damaged or password-protected." }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, reloadKey]);

  if (!loaded) return <p className="p-8 text-sm text-slate-500">Opening spreadsheet…</p>;
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
    <SheetSession
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

function SheetSession({ file, loaded, onReload }: { file: FileRecord; loaded: Loaded; onReload: (f: FileRecord) => void }) {
  const repo = useRepository();
  const toast = useToast();
  const navigate = useNavigate();
  const csv = file.format === "csv";
  const [workbook, setWorkbook] = useState(loaded.workbook);
  const [warnings, setWarnings] = useState(loaded.warnings);
  const [showCharts, setShowCharts] = useState(false);
  const [history, setHistory] = useState<RevisionRecord[] | null>(null);
  const [recovered, setRecovered] = useState(!!loaded.draft && !loaded.conflict);
  const [csvNotice, setCsvNotice] = useState(csv);

  const encode = useCallback(
    async (draft: Uint8Array) => {
      const wb = JSON.parse(decoder.decode(draft)) as WorkbookData;
      return csv ? encoder.encode(exportCsv(wb)) : (await exportXlsx(wb)).bytes;
    },
    [csv],
  );
  const autosave = useAutosave(repo, file, { encode, ...(loaded.draft ? { recovered: loaded.draft.content, conflict: loaded.conflict } : {}) });

  const onChange = useCallback(
    (next: WorkbookData) => {
      setWorkbook(next);
      autosave.change(encoder.encode(JSON.stringify(next)));
    },
    [autosave],
  );

  const downloadXlsx = async () => {
    try {
      const { bytes, warnings: w } = await exportXlsx(workbook);
      downloadBytes(bytes, file.name.replace(/\.(csv|xlsx)$/i, ".xlsx"), FORMATS.xlsx.mime);
      for (const m of w) toast(m, "info");
    } catch {
      toast("The workbook could not be exported.", "error");
    }
  };
  const downloadCsv = () => downloadBytes(encoder.encode(exportCsv(workbook)), file.name.replace(/\.(csv|xlsx)$/i, ".csv"), FORMATS.csv.mime);

  const saveCopyAsXlsx = async () => {
    const copy = await repo.create({ name: file.name.replace(/\.csv$/i, ".xlsx"), format: "xlsx", bytes: (await exportXlsx(workbook)).bytes });
    toast(`Saved ${copy.name}`, "success");
    navigate(`/edit/${copy.id}`);
  };

  const saveAsCopy = async () => {
    const bytes = csv ? encoder.encode(exportCsv(workbook)) : (await exportXlsx(workbook)).bytes;
    const copy = await repo.create({ name: file.name.replace(/(\.[^.]+)$/, " (conflicted copy)$1"), format: file.format, bytes });
    await autosave.discard();
    toast(`Saved your version as ${copy.name}`, "success");
    navigate(`/edit/${copy.id}`, { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader file={file}>
        <SaveIndicator status={autosave.status} />
        <Button variant="ghost" aria-pressed={showCharts} onClick={() => setShowCharts(!showCharts)}>
          <BarChart3 aria-hidden className="size-4" />
          <span className="hidden md:inline">Charts</span>
        </Button>
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
        {csv ? (
          <Button onClick={() => void saveCopyAsXlsx()}>
            <FileSpreadsheet aria-hidden className="size-4" />
            <span className="hidden sm:inline">Save as XLSX</span>
          </Button>
        ) : (
          <Button variant="ghost" onClick={downloadCsv}>
            <span>CSV</span>
          </Button>
        )}
        <Button onClick={() => (csv ? downloadCsv() : void downloadXlsx())} aria-label="Download">
          <Download aria-hidden className="size-4" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      </EditorHeader>
      {autosave.status === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">
          <AlertTriangle aria-hidden className="size-4" />
          <span className="mr-auto">This spreadsheet was changed in another tab or session. Your edits have not overwritten it.</span>
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
      {csvNotice && (
        <div role="status" className="flex items-center gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
          <span className="mr-auto">CSV files keep only the first sheet's values. Formatting, formulas, other sheets and charts aren't saved in CSV; use Save as XLSX to keep them.</span>
          <button type="button" aria-label="Dismiss" className="rounded p-1 hover:bg-sky-100" onClick={() => setCsvNotice(false)}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      {warnings.length > 0 && (
        <div role="status" className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="mr-auto">
            <p className="font-medium">Some content in this workbook isn't supported yet.</p>
            <ul className="list-disc pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p>Saving creates a new revision; the original stays in version history.</p>
          </div>
          <button type="button" aria-label="Dismiss" className="rounded p-1 hover:bg-amber-100" onClick={() => setWarnings([])}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <SheetEditor initial={loaded.workbook} onChange={onChange} showCharts={showCharts} onCloseCharts={() => setShowCharts(false)} />
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
