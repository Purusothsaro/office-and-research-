import { formatRelativeTime, FORMATS } from "@octo/core";
import { DocumentEditor, documentToMarkdown, documentToRtf, exportDocx, importDocx, markdownToDocument, rtfToDocument, type OctoDocument } from "@octo/editor-document";
import type { FileFormat } from "@octo/core";
import type { DraftRecord, FileRecord, RevisionRecord } from "@octo/storage";
import { AlertTriangle, Download, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

/** Renders shape SVG to PNG for Word versions that can't show SVG. */
async function rasterize(svg: string, width: number, height: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("png");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Writes the document in the file's own format (DOCX, Markdown or RTF). */
async function saveAs(format: FileFormat, doc: OctoDocument): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  if (format === "md") {
    const { markdown, warnings } = documentToMarkdown(doc);
    return { bytes: encoder.encode(markdown), warnings };
  }
  if (format === "rtf") {
    const { rtf, warnings } = documentToRtf(doc);
    return { bytes: encoder.encode(rtf), warnings };
  }
  return exportDocx(doc, { rasterize });
}

async function loadAs(format: FileFormat, bytes: Uint8Array): Promise<{ doc: OctoDocument; warnings: string[] }> {
  if (format === "md") return markdownToDocument(decoder.decode(bytes));
  if (format === "rtf") return rtfToDocument(new TextDecoder("windows-1252").decode(bytes));
  return importDocx(bytes);
}

type Loaded = { doc: OctoDocument; warnings: string[]; draft?: DraftRecord; conflict: boolean };

export function DocxEditorPage({ file, content, draft }: { file: FileRecord; content: Uint8Array; draft?: DraftRecord | undefined }) {
  const [loaded, setLoaded] = useState<Loaded | { error: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [current, setCurrent] = useState(file);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Drafts written by this editor hold the editor's JSON.
      if (draft && draft.content[0] === 0x7b) {
        try {
          const doc = JSON.parse(decoder.decode(draft.content)) as OctoDocument;
          if (doc.version === 1) {
            if (!cancelled) setLoaded({ doc, warnings: [], draft, conflict: draft.baseRevision !== current.revision });
            return;
          }
        } catch {
          // Unreadable draft: fall back to the saved file.
        }
      }
      const result = await loadAs(file.format, content);
      if (!cancelled) setLoaded({ doc: result.doc, warnings: result.warnings, conflict: false });
    })().catch(() => !cancelled && setLoaded({ error: "This document could not be opened. It may be damaged or use features that aren't supported." }));
    return () => {
      cancelled = true;
    };
    // Reload only when explicitly asked (restore) or the file changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, reloadKey]);

  if (!loaded) return <p className="p-8 text-sm text-slate-500">Opening document…</p>;
  if ("error" in loaded) {
    return (
      <div className="flex h-full flex-col">
        <EditorHeader file={file} />
        <p role="alert" className="m-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loaded.error} The original file is unchanged and can still be downloaded from the file list.
        </p>
      </div>
    );
  }
  return (
    <DocxSession
      key={`${file.id}:${reloadKey}`}
      file={current}
      loaded={loaded}
      onRestored={(updated) => {
        setCurrent(updated);
        setLoaded(null);
        setReloadKey((k) => k + 1);
      }}
      onReloadRequest={(updated) => {
        setCurrent(updated);
        setLoaded(null);
        setReloadKey((k) => k + 1);
      }}
    />
  );
}

