import { fromPlain, toPlain, type DocumentIndex } from "../search/text-index";

/**
 * Per-device storage in IndexedDB:
 * - pending: the latest unsynced workspace of each project, so edits survive
 *   a crash, a closed tab or a lost connection (cleared once the server has it);
 * - indexes: extracted page text per exact file revision, so documents aren't
 *   re-read on every open.
 * Data stays on this device and is keyed by user so accounts don't mix.
 */
export interface PendingWorkspace {
  projectId: string;
  bytes: Uint8Array;
  baseRevision: number;
  updatedAt: number;
}

const DB_VERSION = 1;

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending", { keyPath: "projectId" });
      if (!db.objectStoreNames.contains("indexes")) db.createObjectStore("indexes");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export class LocalStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly userId: string) {}

  private get conn(): Promise<IDBDatabase> {
    // IndexedDB can be unavailable (private windows, blocked storage); callers treat failures as "nothing stored".
    this.db ??= open(`octo-research-${this.userId}`);
    return this.db;
  }

  private async store(name: "pending" | "indexes", mode: IDBTransactionMode) {
    return (await this.conn).transaction(name, mode).objectStore(name);
  }

  async putPending(p: PendingWorkspace): Promise<void> {
    await done((await this.store("pending", "readwrite")).put(p));
  }
  async getPending(projectId: string): Promise<PendingWorkspace | undefined> {
    return (await done((await this.store("pending", "readonly")).get(projectId))) as PendingWorkspace | undefined;
  }
  async deletePending(projectId: string): Promise<void> {
    await done((await this.store("pending", "readwrite")).delete(projectId));
  }
  async listPending(): Promise<PendingWorkspace[]> {
    return (await done((await this.store("pending", "readonly")).getAll())) as PendingWorkspace[];
  }

  async putIndex(key: string, idx: DocumentIndex): Promise<void> {
    await done((await this.store("indexes", "readwrite")).put(toPlain(idx), key));
  }
  async getIndex(key: string): Promise<DocumentIndex | undefined> {
    const raw = (await done((await this.store("indexes", "readonly")).get(key))) as ReturnType<typeof toPlain> | undefined;
    return raw ? fromPlain(raw) : undefined;
  }

  async close(): Promise<void> {
    if (this.db) (await this.db).close();
    this.db = null;
  }
}
