import type { FileFormat, FileKind } from "@octo/core";

export interface FileRecord {
  id: string;
  name: string;
  kind: FileKind;
  format: FileFormat;
  size: number;
  /** Increments on every committed save; used for conflict detection. */
  revision: number;
  createdAt: number;
  updatedAt: number;
  templateId?: string;
}

export interface RevisionRecord {
  fileId: string;
  revision: number;
  size: number;
  createdAt: number;
  note: string;
}

/** Unsaved editor state kept locally so work survives crashes and reloads. */
export interface DraftRecord {
  fileId: string;
  /** The file revision the draft was based on. */
  baseRevision: number;
  content: Uint8Array;
  updatedAt: number;
}

export interface CreateFileInput {
  name: string;
  format: FileFormat;
  bytes: Uint8Array;
  templateId?: string;
}

export class ConflictError extends Error {
  constructor(
    readonly fileId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(`File ${fileId} is at revision ${actualRevision}, not ${expectedRevision}`);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(readonly fileId: string) {
    super(`File ${fileId} was not found`);
    this.name = "NotFoundError";
  }
}

export type RepositoryEvent =
  | { type: "files-changed" }
  | { type: "drafts-changed" }
  /** A file's content was saved (possibly from another device or tab). */
  | { type: "file-saved"; fileId: string; revision: number };

/**
 * Storage boundary for the UI. Milestone 1 implements it on IndexedDB;
 * milestone 7 adds an HTTP implementation backed by the server.
 */
export interface DocumentRepository {
  list(): Promise<FileRecord[]>;
  get(id: string): Promise<FileRecord>;
  getContent(id: string, revision?: number): Promise<Uint8Array>;
  listRevisions(id: string): Promise<RevisionRecord[]>;
  create(input: CreateFileInput): Promise<FileRecord>;
  rename(id: string, baseName: string): Promise<FileRecord>;
  duplicate(id: string): Promise<FileRecord>;
  /** Commits new content. Throws ConflictError if baseRevision is stale. */
  saveContent(id: string, bytes: Uint8Array, baseRevision: number, note?: string): Promise<FileRecord>;
  delete(id: string): Promise<void>;

  putDraft(draft: Omit<DraftRecord, "updatedAt">): Promise<void>;
  getDraft(fileId: string): Promise<DraftRecord | undefined>;
  listDrafts(): Promise<DraftRecord[]>;
  deleteDraft(fileId: string): Promise<void>;

  subscribe(listener: (event: RepositoryEvent) => void): () => void;
}
