import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { baseName, extensionOf, FORMATS, makeFileName, MAX_UPLOAD_BYTES, validateUpload, type FileFormat } from "@octo/core";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createSession, deleteSession, EMAIL, hashPassword, newUserId, publicUser, requireUser, SESSION_COOKIE, verifyPassword } from "./auth";
import { deleteBlob, getBlob, putBlob, type Database, type FileDoc } from "./db";

export interface AppOptions {
  db: Database;
  /** Secure cookies (HTTPS). Off for local development only. */
  secureCookies: boolean;
  sessionTtlDays: number;
  /** Sign-in/registration attempts allowed per IP per minute (default 10). */
  authRateLimit?: number;
  /** Built web app to serve (single origin in production). */
  staticDir?: string;
  logger?: boolean;
}

export type Event =
  | { type: "files-changed" }
  | { type: "drafts-changed" }
  | { type: "file-saved"; fileId: string; revision: number };

/** In-process fan-out of change events per user (one server instance). */
export class Events {
  private listeners = new Map<string, Set<(e: Event) => void>>();
  subscribe(userId: string, fn: (e: Event) => void) {
    const set = this.listeners.get(userId) ?? new Set();
    set.add(fn);
    this.listeners.set(userId, set);
    return () => set.delete(fn);
  }
  emit(userId: string, e: Event) {
    for (const fn of this.listeners.get(userId) ?? []) fn(e);
  }
}

const toRecord = (f: FileDoc) => ({
  id: f._id,
  name: f.name,
  kind: f.kind,
  format: f.format,
  size: f.size,
  revision: f.revision,
  createdAt: f.createdAt.getTime(),
  updatedAt: f.updatedAt.getTime(),
  ...(f.templateId ? { templateId: f.templateId } : {}),
  ...(f.derivedFrom ? { derivedFrom: f.derivedFrom, derivedRevision: f.derivedRevision ?? 0, derivedKind: f.derivedKind ?? "" } : {}),
});

/** Records an audit event. Never pass document text or file names in `detail`. */
export type Audit = (request: FastifyRequest, action: string, fileId?: string, detail?: Record<string, string | number | boolean>) => Promise<unknown>;

type Derived = Pick<FileDoc, "derivedFrom" | "derivedRevision" | "derivedKind">;

