import { extensionOf, formatBytes, formatRelativeTime, FORMATS } from "@octo/core";
import { ConflictError, type FileRecord, type RevisionRecord } from "@octo/storage";
import { X } from "lucide-react";
import { Button } from "../components/Dialog";
import { useToast } from "../components/Toasts";
import { downloadBytes } from "../lib/files";
import { useRepository } from "../lib/repository";

/**
 * Side panel listing revisions, with download and restore. Restoring saves
 * the old content as a new revision, so nothing is lost.
 */
export function VersionHistoryPanel({
  file,
  revisions,
  currentRevision,
  beforeRestore,
  onRestored,
  onClose,
}: {
  file: FileRecord;
  revisions: RevisionRecord[];
  currentRevision: number;
  beforeRestore: () => Promise<void>;
  onRestored: (updated: FileRecord) => void;
  onClose: () => void;
}) {
  const repo = useRepository();
  const toast = useToast();
  const ext = extensionOf(file.name);

  const restore = async (revision: number) => {
    try {
      await beforeRestore();
      const latest = await repo.get(file.id);
      const bytes = await repo.getContent(file.id, revision);
      const updated = await repo.saveContent(file.id, bytes, latest.revision, `Restored revision ${revision}`);
      await repo.deleteDraft(file.id);
      toast(`Restored revision ${revision}`, "success");
      onRestored(updated);
    } catch (error) {
      toast(error instanceof ConflictError ? "The file changed while restoring. Try again." : "The revision could not be restored.", "error");
    }
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-80 max-w-full flex-col border-l border-slate-200 bg-white shadow-xl" aria-label="Version history">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold text-slate-900">Version history</h2>
        <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close version history" onClick={onClose}>
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {revisions.map((r) => (
          <li key={r.revision} className="px-4 py-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-slate-900">Revision {r.revision}</span>
              <span className="text-xs text-slate-500">{formatRelativeTime(r.createdAt)}</span>
            </div>
            <p className="text-xs text-slate-500">
              {r.note} · {formatBytes(r.size)}
            </p>
            <div className="mt-2 flex gap-2">
              {r.revision !== currentRevision && (
                <Button className="!px-2.5 !py-1 text-xs" onClick={() => void restore(r.revision)} aria-label={`Restore revision ${r.revision}`}>
                  Restore
                </Button>
              )}
              <Button
                variant="ghost"
                className="!px-2.5 !py-1 text-xs"
                aria-label={`Download revision ${r.revision}`}
                onClick={async () =>
                  downloadBytes(await repo.getContent(file.id, r.revision), file.name.replace(new RegExp(`\\.${ext}$`, "i"), ` (revision ${r.revision}).${ext}`), FORMATS[file.format].mime)
                }
              >
                Download
              </Button>
              {r.revision === currentRevision && <span className="self-center text-xs font-medium text-accent">Current</span>}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