function DocxSession({ file, loaded, onRestored, onReloadRequest }: { file: FileRecord; loaded: Loaded; onRestored: (f: FileRecord) => void; onReloadRequest: (f: FileRecord) => void }) {
  const repo = useRepository();
  const toast = useToast();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(loaded.doc);
  const [showWarnings, setShowWarnings] = useState(loaded.warnings.length > 0);
  const [formatNotice, setFormatNotice] = useState(file.format !== "docx");
  const [recovered, setRecovered] = useState(!!loaded.draft && !loaded.conflict);
  const [history, setHistory] = useState<RevisionRecord[] | null>(null);
  const autosave = useAutosave(repo, file, {
    encode: async (draft: Uint8Array) => (await saveAs(file.format, JSON.parse(decoder.decode(draft)) as OctoDocument)).bytes,
    ...(loaded.draft ? { recovered: loaded.draft.content, conflict: loaded.conflict } : {}),
  });

  const onChange = useCallback(
    (next: OctoDocument) => {
      setDoc(next);
      autosave.change(encoder.encode(JSON.stringify(next)));
    },
    [autosave],
  );

  const saveCopyAsDocx = async () => {
    const { bytes } = await exportDocx(doc, { rasterize });
    const copy = await repo.create({ name: file.name.replace(/\.[^.]+$/, ".docx"), format: "docx", bytes });
    toast(`Saved ${copy.name}`, "success");
    navigate(`/edit/${copy.id}`);
  };

  const download = async () => {
    try {
      const { bytes, warnings } = await saveAs(file.format, doc);
      downloadBytes(bytes, file.name, FORMATS[file.format].mime);
      for (const w of warnings) toast(w, "info");
    } catch {
      toast("The document could not be exported.", "error");
    }
  };

  const openHistory = async () => {
    await autosave.flush();
    setHistory(await repo.listRevisions(file.id));
  };

  const saveAsCopy = async () => {
    const { bytes } = await saveAs(file.format, doc);
    const copy = await repo.create({ name: file.name.replace(/(\.[^.]+)$/, " (conflicted copy)$1"), format: file.format, bytes });
    await autosave.discard();
    toast(`Saved your version as ${copy.name}`, "success");
    navigate(`/edit/${copy.id}`, { replace: true });
  };

  const warningList = useMemo(() => loaded.warnings, [loaded.warnings]);

  return (
    <div className="flex h-full flex-col">
      <div data-print-hide>
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
            <span className="mr-auto">This document was changed in another tab or session. Your edits have not overwritten it.</span>
            <Button variant="primary" onClick={() => void saveAsCopy()}>
              Save my version as a copy
            </Button>
            <Button
              onClick={async () => {
                const latest = await autosave.discard();
                onReloadRequest(latest);
              }}
            >
              Discard my changes
            </Button>
          </div>
        )}
        {recovered && autosave.status !== "conflict" && (
          <div role="status" className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <span className="mr-auto">Restored unsaved changes from {formatRelativeTime(loaded.draft!.updatedAt)}. They are not saved yet.</span>
            <Button
              variant="ghost"
              onClick={async () => {
                const latest = await autosave.discard();
                onReloadRequest(latest);
              }}
            >
              Discard restored changes
            </Button>
            <Button variant="ghost" onClick={() => (setRecovered(false), void autosave.keepRecovered())}>
              Keep and save
            </Button>
          </div>
        )}
        {formatNotice && (
          <div role="status" className="flex flex-wrap items-center gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
            <span className="mr-auto">
              {file.format === "md"
                ? "Markdown keeps headings, lists, tables, links and basic emphasis. Colours, fonts, alignment, page setup, headers and footers aren't saved in Markdown."
                : "RTF keeps most formatting, but shapes, columns and equations are simplified."}{" "}
              Save as DOCX to keep everything.
            </span>
            <Button onClick={() => void saveCopyAsDocx()}>Save as DOCX</Button>
            <button type="button" aria-label="Dismiss" className="rounded p-1 hover:bg-sky-100" onClick={() => setFormatNotice(false)}>
              <X aria-hidden className="size-4" />
            </button>
          </div>
        )}
        {showWarnings && (
          <div role="status" className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <div className="mr-auto">
              <p className="font-medium">Some content in this document isn't supported yet.</p>
              <ul className="mt-1 list-disc pl-5">
                {warningList.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <p className="mt-1">Saving creates a new revision; the original stays in version history.</p>
            </div>
            <button type="button" onClick={() => setShowWarnings(false)} aria-label="Dismiss" className="rounded p-1 hover:bg-amber-100">
              <X aria-hidden className="size-4" />
            </button>
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <DocumentEditor
          initial={loaded.doc}
          onChange={onChange}
          onSaveNow={() => void autosave.flush()}
          onDownload={() => void download()}
          onShowHistory={() => void openHistory()}
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
              onRestored(updated);
            }}
            onClose={() => setHistory(null)}
          />
        )}
      </div>
    </div>
  );
}
