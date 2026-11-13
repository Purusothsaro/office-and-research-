import type { DocumentRepository, DraftRecord, FileRecord, SessionUser } from "@octo/storage";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const RepositoryContext = createContext<DocumentRepository | null>(null);

const SessionContext = createContext<{ user: SessionUser | null; onSignOut: (() => void) | null }>({ user: null, onSignOut: null });

export function SessionProvider({ user, onSignOut, children }: { user: SessionUser | null; onSignOut: (() => void) | null; children: ReactNode }) {
  return <SessionContext.Provider value={{ user, onSignOut }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

export function RepositoryProvider({ repository, children }: { repository: DocumentRepository; children: ReactNode }) {
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): DocumentRepository {
  const repo = useContext(RepositoryContext);
  if (!repo) throw new Error("useRepository must be used inside RepositoryProvider");
  return repo;
}

/** Live file list that refreshes on repository changes, including other tabs. */
export function useFiles(): { files: FileRecord[]; loading: boolean; error: Error | null; refresh: () => void } {
  const repo = useRepository();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const latestRequest = useRef(0);

  const refresh = useCallback(() => {
    // Ignore responses that arrive after a newer request was made.
    const request = ++latestRequest.current;
    repo
      .list()
      .then((list) => {
        if (request !== latestRequest.current) return;
        setFiles(list);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, [repo]);

  useEffect(() => {
    refresh();
    return repo.subscribe((event) => {
      if (event.type === "files-changed") refresh();
    });
  }, [repo, refresh]);

  return { files, loading, error, refresh };
}

export function useDrafts(): DraftRecord[] {
  const repo = useRepository();
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const latestRequest = useRef(0);
  useEffect(() => {
    const load = () => {
      const request = ++latestRequest.current;
      void repo.listDrafts().then(
        (list) => request === latestRequest.current && setDrafts(list),
        () => request === latestRequest.current && setDrafts([]),
      );
    };
    load();
    return repo.subscribe((event) => {
      if (event.type === "drafts-changed" || event.type === "files-changed") load();
    });
  }, [repo]);
  return drafts;
}
