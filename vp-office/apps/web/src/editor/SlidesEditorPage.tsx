import { formatRelativeTime, FORMATS } from "@octo/core";
import { exportPptx, importPptx, SlidesEditor, type Deck } from "@octo/editor-slides";
import type { DraftRecord, FileRecord, RevisionRecord } from "@octo/storage";
import { AlertTriangle, X } from "lucide-react";
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
const encodePptx = async (draft: Uint8Array) => (await exportPptx(JSON.parse(decoder.decode(draft)) as Deck)).bytes;

type Loaded = { deck: Deck; warnings: string[]; draft?: DraftRecord; conflict: boolean };

export function SlidesEditorPage({ file, content, draft }: { file: FileRecord; content: Uint8Array; draft?: DraftRecord | undefined }) {
  const repo = useRepository();
  const [loaded, setLoaded] = useState<Loaded | { error: string } | null>(null);
  const [current, setCurrent] = useState(file);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    (async () => {
      const bytes = reloadKey === 0 ? content : await repo.getContent(file.id);
      if (reloadKey === 0 && draft && draft.content[0] === 0x7b) {
        try {
          const deck = JSON.parse(decoder.decode(draft.content)) as Deck;
          if (deck.version === 1) {
            if (!cancelled) setLoaded({ deck, warnings: [], draft, conflict: draft.baseRevision !== file.revision });
            return;
          }
        } catch {
          // Fall through to the saved file.
        }
      }
      const { deck, warnings } = await importPptx(bytes);
      if (!cancelled) setLoaded({ deck, warnings, conflict: false });
    })().catch(() => !cancelled && setLoaded({ error: "This presentation could not be opened. It may be damaged or password-protected." }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, reloadKey]);

  if (!loaded) return <p className="p-8 text-sm text-slate-500">Opening presentation…</p>;
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
    <SlidesSession
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

function SlidesSession({ file, loaded, onReload }: { file: FileRecord; loaded: Loaded; onReload: (f: FileRecord) => void }) {
  const repo = useRepository();
  const toast = useToast();
  const navigate = useNavigate();
  const [deck, setDeck] = useState(loaded.deck);
  const [warnings, setWarnings] = useState(loaded.warnings);
  const [history, setHistory] = useState<RevisionRecord[] | null>(null);
  const [recovered, setRecovered] = useState(!!loaded.draft && !loaded.conflict);
  const autosave = useAutosave(repo, file, { encode: encodePptx, ...(loaded.draft ? { recovered: loaded.draft.content, conflict: loaded.conflict } : {}) });

  const onChange = useCallback(
    (next: Deck) => {
      setDeck(next);
      autosave.change(encoder.encode(JSON.stringify(next)));
    },
    [autosave],
  );

  const download = async () => {
    try {
      const { bytes, warnings: w } = await exportPptx(deck);
      downloadBytes(bytes, file.name, FORMATS.pptx.mime);
      for (const m of w) toast(m, "info");
    } catch {
      toast("The presentation could not be exported.", "error");
    }
  };

  const saveAsCopy = async () => {
    const copy = await repo.create({ name: file.name.replace(/\.pptx$/i, " (conflicted copy).pptx"), format: "pptx", bytes: (await exportPptx(deck)).bytes });
    await autosave.discard();
    toast(`Saved your version as ${copy.name}`, "success");
    navigate(`/edit/${copy.id}`, { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader file={file}>
        <SaveIndicator status={autosave.status} />
      </EditorHeader>
      {autosave.status === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">
          <AlertTriangle aria-hidden className="size-4" />
          <span className="mr-auto">This presentation was changed in another tab or session. Your edits have not overwritten it.</span>
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
      {warnings.length > 0 && (
        <div role="status" className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="mr-auto">
            <p className="font-medium">Some content in this presentation isn't supported yet.</p>
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
        <SlidesEditor
          initial={loaded.deck}
          onChange={onChange}
          onDownload={() => void download()}
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
