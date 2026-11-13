import { formatRelativeTime } from "@octo/core";
import type { FileRecord } from "@octo/storage";
import { LifeBuoy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Dialog";
import { useDrafts, useRepository } from "../lib/repository";

/** Lists unsaved work recovered from previous sessions. */
export function RecoveryBanner({ files }: { files: FileRecord[] }) {
  const repo = useRepository();
  const navigate = useNavigate();
  const drafts = useDrafts();
  const byId = new Map(files.map((f) => [f.id, f]));
  const recovered = drafts.flatMap((draft) => {
    const file = byId.get(draft.fileId);
    return file ? [{ draft, file }] : [];
  });
  if (recovered.length === 0) return null;

  return (
    <section aria-labelledby="recovery-heading" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <LifeBuoy aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h2 id="recovery-heading" className="font-semibold text-amber-900">
            Unsaved changes recovered
          </h2>
          <p className="text-sm text-amber-800">These files have changes from an earlier session that were never saved.</p>
          <ul className="mt-3 space-y-2">
            {recovered.map(({ draft, file }) => (
              <li key={file.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm">
                <span className="mr-auto min-w-0 truncate">
                  <span className="font-medium text-slate-900">{file.name}</span>
                  <span className="text-slate-500"> · changed {formatRelativeTime(draft.updatedAt)}</span>
                  {draft.baseRevision !== file.revision && <span className="text-amber-800"> · file changed since</span>}
                </span>
                <Button variant="primary" onClick={() => navigate(`/edit/${file.id}`)} aria-label={`Restore unsaved changes to ${file.name}`}>
                  Restore
                </Button>
                <Button onClick={() => void repo.deleteDraft(file.id)} aria-label={`Discard unsaved changes to ${file.name}`}>
                  Discard
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
