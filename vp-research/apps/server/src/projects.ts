import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { randomUUID } from "node:crypto";
import type { Audit, Events } from "./app";
import { deleteBlob, getBlob, putBlob, type Database, type ProjectDoc, type UserDoc } from "./db";

/** Largest workspace JSON accepted (cards, connectors, annotations; never source files). */
export const MAX_WORKSPACE_BYTES = 10 * 1024 * 1024;
/** Workspace revisions kept per project; older ones are pruned. */
const KEEP_REVISIONS = 100;

const FIELDS = { name: 200, caseName: 300, reference: 120, court: 200, jurisdiction: 120, description: 4000 } as const;
type Field = keyof typeof FIELDS;

export const orgOf = (user: UserDoc) => user.orgId ?? `personal:${user._id}`;

const toRecord = (p: ProjectDoc) => ({
  id: p._id,
  name: p.name,
  caseName: p.caseName,
  reference: p.reference,
  court: p.court,
  jurisdiction: p.jurisdiction,
  description: p.description,
  archived: p.archived,
  revision: p.revision,
  size: p.size,
  createdAt: p.createdAt.getTime(),
  updatedAt: p.updatedAt.getTime(),
});

/** Trims and length-limits the editable text fields that are present in `body`. */
function readFields(body: Record<string, unknown> | undefined): Partial<Record<Field, string>> | string {
  const out: Partial<Record<Field, string>> = {};
  for (const key of Object.keys(FIELDS) as Field[]) {
    const value = body?.[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return `${key} must be text.`;
    const trimmed = value.trim();
    if (trimmed.length > FIELDS[key]) return `${key} is too long (at most ${FIELDS[key]} characters).`;
    out[key] = trimmed;
  }
  return out;
}

/**
 * Checks that bytes are a research workspace: JSON of the expected kind and
 * version with the required collections. Contents are not otherwise interpreted.
 */
export function validateWorkspace(bytes: Uint8Array): string | null {
  if (bytes.byteLength > MAX_WORKSPACE_BYTES) return "The workspace is too large.";
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return "The workspace is not valid JSON.";
  }
  const w = data as Record<string, unknown>;
  if (!w || typeof w !== "object" || w.kind !== "octogenie-research" || w.version !== 1) return "Not a research workspace.";
  for (const key of ["documents", "cards", "connectors", "annotations"]) if (!Array.isArray(w[key])) return `The workspace is missing ${key}.`;
  if (!w.sources || typeof w.sources !== "object" || Array.isArray(w.sources)) return "The workspace is missing sources.";
  return null;
}

export function emptyWorkspaceBytes(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({ kind: "octogenie-research", version: 1, documents: [], sources: {}, cards: [], connectors: [], annotations: [], ink: [], tags: [], view: { x: 0, y: 0, zoom: 1 } }),
  );
}

interface Context {
  db: Database;
  auth: preHandlerAsyncHookHandler;
  events: Events;
  audit: Audit;
}

type IdRequest = FastifyRequest<{ Params: { id: string } }>;

const asBytes = (body: unknown): Uint8Array | null => (Buffer.isBuffer(body) ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength) : null);

