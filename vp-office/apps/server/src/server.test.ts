import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { connect, type Database } from "./db";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
// A throwaway database, dropped after the run.
const dbName = `octogenie_office_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let db: Database;
let app: FastifyInstance;

beforeAll(async () => {
  db = await connect(uri, dbName);
  app = await buildApp({ db, secureCookies: false, sessionTtlDays: 1, authRateLimit: 1000 });
});

afterAll(async () => {
  await app?.close();
  if (db && db.db.databaseName.startsWith("octogenie_office_test_")) await db.db.dropDatabase();
  await db?.close();
});

const H = { "x-octo-client": "web" };
const text = (s: string) => Buffer.from(s);

async function register(email: string) {
  const res = await app.inject({ method: "POST", url: "/api/auth/register", headers: H, payload: { email, password: "correct horse battery", name: "Tester" } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === "octo_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  return `octo_session=${cookie.value}`;
}

async function upload(cookie: string, name: string, body: Buffer) {
  return app.inject({ method: "POST", url: `/api/files?name=${encodeURIComponent(name)}`, headers: { ...H, cookie, "content-type": "application/octet-stream" }, payload: body });
}

describe("accounts and sessions", () => {
  it("registers, signs out and signs back in", async () => {
    const cookie = await register("alice@example.com");
    expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } })).json().user.email).toBe("alice@example.com");
    expect((await app.inject({ method: "POST", url: "/api/auth/logout", headers: { ...H, cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } })).statusCode).toBe(401);
    const bad = await app.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { email: "alice@example.com", password: "wrong password!" } });
    expect(bad.statusCode).toBe(401);
    const good = await app.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { email: "ALICE@example.com", password: "correct horse battery" } });
    expect(good.statusCode).toBe(200);
  });

  it("rejects weak passwords, bad emails and duplicate accounts", async () => {
    await register("dup@example.com");
    expect((await app.inject({ method: "POST", url: "/api/auth/register", headers: H, payload: { email: "dup@example.com", password: "correct horse battery" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/auth/register", headers: H, payload: { email: "x@example.com", password: "short" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/auth/register", headers: H, payload: { email: "not-an-email", password: "correct horse battery" } })).statusCode).toBe(400);
  });

  it("stores only password hashes and session token hashes", async () => {
    const cookie = await register("hash@example.com");
    const user = await db.users.findOne({ email: "hash@example.com" });
    expect(user!.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(user)).not.toContain("correct horse battery");
    const token = cookie.split("=")[1]!;
    expect(await db.sessions.findOne({ _id: token })).toBeNull();
  });

  it("requires a session for file routes", async () => {
    expect((await app.inject({ method: "GET", url: "/api/files" })).statusCode).toBe(401);
  });

  it("blocks cross-site style requests without the client header", async () => {
    const cookie = await register("csrf@example.com");
    const res = await app.inject({ method: "POST", url: "/api/files?name=a.txt", headers: { cookie, "content-type": "application/octet-stream" }, payload: text("x") });
    expect(res.statusCode).toBe(403);
  });
});

describe("files", () => {
  it("creates, lists, renames, duplicates and deletes", async () => {
    const cookie = await register("files@example.com");
    const created = await upload(cookie, "Brief.txt", text("hello"));
    expect(created.statusCode).toBe(201);
    const file = created.json().file;
    expect(file).toMatchObject({ name: "Brief.txt", format: "txt", kind: "document", size: 5, revision: 1 });

    const renamed = await app.inject({ method: "PATCH", url: `/api/files/${file.id}`, headers: { ...H, cookie }, payload: { name: "Final.pdf" } });
    expect(renamed.json().file.name).toBe("Final.pdf.txt");

    const copy = (await app.inject({ method: "POST", url: `/api/files/${file.id}/duplicate`, headers: { ...H, cookie } })).json().file;
    expect(copy.name).toBe("Final.pdf (copy).txt");
    const content = await app.inject({ method: "GET", url: `/api/files/${copy.id}/content`, headers: { cookie } });
    expect(content.body).toBe("hello");

    const list = (await app.inject({ method: "GET", url: "/api/files", headers: { cookie } })).json().files;
    expect(list.map((f: { id: string }) => f.id)).toEqual([copy.id, file.id]);

    expect((await app.inject({ method: "DELETE", url: `/api/files/${file.id}`, headers: { ...H, cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/files/${file.id}`, headers: { cookie } })).statusCode).toBe(404);
  });

  it("validates uploads on the server", async () => {
    const cookie = await register("validate@example.com");
    expect((await upload(cookie, "fake.docx", text("not a zip"))).statusCode).toBe(415);
    expect((await upload(cookie, "tool.exe", text("MZ"))).statusCode).toBe(415);
    expect((await upload(cookie, "doc.pdf", text("%PDF-1.7\n%%EOF"))).statusCode).toBe(201);
  });

  it("keeps revisions and rejects stale saves", async () => {
    const cookie = await register("rev@example.com");
    const file = (await upload(cookie, "Note.txt", text("one"))).json().file;
    const put = (base: number, body: string) =>
      app.inject({ method: "PUT", url: `/api/files/${file.id}/content?baseRevision=${base}`, headers: { ...H, cookie, "content-type": "application/octet-stream" }, payload: text(body) });
    expect((await put(1, "two")).json().file.revision).toBe(2);
    const stale = await put(1, "other tab");
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ expectedRevision: 1, actualRevision: 2 });
    expect((await app.inject({ method: "GET", url: `/api/files/${file.id}/content`, headers: { cookie } })).body).toBe("two");
    expect((await app.inject({ method: "GET", url: `/api/files/${file.id}/content?revision=1`, headers: { cookie } })).body).toBe("one");
    const revs = (await app.inject({ method: "GET", url: `/api/files/${file.id}/revisions`, headers: { cookie } })).json().revisions;
    expect(revs.map((r: { revision: number }) => r.revision)).toEqual([2, 1]);
    // The rejected save left no orphaned content behind.
    expect(await db.db.collection("blobs.files").countDocuments({ "metadata.fileId": file.id })).toBe(2);
  });

  it("stores and replaces drafts", async () => {
    const cookie = await register("draft@example.com");
    const file = (await upload(cookie, "D.txt", text("saved"))).json().file;
    const putDraft = (body: string) =>
      app.inject({ method: "PUT", url: `/api/drafts/${file.id}?baseRevision=1`, headers: { ...H, cookie, "content-type": "application/octet-stream" }, payload: text(body) });
    expect((await putDraft("d1")).statusCode).toBe(204);
    expect((await putDraft("d2")).statusCode).toBe(204);
    const drafts = (await app.inject({ method: "GET", url: "/api/drafts", headers: { cookie } })).json().drafts;
    expect(drafts).toEqual([expect.objectContaining({ fileId: file.id, baseRevision: 1 })]);
    const draft = await app.inject({ method: "GET", url: `/api/drafts/${file.id}`, headers: { cookie } });
    expect(draft.body).toBe("d2");
    expect(draft.headers["x-base-revision"]).toBe("1");
    expect((await app.inject({ method: "DELETE", url: `/api/drafts/${file.id}`, headers: { ...H, cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/drafts/${file.id}`, headers: { cookie } })).statusCode).toBe(404);
  });

  it("deletes file contents from GridFS with the file", async () => {
    const cookie = await register("purge@example.com");
    const file = (await upload(cookie, "Secret.txt", text("privileged"))).json().file;
    await app.inject({ method: "PUT", url: `/api/drafts/${file.id}?baseRevision=1`, headers: { ...H, cookie, "content-type": "application/octet-stream" }, payload: text("draft") });
    await app.inject({ method: "DELETE", url: `/api/files/${file.id}`, headers: { ...H, cookie } });
    expect(await db.db.collection("blobs.files").countDocuments({ "metadata.fileId": file.id })).toBe(0);
    expect(await db.revisions.countDocuments({ fileId: file.id })).toBe(0);
  });

  it("records audit events without document contents", async () => {
    const cookie = await register("audit@example.com");
    const file = (await upload(cookie, "Confidential settlement.txt", text("top secret terms"))).json().file;
    const events = await db.audit.find({ fileId: file.id }).toArray();
    expect(events.map((e) => e.action)).toContain("file.created");
    const raw = JSON.stringify(events);
    expect(raw).not.toContain("top secret");
    expect(raw).not.toContain("Confidential settlement");
  });
});

describe("rate limiting", () => {
  it("limits repeated sign-in attempts", async () => {
    const limited = await buildApp({ db, secureCookies: false, sessionTtlDays: 1, authRateLimit: 3 });
    const attempt = () => limited.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { email: "nobody@example.com", password: "whatever-it-is" } });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await attempt()).statusCode);
    expect(codes).toEqual([401, 401, 401, 429]);
    await limited.close();
  });
});

describe("cross-user isolation", () => {
  it("never lets one user read, change or delete another user's files", async () => {
    const alice = await register("iso-alice@example.com");
    const bob = await register("iso-bob@example.com");
    const file = (await upload(alice, "Alice.txt", text("alice only"))).json().file;
    const as = (cookie: string, method: "GET" | "PATCH" | "PUT" | "DELETE" | "POST", url: string, payload?: unknown) =>
      app.inject({ method, url, headers: { ...H, cookie, ...(payload instanceof Buffer ? { "content-type": "application/octet-stream" } : {}) }, ...(payload !== undefined ? { payload: payload as never } : {}) });
    expect((await as(bob, "GET", `/api/files/${file.id}`)).statusCode).toBe(404);
    expect((await as(bob, "GET", `/api/files/${file.id}/content`)).statusCode).toBe(404);
    expect((await as(bob, "GET", `/api/files/${file.id}/revisions`)).statusCode).toBe(404);
    expect((await as(bob, "PATCH", `/api/files/${file.id}`, { name: "x" })).statusCode).toBe(404);
    expect((await as(bob, "PUT", `/api/files/${file.id}/content?baseRevision=1`, text("bob"))).statusCode).toBe(404);
    expect((await as(bob, "POST", `/api/files/${file.id}/duplicate`)).statusCode).toBe(404);
    expect((await as(bob, "PUT", `/api/drafts/${file.id}?baseRevision=1`, text("bob"))).statusCode).toBe(404);
    expect((await as(bob, "DELETE", `/api/files/${file.id}`)).statusCode).toBe(404);
    expect((await as(bob, "GET", "/api/files")).json().files).toEqual([]);
    expect((await as(alice, "GET", `/api/files/${file.id}/content`)).body).toBe("alice only");
  });
});

const BIN = { "content-type": "application/octet-stream" };
const PDF = Buffer.from("%PDF-1.7\n%%EOF");

describe("derived files", () => {
  it("hides generated copies from lists and deletes them with their source", async () => {
    const cookie = await register("derived@example.com");
    const up = (name: string, q = "", as = cookie) =>
      app.inject({ method: "POST", url: `/api/files?name=${encodeURIComponent(name)}${q}`, headers: { ...H, ...BIN, cookie: as }, payload: name.endsWith(".pdf") ? PDF : Buffer.from("hello") });
    const source = (await up("Memo.txt")).json().file;
    const copy = await up("Memo.pdf", `&derivedFrom=${source.id}&derivedKind=converted&derivedRevision=1`);
    expect(copy.statusCode).toBe(201);
    expect(copy.json().file).toMatchObject({ derivedFrom: source.id, derivedKind: "converted", derivedRevision: 1 });
    const list = (await app.inject({ method: "GET", url: "/api/files", headers: { cookie } })).json().files;
    expect(list.map((f: { id: string }) => f.id)).toEqual([source.id]);
    const derived = (await app.inject({ method: "GET", url: `/api/files/${source.id}/derived`, headers: { cookie } })).json().files;
    expect(derived.map((f: { id: string }) => f.id)).toEqual([copy.json().file.id]);
    // A copy can't be attached to someone else's file.
    const other = await register("derived-other@example.com");
    expect((await up("x.pdf", `&derivedFrom=${source.id}&derivedKind=ocr`, other)).statusCode).toBe(404);
    await app.inject({ method: "DELETE", url: `/api/files/${source.id}`, headers: { ...H, cookie } });
    expect(await db.files.countDocuments({ derivedFrom: source.id })).toBe(0);
    expect(await db.db.collection("blobs.files").countDocuments({ "metadata.fileId": copy.json().file.id })).toBe(0);
  });
});
