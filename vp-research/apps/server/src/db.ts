import type { FileFormat, FileKind } from "@octo/core";
import { GridFSBucket, MongoClient, type Db, type ObjectId } from "mongodb";

export interface UserDoc {
  _id: string;
  email: string;
  name: string;
  passwordHash: string;
  /** Organization the user belongs to; projects never cross organizations. Defaults to a personal one. */
  orgId?: string;
  createdAt: Date;
}

export interface SessionDoc {
  /** SHA-256 of the session token; the token itself is never stored. */
  _id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface FileDoc {
  _id: string;
  ownerId: string;
  name: string;
  kind: FileKind;
  format: FileFormat;
  size: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  templateId?: string;
  /** Set on files generated from another file (a searchable or converted copy); hidden from file lists. */
  derivedFrom?: string;
  /** Revision of the source file this copy was generated from. */
  derivedRevision?: number;
  /** What the copy is, e.g. "ocr" or "converted". */
  derivedKind?: string;
}

/** A research project: case details plus a versioned workspace (JSON in GridFS). */
export interface ProjectDoc {
  _id: string;
  ownerId: string;
  orgId: string;
  name: string;
  caseName: string;
  reference: string;
  court: string;
  jurisdiction: string;
  description: string;
  archived: boolean;
  revision: number;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRevisionDoc {
  projectId: string;
  ownerId: string;
  revision: number;
  size: number;
  note: string;
  blobId: ObjectId;
  createdAt: Date;
}

export interface RevisionDoc {
  fileId: string;
  ownerId: string;
  revision: number;
  size: number;
  note: string;
  blobId: ObjectId;
  authorId: string;
  createdAt: Date;
}

export interface DraftDoc {
  fileId: string;
  ownerId: string;
  baseRevision: number;
  blobId: ObjectId;
  updatedAt: Date;
}

export interface AuditDoc {
  at: Date;
  userId: string | null;
  action: string;
  fileId?: string;
  projectId?: string;
  ip?: string;
  /** Never contains document content or file names. */
  detail?: Record<string, string | number | boolean>;
}

export interface Database {
  client: MongoClient;
  db: Db;
  users: import("mongodb").Collection<UserDoc>;
  sessions: import("mongodb").Collection<SessionDoc>;
  files: import("mongodb").Collection<FileDoc>;
  revisions: import("mongodb").Collection<RevisionDoc>;
  drafts: import("mongodb").Collection<DraftDoc>;
  audit: import("mongodb").Collection<AuditDoc>;
  projects: import("mongodb").Collection<ProjectDoc>;
  projectRevisions: import("mongodb").Collection<ProjectRevisionDoc>;
  /** File contents of every revision and draft. */
  blobs: GridFSBucket;
  close(): Promise<void>;
}

export async function connect(uri: string, dbName: string): Promise<Database> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, appName: "octogenie-research" });
  await client.connect();
  const db = client.db(dbName);
  const database: Database = {
    client,
    db,
    users: db.collection<UserDoc>("users"),
    sessions: db.collection<SessionDoc>("sessions"),
    files: db.collection<FileDoc>("files"),
    revisions: db.collection<RevisionDoc>("revisions"),
    drafts: db.collection<DraftDoc>("drafts"),
    audit: db.collection<AuditDoc>("audit"),
    projects: db.collection<ProjectDoc>("projects"),
    projectRevisions: db.collection<ProjectRevisionDoc>("project_revisions"),
    blobs: new GridFSBucket(db, { bucketName: "blobs" }),
    close: () => client.close(),
  };
  await Promise.all([
    database.users.createIndex({ email: 1 }, { unique: true }),
    // Expired sessions are removed by MongoDB automatically.
    database.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.sessions.createIndex({ userId: 1 }),
    database.files.createIndex({ ownerId: 1, updatedAt: -1 }),
    database.revisions.createIndex({ fileId: 1, revision: -1 }, { unique: true }),
    database.drafts.createIndex({ fileId: 1, ownerId: 1 }, { unique: true }),
    database.audit.createIndex({ userId: 1, at: -1 }),
    database.files.createIndex({ derivedFrom: 1 }, { sparse: true }),
    database.projects.createIndex({ ownerId: 1, orgId: 1, updatedAt: -1 }),
    database.projectRevisions.createIndex({ projectId: 1, revision: -1 }, { unique: true }),
  ]);
  return database;
}

export async function putBlob(db: Database, bytes: Uint8Array, metadata: Record<string, unknown>): Promise<ObjectId> {
  const stream = db.blobs.openUploadStream("blob", { metadata });
  await new Promise<void>((resolve, reject) => {
    stream.once("finish", () => resolve());
    stream.once("error", reject);
    stream.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  });
  return stream.id as ObjectId;
}

export async function getBlob(db: Database, id: ObjectId): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of db.blobs.openDownloadStream(id)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function deleteBlob(db: Database, id: ObjectId): Promise<void> {
  await db.blobs.delete(id).catch(() => undefined);
}
