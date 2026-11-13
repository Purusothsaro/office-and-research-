import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, IndexedDbRepository, NotFoundError } from "./index";

const bytes = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

let repo: IndexedDbRepository;
let clock: number;

beforeEach(() => {
  clock = 1_000;
  repo = new IndexedDbRepository(`test-${crypto.randomUUID()}`, () => ++clock);
});

afterEach(() => repo.close());

describe("IndexedDbRepository", () => {
  it("creates files with metadata and content", async () => {
    const file = await repo.create({ name: "Notes.txt", format: "txt", bytes: bytes("hello") });
    expect(file).toMatchObject({ name: "Notes.txt", kind: "document", format: "txt", size: 5, revision: 1 });
    expect(str(await repo.getContent(file.id))).toBe("hello");
    expect(await repo.list()).toEqual([file]);
  });

  it("lists most recently updated first", async () => {
    const a = await repo.create({ name: "a.txt", format: "txt", bytes: bytes("a") });
    const b = await repo.create({ name: "b.txt", format: "txt", bytes: bytes("b") });
    expect((await repo.list()).map((f) => f.id)).toEqual([b.id, a.id]);
    await repo.rename(a.id, "a2");
    expect((await repo.list()).map((f) => f.id)).toEqual([a.id, b.id]);
  });

  it("renames without changing the extension", async () => {
    const file = await repo.create({ name: "Brief.docx", format: "docx", bytes: bytes("x") });
    expect((await repo.rename(file.id, "Final brief.pdf")).name).toBe("Final brief.pdf.docx");
    expect((await repo.rename(file.id, "Final brief")).name).toBe("Final brief.docx");
  });

  it("duplicates with unique copy names and independent content", async () => {
    const file = await repo.create({ name: "Memo.txt", format: "txt", bytes: bytes("v1") });
    const copy1 = await repo.duplicate(file.id);
    const copy2 = await repo.duplicate(file.id);
    const copyOfCopy = await repo.duplicate(copy1.id);
    expect([copy1.name, copy2.name, copyOfCopy.name]).toEqual(["Memo (copy).txt", "Memo (copy 2).txt", "Memo (copy 3).txt"]);
    await repo.saveContent(copy1.id, bytes("changed"), 1);
    expect(str(await repo.getContent(file.id))).toBe("v1");
  });

  it("saves new revisions and keeps history", async () => {
    const file = await repo.create({ name: "a.txt", format: "txt", bytes: bytes("one") });
    const saved = await repo.saveContent(file.id, bytes("two!"), 1);
    expect(saved).toMatchObject({ revision: 2, size: 4 });
    expect(str(await repo.getContent(file.id))).toBe("two!");
    expect(str(await repo.getContent(file.id, 1))).toBe("one");
    expect((await repo.listRevisions(file.id)).map((r) => [r.revision, r.note])).toEqual([
      [2, "Saved"],
      [1, "Created"],
    ]);
  });

  it("rejects stale saves instead of overwriting newer revisions", async () => {
    const file = await repo.create({ name: "a.txt", format: "txt", bytes: bytes("one") });
    await repo.saveContent(file.id, bytes("tab A"), 1);
    const stale = repo.saveContent(file.id, bytes("tab B"), 1);
    await expect(stale).rejects.toBeInstanceOf(ConflictError);
    await expect(stale).rejects.toMatchObject({ expectedRevision: 1, actualRevision: 2 });
    expect(str(await repo.getContent(file.id))).toBe("tab A");
  });

  it("leaves the file intact when a save fails part-way", async () => {
    const file = await repo.create({ name: "a.txt", format: "txt", bytes: bytes("one") });
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
      if (this.name === "blobs") throw new DOMException("simulated failure", "AbortError");
      return original.apply(this, args);
    };
    try {
      await expect(repo.saveContent(file.id, bytes("two"), 1)).rejects.toThrow("simulated failure");
      await expect(repo.create({ name: "b.txt", format: "txt", bytes: bytes("b") })).rejects.toThrow("simulated failure");
    } finally {
      IDBObjectStore.prototype.add = original;
    }
    expect((await repo.get(file.id)).revision).toBe(1);
    expect(str(await repo.getContent(file.id))).toBe("one");
    expect(await repo.listRevisions(file.id)).toHaveLength(1);
    expect(await repo.list()).toHaveLength(1);
  });

  it("deletes files with their revisions and drafts", async () => {
    const file = await repo.create({ name: "a.txt", format: "txt", bytes: bytes("one") });
    await repo.saveContent(file.id, bytes("two"), 1);
    await repo.putDraft({ fileId: file.id, baseRevision: 2, content: bytes("draft") });
    await repo.delete(file.id);
    await expect(repo.get(file.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.getContent(file.id, 1)).rejects.toBeInstanceOf(NotFoundError);
    expect(await repo.listRevisions(file.id)).toEqual([]);
    expect(await repo.getDraft(file.id)).toBeUndefined();
  });

  it("stores, replaces and removes drafts", async () => {
    const file = await repo.create({ name: "a.txt", format: "txt", bytes: bytes("one") });
    await repo.putDraft({ fileId: file.id, baseRevision: 1, content: bytes("d1") });
    await repo.putDraft({ fileId: file.id, baseRevision: 1, content: bytes("d2") });
    const drafts = await repo.listDrafts();
    expect(drafts).toHaveLength(1);
    expect(str(drafts[0]!.content)).toBe("d2");
    await repo.deleteDraft(file.id);
    expect(await repo.listDrafts()).toEqual([]);
  });

  it("notifies subscribers of changes", async () => {
    const events: string[] = [];
    const unsubscribe = repo.subscribe((e) => events.push(e.type));
    const file = await repo.create({ name: "a.txt", format: "txt", bytes: bytes("one") });
    await repo.putDraft({ fileId: file.id, baseRevision: 1, content: bytes("d") });
    unsubscribe();
    await repo.rename(file.id, "b");
    expect(events).toEqual(["files-changed", "drafts-changed"]);
  });
});
