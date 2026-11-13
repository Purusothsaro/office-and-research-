import { baseName, extensionOf, formatRelativeTime, FORMATS } from "@octo/core";
import type { DraftRecord, FileRecord } from "@octo/storage";
import { AlertTriangle, Check, CloudOff, Download, Loader2, PencilLine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Dialog";
import { useToast } from "../components/Toasts";
import { downloadBytes } from "../lib/files";
import { useRepository } from "../lib/repository";
import { EditorHeader } from "./EditorPage";
import { useAutosave, type SaveStatus } from "./useAutosave";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const STATUS: Record<SaveStatus, { label: string; icon: typeof Check; className: string }> = {
  saved: { label: "All changes saved", icon: Check, className: "text-slate-500" },
  unsaved: { label: "Unsaved changes", icon: PencilLine, className: "text-slate-500" },
  saving: { label: "Saving…", icon: Loader2, className: "text-slate-500" },
  offline: { label: "Couldn't save — kept on this device", icon: CloudOff, className: "text-amber-700" },
  conflict: { label: "Conflict — file changed elsewhere", icon: AlertTriangle, className: "text-red-700" },
};

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const { label, icon: Icon, className } = STATUS[status];
  return (
    <span role="status" aria-live="polite" className={`flex items-center gap-1.5 text-sm ${className}`} data-save-status={status}>
      <Icon aria-hidden className={`size-4 ${status === "saving" ? "animate-spin" : ""}`} />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}

function stats(text: string) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text ? text.split("\n").length : 0;
  return { words, characters: text.length, lines };
}

interface PlainTextEditorProps {
  file: FileRecord;
  content: Uint8Array;
  draft?: DraftRecord | undefined;
}

/**
 * Lossless editor for TXT, Markdown and CSV. It is also the reference
 * integration for autosave, drafts and conflict handling that the rich
 * editors reuse.
 */
export function PlainTextEditor({ file, content, draft }: PlainTextEditorProps) {
  const repo = useRepository();
  const toast = useToast();
  const navigate = useNavigate();
  const draftConflict = !!draft && draft.baseRevision !== file.revision;
  const [text, setText] = useState(() => decoder.decode(draft ? draft.content : content));
  const [recoveredAt, setRecoveredAt] = useState<number | null>(draft?.updatedAt ?? null);
  const autosave = useAutosave(repo, file, draft ? { recovered: draft.content, conflict: draftConflict } : {});
  const counts = useMemo(() => stats(text), [text]);
  const mono = file.format !== "txt";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void autosave.flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave]);

  const onChange = (value: string) => {
    setText(value);
    autosave.change(encoder.encode(value));
  };

  const discardLocal = async () => {
    const latest = await autosave.discard();
    setText(decoder.decode(await repo.getContent(latest.id)));
    setRecoveredAt(null);
  };

  const saveAsCopy = async () => {
    const copy = await repo.create({
      name: `${baseName(file.name)} (conflicted copy).${extensionOf(file.name)}`,
      format: file.format,
      bytes: encoder.encode(text),
    });
    await autosave.discard();
    toast(`Saved your version as ${copy.name}`, "success");
    navigate(`/edit/${copy.id}`, { replace: true });
  };

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <EditorHeader file={file}>
        <SaveIndicator status={autosave.status} />
        <Button onClick={() => downloadBytes(encoder.encode(text), file.name, FORMATS[file.format].mime)} aria-label="Download">
          <Download aria-hidden className="size-4" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      </EditorHeader>

      {autosave.status === "conflict" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle aria-hidden className="size-4" />
          <span className="mr-auto">This file was changed in another tab or session after your edits began. Your edits have not overwritten it.</span>
          <Button variant="primary" onClick={() => void saveAsCopy()}>
            Save my version as a copy
          </Button>
          <Button onClick={() => void discardLocal()}>Discard my changes</Button>
        </div>
      ) : (
        recoveredAt !== null && (
          <div role="status" className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <span className="mr-auto">Restored unsaved changes from {formatRelativeTime(recoveredAt)}. They are not saved yet.</span>
            <Button variant="ghost" onClick={() => void discardLocal()}>
              Discard restored changes
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRecoveredAt(null);
                void autosave.keepRecovered();
              }}
            >
              Keep and save
            </Button>
          </div>
        )
      )}

      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto p-3 sm:p-6">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Contents of ${file.name}`}
          spellCheck={file.format !== "csv"}
          className={`min-h-full w-full max-w-4xl resize-none rounded-lg border border-slate-200 bg-white p-6 text-[15px] leading-relaxed shadow-sm outline-none focus:border-brand-600 focus-visible:outline-none sm:p-10 ${
            mono ? "font-mono text-sm" : ""
          }`}
        />
      </main>
      <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-slate-200 bg-white px-4 text-xs text-slate-500">
        <span>{FORMATS[file.format].label}</span>
        <span>{counts.words} words</span>
        <span>{counts.characters} characters</span>
        <span>{counts.lines} lines</span>
        <span className="ml-auto">Revision {autosave.revision}</span>
      </footer>
    </div>
  );
}
