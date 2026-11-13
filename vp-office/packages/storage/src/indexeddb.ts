import { baseName, extensionOf, FORMATS, makeFileName } from "@octo/core";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  ConflictError,
  NotFoundError,
  type CreateFileInput,
  type DocumentRepository,
  type DraftRecord,
  type FileRecord,
  type RepositoryEvent,
  type RevisionRecord,
} from "./types";

interface OfficeDB extends DBSchema {
  files: { key: string; value: FileRecord };
  revisions: { key: [string, number]; value: RevisionRecord; indexes: { byFile: string } };
  blobs: { key: [string, number]; value: { fileId: string; revision: number; bytes: Uint8Array } };
  drafts: { key: string; value: DraftRecord };
}

const DB_VERSION = 1;
const CHANNEL = "octogenie-office-storage";

function newId(): string {
  return crypto.randomUUID();
}

interface WritableTx {
  abort(): void;
  done: Promise<void>;
}

/**
 * Runs writes so that any failure, including a synchronous throw while
 * queuing requests, aborts the whole transaction instead of committing a
 * partial write.
 */
async function writeAll(tx: WritableTx, queue: () => Promise<unknown>[]): Promise<void> {
  try {
    await Promise.all([...queue(), tx.done]);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export class IndexedDbRepository implements DocumentRepository {
  private dbPromise: Promise<IDBPDatabase<OfficeDB>>;
  private listeners = new Set<(event: RepositoryEvent) => void>();
  private channel: BroadcastChannel | null = null;

  constructor(
    private readonly dbName = "octogenie-office",
    private readonly now: () => number = Date.now,
  ) {
    this.dbPromise = openDB<OfficeDB>(dbName, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("files", { keyPath: "id" });
        db.createObjectStore("revisions", { keyPath: ["fileId", "revision"] }).createIndex("byFile", "fileId");
        db.createObjectStore("blobs", { keyPath: ["fileId", "revision"] });
        db.createObjectStore("drafts", { keyPath: "fileId" });
      },
    });
    if (typeof BroadcastChannel !== "undefined") {
      // Keeps other open tabs in sync with this one.
      this.channel = new BroadcastChannel(`${CHANNEL}:${dbName}`);
      this.channel.onmessage = (message: MessageEvent<RepositoryEvent>) => this.notify(message.data, false);
    }
  }

  close(): void {
    this.channel?.close();
    void this.dbPromise.then((db) => db.close());
  }

  subscribe(listener: (event: RepositoryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: RepositoryEvent, broadcast = true): void {
    for (const listener of this.listeners) listener(event);
    if (broadcast) this.channel?.postMessage(event);
  }

  async list(): Promise<FileRecord[]> {
    const db = await this.dbPromise;
    const files = await db.getAll("files");
    return files.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<FileRecord> {
    const file = await (await this.dbPromise).get("files", id);
    if (!file) throw new NotFoundError(id);
    return file;
  }

  async getContent(id: string, revision?: number): Promise<Uint8Array> {
    const rev = revision ?? (await this.get(id)).revision;
    const blob = await (await this.dbPromise).get("blobs", [id, rev]);
    if (!blob) throw new NotFoundError(id);
    return blob.bytes;
  }

  async listRevisions(id: string): Promise<RevisionRecord[]> {
    const revisions = await (await this.dbPromise).getAllFromIndex("revisions", "byFile", id);
    return revisions.sort((a, b) => b.revision - a.revision);
  }

  async create(input: CreateFileInput): Promise<FileRecord> {
    const info = FORMATS[input.format];
    const now = this.now();
    const record: FileRecord = {
      id: newId(),
      name: makeFileName(baseName(input.name), input.format),
      kind: info.kind,
      format: input.format,
      size: input.bytes.byteLength,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      ...(input.templateId ? { templateId: input.templateId } : {}),
    };
    const db = await this.dbPromise;
    const tx = db.transaction(["files", "revisions", "blobs"], "readwrite");
    await writeAll(tx, () => [
      tx.objectStore("files").add(record),
      tx.objectStore("revisions").add({ fileId: record.id, revision: 1, size: record.size, createdAt: now, note: "Created" }),
      tx.objectStore("blobs").add({ fileId: record.id, revision: 1, bytes: input.bytes }),
    ]);
    this.notify({ type: "files-changed" });
    return record;
  }

  async rename(id: string, newBaseName: string): Promise<FileRecord> {
    const db = await this.dbPromise;
    const tx = db.transaction("files", "readwrite");
    const file = await tx.store.get(id);
    if (!file) throw new NotFoundError(id);
    const updated = { ...file, name: makeFileName(newBaseName, file.format), updatedAt: this.now() };
    await writeAll(tx, () => [tx.store.put(updated)]);
    this.notify({ type: "files-changed" });
    return updated;
  }

  async duplicate(id: string): Promise<FileRecord> {
    const [file, bytes, files] = await Promise.all([this.get(id), this.getContent(id), this.list()]);
    const taken = new Set(files.map((f) => f.name.toLowerCase()));
    const stem = baseName(file.name).replace(/ \(copy(?: \d+)?\)$/, "");
    const ext = extensionOf(file.name);
    let candidate = `${stem} (copy)`;
    for (let n = 2; taken.has(`${candidate}.${ext}`.toLowerCase()); n++) candidate = `${stem} (copy ${n})`;
    return this.create({ name: `${candidate}.${ext}`, format: file.format, bytes, ...(file.templateId ? { templateId: file.templateId } : {}) });
  }

  async saveContent(id: string, bytes: Uint8Array, baseRevision: number, note = "Saved"): Promise<FileRecord> {
    const db = await this.dbPromise;
    // One transaction makes the revision check and write atomic across tabs.
    const tx = db.transaction(["files", "revisions", "blobs"], "readwrite");
    const file = await tx.objectStore("files").get(id);
    if (!file || file.revision !== baseRevision) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw file ? new ConflictError(id, baseRevision, file.revision) : new NotFoundError(id);
    }
    const now = this.now();
    const updated: FileRecord = { ...file, revision: file.revision + 1, size: bytes.byteLength, updatedAt: now };
    await writeAll(tx, () => [
      tx.objectStore("files").put(updated),
      tx.objectStore("revisions").add({ fileId: id, revision: updated.revision, size: bytes.byteLength, createdAt: now, note }),
      tx.objectStore("blobs").add({ fileId: id, revision: updated.revision, bytes }),
    ]);
    this.notify({ type: "files-changed" });
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(["files", "revisions", "blobs", "drafts"], "readwrite");
    const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
    await writeAll(tx, () => [
      tx.objectStore("files").delete(id),
      tx.objectStore("revisions").delete(range),
      tx.objectStore("blobs").delete(range),
      tx.objectStore("drafts").delete(id),
    ]);
    this.notify({ type: "files-changed" });
    this.notify({ type: "drafts-changed" });
  }

  async putDraft(draft: Omit<DraftRecord, "updatedAt">): Promise<void> {
    await (await this.dbPromise).put("drafts", { ...draft, updatedAt: this.now() });
    this.notify({ type: "drafts-changed" });
  }

  async getDraft(fileId: string): Promise<DraftRecord | undefined> {
    return (await this.dbPromise).get("drafts", fileId);
  }

  async listDrafts(): Promise<DraftRecord[]> {
    return (await this.dbPromise).getAll("drafts");
  }

  async deleteDraft(fileId: string): Promise<void> {
    await (await this.dbPromise).delete("drafts", fileId);
    this.notify({ type: "drafts-changed" });
  }
}
