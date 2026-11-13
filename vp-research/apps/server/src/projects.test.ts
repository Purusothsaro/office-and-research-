import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { connect, type Database } from "./db";
import { emptyWorkspaceBytes } from "./projects";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const dbName = `octogenie_research_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let db: Database;
let app: FastifyInstance;

beforeAll(async () => {
  db = await connect(uri, dbName);
  app = await buildApp({ db, secureCookies: false, sessionTtlDays: 1, authRateLimit: 1000 });
});

afterAll(async () => {
  await app?.close();
  if (db && db.db.databaseName.startsWith("octogenie_research_test_")) await db.db.dropDatabase();
  await db?.close();
});

const H = { "x-octo-client": "web" };
const BIN = { "content-type": "application/octet-stream" };
const PDF = Buffer.from("%PDF-1.7\n%%EOF");

async function register(email: string) {
  const res = await app.inject({ method: "POST", url: "/api/auth/register", headers: H, payload: { email, password: "correct horse battery", name: "Tester" } });
  return `octo_session=${res.cookies.find((c) => c.name === "octo_session")!.value}`;
}

const workspace = (extra: Record<string, unknown> = {}) => {
  const base = JSON.parse(new TextDecoder().decode(emptyWorkspaceBytes())) as Record<string, unknown>;
  return Buffer.from(JSON.stringify({ ...base, ...extra }));
};

describe("research projects", () => {
  it("creates, edits, archives, duplicates and deletes projects", async () => {
    const cookie = await register("proj@example.com");
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...H, cookie },
      payload: { name: "Smith v Jones", caseName: "Smith v. Jones", court: "High Court", jurisdiction: "England & Wales", reference: "HC-2026-001", description: "Breach of contract" },
    });
    expect(created.statusCode).toBe(201);
    const project = created.json().project;
    expect(project).toMatchObject({ name: "Smith v Jones", court: "High Court", archived: false, revision: 1 });

    const ws = await app.inject({ method: "GET", url: `/api/projects/${project.id}/workspace`, headers: { cookie } });
    expect(ws.json()).toMatchObject({ kind: "octogenie-research", version: 1 });
    expect(ws.headers["x-revision"]).toBe("1");

    const renamed = await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, headers: { ...H, cookie }, payload: { name: "Smith (appeal)" } });
    expect(renamed.json().project.name).toBe("Smith (appeal)");
    expect((await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, headers: { ...H, cookie }, payload: { court: "x".repeat(500) } })).statusCode).toBe(400);

    const copy = (await app.inject({ method: "POST", url: `/api/projects/${project.id}/duplicate`, headers: { ...H, cookie } })).json().project;
    expect(copy.name).toBe("Smith (appeal) (copy)");
    expect(copy.caseName).toBe("Smith v. Jones");

    await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, headers: { ...H, cookie }, payload: { archived: true } });
    const active = (await app.inject({ method: "GET", url: "/api/projects", headers: { cookie } })).json().projects;
    expect(active.map((p: { id: string }) => p.id)).toEqual([copy.id]);
    const archived = (await app.inject({ method: "GET", url: "/api/projects?archived=1", headers: { cookie } })).json().projects;
    expect(archived.map((p: { id: string }) => p.id)).toEqual([project.id]);

    expect((await app.inject({ method: "DELETE", url: `/api/projects/${project.id}`, headers: { ...H, cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}`, headers: { cookie } })).statusCode).toBe(404);
    expect(await db.db.collection("blobs.files").countDocuments({ "metadata.projectId": project.id })).toBe(0);
  });

  it("saves workspace revisions with compare-and-set and validates content", async () => {
    const cookie = await register("projsave@example.com");
    const project = (await app.inject({ method: "POST", url: "/api/projects", headers: { ...H, cookie }, payload: { name: "P" } })).json().project;
    const put = (base: number, body: Buffer) => app.inject({ method: "PUT", url: `/api/projects/${project.id}/workspace?baseRevision=${base}`, headers: { ...H, ...BIN, cookie }, payload: body });
    expect((await put(1, workspace({ cards: [{ id: "a" }] }))).json().project.revision).toBe(2);
    const stale = await put(1, workspace());
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ expectedRevision: 1, actualRevision: 2 });
    expect((await put(2, Buffer.from("{not json"))).statusCode).toBe(415);
    expect((await put(2, Buffer.from(JSON.stringify({ kind: "something-else", version: 1 })))).statusCode).toBe(415);
    const latest = await app.inject({ method: "GET", url: `/api/projects/${project.id}/workspace`, headers: { cookie } });
    expect(latest.json().cards).toEqual([{ id: "a" }]);
    const first = await app.inject({ method: "GET", url: `/api/projects/${project.id}/workspace?revision=1`, headers: { cookie } });
    expect(first.json().cards).toEqual([]);
    const revs = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/revisions`, headers: { cookie } })).json().revisions;
    expect(revs.map((r: { revision: number }) => r.revision)).toEqual([2, 1]);
  });

  it("isolates projects between users and organizations", async () => {
    const alice = await register("proj-alice@example.com");
    const bob = await register("proj-bob@example.com");
    const project = (await app.inject({ method: "POST", url: "/api/projects", headers: { ...H, cookie: alice }, payload: { name: "Privileged" } })).json().project;
    const as = (method: "GET" | "PATCH" | "PUT" | "DELETE" | "POST", url: string, payload?: Buffer | object) =>
      app.inject({ method, url, headers: { ...H, cookie: bob, ...(payload instanceof Buffer ? BIN : {}) }, ...(payload ? { payload } : {}) });
    expect((await as("GET", `/api/projects/${project.id}`)).statusCode).toBe(404);
    expect((await as("GET", `/api/projects/${project.id}/workspace`)).statusCode).toBe(404);
    expect((await as("GET", `/api/projects/${project.id}/revisions`)).statusCode).toBe(404);
    expect((await as("PATCH", `/api/projects/${project.id}`, { name: "x" })).statusCode).toBe(404);
    expect((await as("PUT", `/api/projects/${project.id}/workspace?baseRevision=1`, workspace())).statusCode).toBe(404);
    expect((await as("POST", `/api/projects/${project.id}/duplicate`)).statusCode).toBe(404);
    expect((await as("DELETE", `/api/projects/${project.id}`)).statusCode).toBe(404);
    expect((await as("GET", "/api/projects?archived=all")).json().projects).toEqual([]);
    // A project stays in the organization it was created in.
    await db.users.updateOne({ email: "proj-alice@example.com" }, { $set: { orgId: "org-other" } });
    expect((await app.inject({ method: "GET", url: `/api/projects/${project.id}`, headers: { cookie: alice } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/projects" })).statusCode).toBe(401);
  });

  it("audits project changes without names or contents", async () => {
    const cookie = await register("projaudit@example.com");
    const project = (await app.inject({ method: "POST", url: "/api/projects", headers: { ...H, cookie }, payload: { name: "Secret merger", description: "privileged strategy" } })).json().project;
    await app.inject({ method: "PUT", url: `/api/projects/${project.id}/workspace?baseRevision=1`, headers: { ...H, ...BIN, cookie }, payload: workspace({ cards: [{ id: "c", text: "smoking gun" }] }) });
    const events = await db.audit.find({ projectId: project.id }).toArray();
    expect(events.map((e) => e.action)).toEqual(["project.created", "project.saved"]);
    const raw = JSON.stringify(events);
    for (const secret of ["Secret merger", "privileged", "smoking gun"]) expect(raw).not.toContain(secret);
  });
});

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