const asBytes = (body: unknown): Uint8Array | null => (Buffer.isBuffer(body) ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength) : null);

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db } = opts;
  const app = Fastify({
    logger: opts.logger ? { level: "info", redact: ["req.headers.cookie", "res.headers['set-cookie']"] } : false,
    bodyLimit: MAX_UPLOAD_BYTES + 1024 * 1024,
    trustProxy: true,
  });
  const events = new Events();
  const auth = requireUser(db);

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_UPLOAD_BYTES + 1024 }, (_req, body, done) => done(null, body));

  // Mutating requests must come from our own page: a custom header can't be
  // sent cross-site without CORS, which this server never grants.
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers["x-octo-client"] !== "web") {
      return reply.code(403).send({ error: "Missing client header." });
    }
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    return payload;
  });

  const audit: Audit = (request, action, fileId, detail) =>
    db.audit.insertOne({ at: new Date(), userId: request.user?._id ?? null, action, ...(fileId ? { fileId } : {}), ip: request.ip, ...(detail ? { detail } : {}) }).catch(() => undefined);

  const setSession = (reply: FastifyReply, token: string, expiresAt: Date) =>
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: opts.secureCookies, path: "/", expires: expiresAt });

  // ---- Auth ----------------------------------------------------------------
  const authLimit = { config: { rateLimit: { max: opts.authRateLimit ?? 10, timeWindow: "1 minute" } } };

  app.post<{ Body: { email?: string; password?: string; name?: string } }>("/api/auth/register", authLimit, async (request, reply) => {
    const email = String(request.body?.email ?? "").trim().toLowerCase();
    const password = String(request.body?.password ?? "");
    const name = String(request.body?.name ?? "").trim().slice(0, 100) || email.split("@")[0]!;
    if (!EMAIL.test(email)) return reply.code(400).send({ error: "Enter a valid email address." });
    if (password.length < 10 || password.length > 200) return reply.code(400).send({ error: "Passwords must be 10 to 200 characters." });
    if (await db.users.findOne({ email })) return reply.code(409).send({ error: "An account with this email already exists." });
    const user = { _id: newUserId(), email, name, passwordHash: await hashPassword(password), createdAt: new Date() };
    try {
      await db.users.insertOne(user);
    } catch {
      return reply.code(409).send({ error: "An account with this email already exists." });
    }
    const { token, expiresAt } = await createSession(db, user._id, opts.sessionTtlDays);
    setSession(reply, token, expiresAt);
    request.user = user;
    void audit(request, "user.registered");
    return { user: publicUser(user) };
  });

  app.post<{ Body: { email?: string; password?: string } }>("/api/auth/login", authLimit, async (request, reply) => {
    const email = String(request.body?.email ?? "").trim().toLowerCase();
    const user = await db.users.findOne({ email });
    // Verify even for unknown users so timing doesn't reveal which emails exist.
    const ok = await verifyPassword(String(request.body?.password ?? ""), user?.passwordHash ?? "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    if (!user || !ok) {
      void audit(request, "user.login_failed");
      return reply.code(401).send({ error: "Email or password is incorrect." });
    }
    const { token, expiresAt } = await createSession(db, user._id, opts.sessionTtlDays);
    setSession(reply, token, expiresAt);
    request.user = user;
    void audit(request, "user.login");
    return { user: publicUser(user) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await deleteSession(db, request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: auth }, async (request) => ({ user: publicUser(request.user!) }));

  // ---- Files ---------------------------------------------------------------
  /** Loads a file only if the caller owns it; otherwise 404 (no existence leak). */
  const ownedFile = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const file = await db.files.findOne({ _id: request.params.id, ownerId: request.user!._id });
    if (!file) {
      void reply.code(404).send({ error: "File not found." });
      return null;
    }
    return file;
  };

  const createFile = async (ownerId: string, name: string, format: FileFormat, bytes: Uint8Array, note: string, templateId?: string, derived?: Derived) => {
    const now = new Date();
    const id = randomUUID();
    const blobId = await putBlob(db, bytes, { fileId: id, ownerId, revision: 1 });
    const file: FileDoc = { _id: id, ownerId, name: makeFileName(baseName(name), format), kind: FORMATS[format].kind, format, size: bytes.byteLength, revision: 1, createdAt: now, updatedAt: now, ...(templateId ? { templateId } : {}), ...derived };
    await db.files.insertOne(file);
    await db.revisions.insertOne({ fileId: id, ownerId, revision: 1, size: bytes.byteLength, note, blobId, authorId: ownerId, createdAt: now });
    events.emit(ownerId, { type: "files-changed" });
    return file;
  };

  app.get("/api/files", { preHandler: auth }, async (request) => {
    // Generated copies (OCR, converted renditions) belong to their source file and aren't listed.
    const files = await db.files.find({ ownerId: request.user!._id, derivedFrom: { $exists: false } }).sort({ updatedAt: -1 }).toArray();
    return { files: files.map(toRecord) };
  });

  app.get<{ Params: { id: string } }>("/api/files/:id/derived", { preHandler: auth }, async (request, reply) => {
    const file = await ownedFile(request, reply);
    if (!file) return reply;
    const derived = await db.files.find({ ownerId: file.ownerId, derivedFrom: file._id }).sort({ updatedAt: -1 }).toArray();
    return { files: derived.map(toRecord) };
  });

  app.get<{ Params: { id: string } }>("/api/files/:id", { preHandler: auth }, async (request, reply) => {
    const file = await ownedFile(request, reply);
    return file ? { file: toRecord(file) } : reply;
  });

  app.post<{ Querystring: { name?: string; format?: string; templateId?: string; derivedFrom?: string; derivedRevision?: string; derivedKind?: string } }>("/api/files", { preHandler: auth }, async (request, reply) => {
    const bytes = asBytes(request.body);
    const name = String(request.query.name ?? "");
    if (!bytes || !name) return reply.code(400).send({ error: "A file name and content are required." });
    // Every upload is validated server-side, whatever the browser checked.
    const result = validateUpload(name, bytes);
    if (!result.ok) return reply.code(415).send({ error: result.reason });
    const templateId = request.query.templateId && /^[a-z0-9-]{1,40}$/.test(request.query.templateId) ? request.query.templateId : undefined;
    let derived: Derived | undefined;
    if (request.query.derivedFrom) {
      // A generated copy can only be attached to a file the caller owns.
      const source = await db.files.findOne({ _id: request.query.derivedFrom, ownerId: request.user!._id, derivedFrom: { $exists: false } });
      if (!source) return reply.code(404).send({ error: "File not found." });
      const kind = String(request.query.derivedKind ?? "");
      if (!/^[a-z-]{1,20}$/.test(kind)) return reply.code(400).send({ error: "Invalid derived kind." });
      const rev = Number(request.query.derivedRevision);
      derived = { derivedFrom: source._id, derivedRevision: Number.isInteger(rev) && rev > 0 ? rev : source.revision, derivedKind: kind };
    }
    const file = await createFile(request.user!._id, name, result.format, bytes, "Created", templateId, derived);
    void audit(request, "file.created", file._id, { format: file.format, size: file.size });
    return reply.code(201).send({ file: toRecord(file) });
  });

  app.patch<{ Params: { id: string }; Body: { name?: string } }>("/api/files/:id", { preHandler: auth }, async (request, reply) => {
    const file = await ownedFile(request, reply);
    if (!file) return reply;
    const name = makeFileName(String(request.body?.name ?? ""), file.format);
    const updated = await db.files.findOneAndUpdate({ _id: file._id, ownerId: file.ownerId }, { $set: { name, updatedAt: new Date() } }, { returnDocument: "after" });
    events.emit(file.ownerId, { type: "files-changed" });
    void audit(request, "file.renamed", file._id);
    return { file: toRecord(updated!) };
  });

  app.post<{ Params: { id: string } }>("/api/files/:id/duplicate", { preHandler: auth }, async (request, reply) => {
    const file = await ownedFile(request, reply);
    if (!file) return reply;
    const rev = await db.revisions.findOne({ fileId: file._id, revision: file.revision });
    if (!rev) return reply.code(500).send({ error: "The file's content is missing." });
    const bytes = new Uint8Array(await getBlob(db, rev.blobId));
    const taken = new Set((await db.files.find({ ownerId: file.ownerId }, { projection: { name: 1 } }).toArray()).map((f) => f.name.toLowerCase()));
    const stem = baseName(file.name).replace(/ \(copy(?: \d+)?\)$/, "");
    const ext = extensionOf(file.name);
    let candidate = `${stem} (copy)`;
    for (let n = 2; taken.has(`${candidate}.${ext}`.toLowerCase()); n++) candidate = `${stem} (copy ${n})`;
    const copy = await createFile(file.ownerId, `${candidate}.${ext}`, file.format, bytes, "Created", file.templateId);
    void audit(request, "file.duplicated", copy._id, { from: file._id });
    return reply.code(201).send({ file: toRecord(copy) });
  });

  app.get<{ Params: { id: string }; Querystring: { revision?: string } }>("/api/files/:id/content", { preHandler: auth }, async (request, reply) => {
    const file = await ownedFile(request, reply);
    if (!file) return reply;
    const revision = request.query.revision ? Number(request.query.revision) : file.revision;
    const rev = await db.revisions.findOne({ fileId: file._id, revision });
    if (!rev) return reply.code(404).send({ error: "Revision not found." });
    const bytes = await getBlob(db, rev.blobId);
    void audit(request, "file.downloaded", file._id, { revision });
    return reply.header("Content-Type", "application/octet-stream").header("Cache-Control", "private, no-store").send(bytes);
  });

  app.get<{ Params: { id: string } }>("/api/files/:id/revisions", { preHandler: auth }, async (request, reply) => {
    const file = await ownedFile(request, reply);
    if (!file) return reply;
    const revs = await db.revisions.find({ fileId: file._id }).sort({ revision: -1 }).toArray();
    return { revisions: revs.map((r) => ({ fileId: r.fileId, revision: r.revision, size: r.size, createdAt: r.createdAt.getTime(), note: r.note })) };
  });

  app.put<{ Params: { id: string }; Querystring: { baseRevision?: string; note?: string } }>("/api/files/:id/content", { preHandler: auth }, async (request, reply) => {
    const file = await ownedFile(request, reply);
    if (!file) return reply;
    const bytes = asBytes(request.body);
    const base = Number(request.query.baseRevision);
    if (!bytes || !Number.isInteger(base)) return reply.code(400).send({ error: "Content and baseRevision are required." });
    const check = validateUpload(file.name, bytes);
    if (!check.ok) return reply.code(415).send({ error: check.reason });
    const note = String(request.query.note ?? "Saved").slice(0, 120);
    // Content first, then an atomic compare-and-set on the revision number:
    // a stale save matches nothing and is rejected instead of overwriting.
    const blobId = await putBlob(db, bytes, { fileId: file._id, ownerId: file.ownerId, revision: base + 1 });
    const now = new Date();
    const updated = await db.files.findOneAndUpdate(
      { _id: file._id, ownerId: file.ownerId, revision: base },
      { $inc: { revision: 1 }, $set: { size: bytes.byteLength, updatedAt: now } },
      { returnDocument: "after" },
    );
    if (!updated) {
      await deleteBlob(db, blobId);
      const current = await db.files.findOne({ _id: file._id });
      return reply.code(409).send({ error: "The file was changed elsewhere.", expectedRevision: base, actualRevision: current?.revision ?? null });
    }
    await db.revisions.insertOne({ fileId: file._id, ownerId: file.ownerId, revision: updated.revision, size: bytes.byteLength, note, blobId, authorId: request.user!._id, createdAt: now });
    events.emit(file.ownerId, { type: "files-changed" });
    // Open copies of this file on other devices or tabs can pick up the new revision.
    events.emit(file.ownerId, { type: "file-saved", fileId: file._id, revision: updated.revision });
    void audit(request, "file.saved", file._id, { revision: updated.revision, size: bytes.byteLength });
    return { file: toRecord(updated) };
  });

  app.delete<{ Params: { id: string } }>("/api/files/:id", { preHandler: auth }, async (request, reply) => {
    const file = await ownedFile(request, reply);
    if (!file) return reply;
    // Generated copies (OCR, conversions) go with their source.
    const ids = [file._id, ...(await db.files.find({ ownerId: file.ownerId, derivedFrom: file._id }, { projection: { _id: 1 } }).toArray()).map((f) => f._id)];
    const revs = await db.revisions.find({ fileId: { $in: ids } }).toArray();
    const drafts = await db.drafts.find({ fileId: { $in: ids } }).toArray();
    await db.files.deleteMany({ _id: { $in: ids }, ownerId: file.ownerId });
    await db.revisions.deleteMany({ fileId: { $in: ids } });
    await db.drafts.deleteMany({ fileId: { $in: ids } });
    // Contents are deleted too; nothing of the document remains in the database.
    await Promise.all([...revs.map((r) => deleteBlob(db, r.blobId)), ...drafts.map((d) => deleteBlob(db, d.blobId))]);
    events.emit(file.ownerId, { type: "files-changed" });
    events.emit(file.ownerId, { type: "drafts-changed" });
    void audit(request, "file.deleted", file._id);
    return reply.code(204).send();
  });

  // ---- Drafts --------------------------------------------------------------
  app.get("/api/drafts", { preHandler: auth }, async (request) => {
    const drafts = await db.drafts.find({ ownerId: request.user!._id }).toArray();
    return { drafts: drafts.map((d) => ({ fileId: d.fileId, baseRevision: d.baseRevision, updatedAt: d.updatedAt.getTime() })) };
  });

  app.get<{ Params: { id: string } }>("/api/drafts/:id", { preHandler: auth }, async (request, reply) => {
    const draft = await db.drafts.findOne({ fileId: request.params.id, ownerId: request.user!._id });
    if (!draft) return reply.code(404).send({ error: "No draft." });
    return reply
      .header("Content-Type", "application/octet-stream")
      .header("X-Base-Revision", String(draft.baseRevision))
      .header("X-Updated-At", String(draft.updatedAt.getTime()))
      .header("Cache-Control", "private, no-store")
      .send(await getBlob(db, draft.blobId));
  });

  app.put<{ Params: { id: string }; Querystring: { baseRevision?: string } }>("/api/drafts/:id", { preHandler: auth }, async (request, reply) => {
    const file = await ownedFile(request, reply);
    if (!file) return reply;
    const bytes = asBytes(request.body);
    const base = Number(request.query.baseRevision);
    if (!bytes || !Number.isInteger(base)) return reply.code(400).send({ error: "Content and baseRevision are required." });
    const blobId = await putBlob(db, bytes, { fileId: file._id, ownerId: file.ownerId, draft: true });
    const previous = await db.drafts.findOneAndUpdate(
      { fileId: file._id, ownerId: file.ownerId },
      { $set: { baseRevision: base, blobId, updatedAt: new Date() } },
      { upsert: true, returnDocument: "before" },
    );
    if (previous) await deleteBlob(db, previous.blobId);
    events.emit(file.ownerId, { type: "drafts-changed" });
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>("/api/drafts/:id", { preHandler: auth }, async (request, reply) => {
    const draft = await db.drafts.findOneAndDelete({ fileId: request.params.id, ownerId: request.user!._id });
    if (draft) {
      await deleteBlob(db, draft.blobId);
      events.emit(request.user!._id, { type: "drafts-changed" });
    }
    return reply.code(204).send();
  });

  // ---- Live updates (server-sent events) -----------------------------------
  app.get("/api/events", { preHandler: auth }, (request, reply) => {
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    reply.raw.write(": connected\n\n");
    const unsubscribe = events.subscribe(request.user!._id, (e) => reply.raw.write(`data: ${JSON.stringify(e)}\n\n`));
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
    request.raw.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
    reply.hijack();
  });

  app.get("/api/health", async () => {
    await db.db.command({ ping: 1 });
    return { ok: true };
  });

  // ---- Web app -------------------------------------------------------------
  if (opts.staticDir && existsSync(opts.staticDir)) {
    await app.register(fastifyStatic, { root: opts.staticDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found." });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
