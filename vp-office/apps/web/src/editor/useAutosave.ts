import { ConflictError, type DocumentRepository, type FileRecord } from "@octo/storage";
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "unsaved" | "saving" | "offline" | "conflict";

export interface AutosaveOptions {
  /** Delay before unsaved changes are written to the local draft store. */
  draftDelay?: number;
  /** Delay before changes are committed as a new revision. */
  saveDelay?: number;
  retryDelay?: number;
  /** Content recovered from a draft that still needs committing. */
  recovered?: Uint8Array;
  /** Start in conflict state (draft based on an older revision). */
  conflict?: boolean;
  /**
   * Converts draft content into the file format at commit time. Drafts can
   * then hold a cheap working format (for example editor JSON) while
   * revisions hold the real file (for example DOCX).
   */
  encode?: (draft: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Two-stage autosave: every change is written to a local draft quickly (crash
 * safety), then committed as a revision with optimistic concurrency. A stale
 * base revision puts the editor in "conflict" instead of overwriting.
 */
export function useAutosave(repo: DocumentRepository, file: FileRecord, options: AutosaveOptions = {}) {
  const { draftDelay = 400, saveDelay = 1500, retryDelay = 5000 } = options;
  const [status, setStatus] = useState<SaveStatus>(options.conflict ? "conflict" : options.recovered ? "unsaved" : "saved");
  const [revision, setRevision] = useState(file.revision);

  const base = useRef(file.revision);
  const pending = useRef<Uint8Array | null>(options.recovered ?? null);
  const version = useRef(0);
  const saving = useRef(false);
  const conflicted = useRef(!!options.conflict);
  // Recovered content waits for the user to keep it, edit it, or discard it.
  const held = useRef(!!options.recovered);
  const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const commitRef = useRef<() => Promise<void>>(async () => {});
  const encodeRef = useRef(options.encode);
  encodeRef.current = options.encode;

  const writeDraft = useCallback(async () => {
    const content = pending.current;
    if (content) await repo.putDraft({ fileId: file.id, baseRevision: base.current, content });
  }, [repo, file.id]);

  const scheduleSave = useCallback(
    (delay: number) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void commitRef.current(), delay);
    },
    [],
  );

  const commit = useCallback(async () => {
    if (!pending.current || saving.current || conflicted.current || held.current) return;
    clearTimeout(saveTimer.current);
    saving.current = true;
    setStatus("saving");
    const savedVersion = version.current;
    const draft = pending.current;
    try {
      const bytes = encodeRef.current ? await encodeRef.current(draft) : draft;
      const updated = await repo.saveContent(file.id, bytes, base.current);
      base.current = updated.revision;
      setRevision(updated.revision);
      if (version.current === savedVersion) {
        pending.current = null;
        await repo.deleteDraft(file.id);
        // A change may have arrived while the draft was being removed.
        if (version.current === savedVersion) setStatus("saved");
        else await writeDraft();
      } else {
        await writeDraft();
        setStatus("unsaved");
        scheduleSave(saveDelay);
      }
    } catch (error) {
      if (error instanceof ConflictError) {
        conflicted.current = true;
        setStatus("conflict");
        await writeDraft().catch(() => undefined);
      } else {
        setStatus("offline");
        await writeDraft().catch(() => undefined);
        scheduleSave(retryDelay);
      }
    } finally {
      saving.current = false;
    }
  }, [repo, file.id, writeDraft, scheduleSave, saveDelay, retryDelay]);
  commitRef.current = commit;

  const change = useCallback(
    (content: Uint8Array) => {
      pending.current = content;
      held.current = false;
      version.current++;
      if (!conflicted.current) setStatus((s) => (s === "saving" ? s : "unsaved"));
      clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => void writeDraft(), draftDelay);
      if (!conflicted.current) scheduleSave(saveDelay);
    },
    [writeDraft, scheduleSave, draftDelay, saveDelay],
  );

  /** Writes the draft and commits immediately (Ctrl+S, leaving the editor). */
  const flush = useCallback(async () => {
    clearTimeout(draftTimer.current);
    await writeDraft();
    await commit();
  }, [writeDraft, commit]);

  /** Accepts recovered content and commits it. */
  const keepRecovered = useCallback(async () => {
    held.current = false;
    await commit();
  }, [commit]);

  /** Drops local changes; used to resolve conflicts or discard recoveries. */
  const discard = useCallback(async () => {
    clearTimeout(draftTimer.current);
    clearTimeout(saveTimer.current);
    pending.current = null;
    conflicted.current = false;
    held.current = false;
    await repo.deleteDraft(file.id);
    const latest = await repo.get(file.id);
    base.current = latest.revision;
    setRevision(latest.revision);
    setStatus("saved");
    return latest;
  }, [repo, file.id]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!pending.current) return;
      void writeDraft();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(draftTimer.current);
      clearTimeout(saveTimer.current);
      // Leaving the editor: keep the work safe and try to commit it
      // (held or conflicted work stays a draft for the recovery banner).
      if (pending.current) void writeDraft().then(() => commitRef.current()).catch(() => undefined);
    };
  }, [writeDraft]);

  return { status, revision, change, flush, keepRecovered, discard };
}