export async function registerProjectRoutes(app: FastifyInstance, { db, auth, events, audit }: Context) {
  const writeLimit = { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } };

  /** The caller's project, scoped to their organization; 404 otherwise (no existence leak). */
  const owned = async (request: IdRequest, reply: FastifyReply) => {
    const user = request.user!;
    const project = await db.projects.findOne({ _id: request.params.id, ownerId: user._id, orgId: orgOf(user) });
    if (!project) {
      void reply.code(404).send({ error: "Project not found." });
      return null;
    }
    return project;
  };

  const create = async (user: UserDoc, fields: Partial<Record<Field, string>>, bytes: Uint8Array, note: string) => {
    const now = new Date();
    const id = randomUUID();
    const blobId = await putBlob(db, bytes, { projectId: id, ownerId: user._id, revision: 1 });
    const project: ProjectDoc = {
      _id: id,
      ownerId: user._id,
      orgId: orgOf(user),
      name: fields.name || fields.caseName || "Untitled project",
      caseName: fields.caseName ?? "",
      reference: fields.reference ?? "",
      court: fields.court ?? "",
      jurisdiction: fields.jurisdiction ?? "",
      description: fields.description ?? "",
      archived: false,
      revision: 1,
      size: bytes.byteLength,
      createdAt: now,
      updatedAt: now,
    };
    await db.projects.insertOne(project);
    await db.projectRevisions.insertOne({ projectId: id, ownerId: user._id, revision: 1, size: bytes.byteLength, note, blobId, createdAt: now });
    events.emit(user._id, { type: "projects-changed" });
    return project;
  };

  app.get<{ Querystring: { archived?: string } }>("/api/projects", { preHandler: auth }, async (request) => {
    const user = request.user!;
    const filter = { ownerId: user._id, orgId: orgOf(user), ...(request.query.archived === "all" ? {} : { archived: request.query.archived === "1" }) };
    const projects = await db.projects.find(filter).sort({ updatedAt: -1 }).limit(1000).toArray();
    return { projects: projects.map(toRecord) };
  });

  app.post<{ Body: Record<string, unknown> }>("/api/projects", { preHandler: auth, ...writeLimit }, async (request, reply) => {
    const fields = readFields(request.body);
    if (typeof fields === "string") return reply.code(400).send({ error: fields });
    const project = await create(request.user!, fields, emptyWorkspaceBytes(), "Created");
    void audit(request, "project.created", undefined, undefined, project._id);
    return reply.code(201).send({ project: toRecord(project) });
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id", { preHandler: auth }, async (request, reply) => {
    const project = await owned(request, reply);
    return project ? { project: toRecord(project) } : reply;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/projects/:id", { preHandler: auth, ...writeLimit }, async (request, reply) => {
    const project = await owned(request, reply);
    if (!project) return reply;
    const fields = readFields(request.body);
    if (typeof fields === "string") return reply.code(400).send({ error: fields });
    if (fields.name === "") return reply.code(400).send({ error: "A project needs a name." });
    const archived = request.body?.archived;
    if (archived !== undefined && typeof archived !== "boolean") return reply.code(400).send({ error: "archived must be true or false." });
    const updated = await db.projects.findOneAndUpdate(
      { _id: project._id, ownerId: project.ownerId },
      { $set: { ...fields, ...(archived !== undefined ? { archived } : {}), updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    events.emit(project.ownerId, { type: "projects-changed" });
    void audit(request, archived === true ? "project.archived" : archived === false ? "project.restored" : "project.updated", undefined, undefined, project._id);
    return { project: toRecord(updated!) };
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/duplicate", { preHandler: auth, ...writeLimit }, async (request, reply) => {
    const project = await owned(request, reply);
    if (!project) return reply;
    const rev = await db.projectRevisions.findOne({ projectId: project._id, revision: project.revision });
    if (!rev) return reply.code(500).send({ error: "The project's workspace is missing." });
    const bytes = new Uint8Array(await getBlob(db, rev.blobId));
    const copy = await create(request.user!, { ...project, name: `${project.name} (copy)`.slice(0, FIELDS.name) }, bytes, "Duplicated");
    void audit(request, "project.duplicated", undefined, { from: project._id }, copy._id);
    return reply.code(201).send({ project: toRecord(copy) });
  });

  app.delete<{ Params: { id: string } }>("/api/projects/:id", { preHandler: auth, ...writeLimit }, async (request, reply) => {
    const project = await owned(request, reply);
    if (!project) return reply;
    const revs = await db.projectRevisions.find({ projectId: project._id }).toArray();
    await db.projects.deleteOne({ _id: project._id, ownerId: project.ownerId });
    await db.projectRevisions.deleteMany({ projectId: project._id });
    await Promise.all(revs.map((r) => deleteBlob(db, r.blobId)));
    events.emit(project.ownerId, { type: "projects-changed" });
    void audit(request, "project.deleted", undefined, undefined, project._id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string }; Querystring: { revision?: string } }>("/api/projects/:id/workspace", { preHandler: auth }, async (request, reply) => {
    const project = await owned(request, reply);
    if (!project) return reply;
    const revision = request.query.revision ? Number(request.query.revision) : project.revision;
    const rev = await db.projectRevisions.findOne({ projectId: project._id, revision });
    if (!rev) return reply.code(404).send({ error: "Revision not found." });
    return reply
      .header("Content-Type", "application/json")
      .header("X-Revision", String(revision))
      .header("Cache-Control", "private, no-store")
      .send(await getBlob(db, rev.blobId));
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/revisions", { preHandler: auth }, async (request, reply) => {
    const project = await owned(request, reply);
    if (!project) return reply;
    const revs = await db.projectRevisions.find({ projectId: project._id }).sort({ revision: -1 }).toArray();
    return { revisions: revs.map((r) => ({ revision: r.revision, size: r.size, note: r.note, createdAt: r.createdAt.getTime() })) };
  });

  app.put<{ Params: { id: string }; Querystring: { baseRevision?: string; note?: string } }>(
    "/api/projects/:id/workspace",
    { preHandler: auth, bodyLimit: MAX_WORKSPACE_BYTES + 1024, ...writeLimit },
    async (request: FastifyRequest<{ Params: { id: string }; Querystring: { baseRevision?: string; note?: string } }>, reply) => {
      const project = await owned(request, reply);
      if (!project) return reply;
      const bytes = asBytes(request.body);
      const base = Number(request.query.baseRevision);
      if (!bytes || !Number.isInteger(base)) return reply.code(400).send({ error: "Content and baseRevision are required." });
      const problem = validateWorkspace(bytes);
      if (problem) return reply.code(415).send({ error: problem });
      const note = String(request.query.note ?? "Saved").slice(0, 120);
      // Compare-and-set on the revision: a stale save is rejected, never merged blindly.
      const blobId = await putBlob(db, bytes, { projectId: project._id, ownerId: project.ownerId, revision: base + 1 });
      const now = new Date();
      const updated = await db.projects.findOneAndUpdate(
        { _id: project._id, ownerId: project.ownerId, revision: base },
        { $inc: { revision: 1 }, $set: { size: bytes.byteLength, updatedAt: now } },
        { returnDocument: "after" },
      );
      if (!updated) {
        await deleteBlob(db, blobId);
        const current = await db.projects.findOne({ _id: project._id });
        return reply.code(409).send({ error: "The project was changed elsewhere.", expectedRevision: base, actualRevision: current?.revision ?? null });
      }
      await db.projectRevisions.insertOne({ projectId: project._id, ownerId: project.ownerId, revision: updated.revision, size: bytes.byteLength, note, blobId, createdAt: now });
      const stale = await db.projectRevisions.find({ projectId: project._id, revision: { $lte: updated.revision - KEEP_REVISIONS } }).toArray();
      if (stale.length) {
        await db.projectRevisions.deleteMany({ projectId: project._id, revision: { $lte: updated.revision - KEEP_REVISIONS } });
        await Promise.all(stale.map((r) => deleteBlob(db, r.blobId)));
      }
      events.emit(project.ownerId, { type: "projects-changed" });
      events.emit(project.ownerId, { type: "project-saved", projectId: project._id, revision: updated.revision });
      void audit(request, "project.saved", undefined, { revision: updated.revision, size: bytes.byteLength }, project._id);
      return { project: toRecord(updated) };
    },
  );
}
