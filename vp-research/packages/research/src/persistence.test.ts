import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStore, ProjectConflictError, WorkspaceSync, type SaveStatus } from "./index";
import { buildPageIndex } from "./search/text-index";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("local store", () => {
  it("keeps pending workspaces and text indexes per user", async () => {
    const a = new LocalStore("alice");
    const b = new LocalStore("bob");
    await a.putPending({ projectId: "p1", bytes: bytes("ws"), baseRevision: 3, updatedAt: 1 });
    expect((await a.getPending("p1"))?.baseRevision).toBe(3);
    expect(await b.getPending("p1")).toBeUndefined();
    await a.putIndex("f1@2", { documentId: "d", viewFileId: "f1", viewRevision: 2, pages: [buildPageIndex(0, [{ str: "Hello world", x: 0, y: 0, w: 50, h: 10, eol: false }])] });
    const idx = await a.getIndex("f1@2");
    expect(idx?.pages[0]!.text).toBe("Hello world");
    expect(await a.getIndex("f1@1")).toBeUndefined();
    await a.deletePending("p1");
    expect(await a.listPending()).toEqual([]);
    await a.close();
    await b.close();
  });
});

describe("autosave", () => {
  afterEach(() => vi.useRealTimers());

  function setup(save: (b: Uint8Array, base: number) => Promise<number>) {
    const statuses: SaveStatus[] = [];
    const pending = new Map<string, number>();
    const local = {
      putPending: async (p: { projectId: string; baseRevision: number }) => void pending.set(p.projectId, p.baseRevision),
      deletePending: async (id: string) => void pending.delete(id),
    };
    const sync = new WorkspaceSync({ projectId: "p", revision: 1, save, local, delayMs: 20, retryMs: 30, onStatus: (s) => statuses.push(s) });
    return { sync, statuses, pending };
  }

  it("saves the latest change once after a pause and clears the device copy", async () => {
    const save = vi.fn(async (_b: Uint8Array, base: number) => base + 1);
    const { sync, statuses, pending } = setup(save);
    sync.change(bytes("a"));
    sync.change(bytes("ab"));
    expect(pending.get("p")).toBe(1);
    await sync.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(new TextDecoder().decode(save.mock.calls[0]![0])).toBe("ab");
    expect(sync.revision).toBe(2);
    expect(statuses.at(-1)).toBe("saved");
    expect(pending.has("p")).toBe(false);
  });

  it("saves within the delay even while edits keep arriving", async () => {
    const save = vi.fn(async (_b: Uint8Array, base: number) => base + 1);
    const { sync } = setup(save);
    // An edit every 5 ms for 100 ms: far longer than the 20 ms save delay.
    for (let i = 0; i < 20; i++) {
      sync.change(bytes(`v${i}`));
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(save.mock.calls.length).toBeGreaterThan(0);
    await sync.flush();
    expect(new TextDecoder().decode(save.mock.calls.at(-1)![0])).toBe("v19");
  });

  it("stops on a conflict instead of overwriting newer work", async () => {
    const { sync, statuses, pending } = setup(async () => {
      throw new ProjectConflictError(1, 4);
    });
    sync.change(bytes("x"));
    await sync.flush();
    expect(statuses.at(-1)).toBe("conflict");
    sync.change(bytes("y"));
    await sync.flush();
    expect(statuses.at(-1)).toBe("conflict");
    // The edit is still kept on the device.
    expect(pending.has("p")).toBe(true);
  });

  it("retries when offline and keeps the change locally meanwhile", async () => {
    let calls = 0;
    const { sync, statuses } = setup(async (_b, base) => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("offline"), { status: 0 });
      return base + 1;
    });
    sync.change(bytes("x"));
    await sync.flush();
    expect(statuses.at(-1)).toBe("offline");
    await vi.waitFor(() => expect(statuses.at(-1)).toBe("saved"), { timeout: 3000 });
    expect(calls).toBe(2);
  });
});
