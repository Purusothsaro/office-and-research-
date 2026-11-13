import { ProjectConflictError } from "./api";

export type SaveStatus = "saved" | "pending" | "saving" | "offline" | "conflict" | "error";

export interface SyncOptions {
  projectId: string;
  revision: number;
  /** Commits bytes on the server based on `baseRevision`; returns the new revision. */
  save: (bytes: Uint8Array, baseRevision: number) => Promise<number>;
  /** Device-local copy for crash recovery. Failures here never block saving. */
  local?: { putPending(p: { projectId: string; bytes: Uint8Array; baseRevision: number; updatedAt: number }): Promise<void>; deletePending(projectId: string): Promise<void> };
  delayMs?: number;
  retryMs?: number;
  onStatus?: (status: SaveStatus, detail?: string) => void;
}

/**
 * Saves workspace changes: immediately to the device (so nothing is lost if the
 * tab closes), then to the server after a short pause, using compare-and-set
 * revisions so a stale copy never overwrites newer work.
 */
export class WorkspaceSync {
  private latest: Uint8Array | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private _status: SaveStatus = "saved";
  private _revision: number;
  private disposed = false;

  constructor(private readonly o: SyncOptions) {
    this._revision = o.revision;
  }

  get status() {
    return this._status;
  }
  get revision() {
    return this._revision;
  }
  get hasUnsaved() {
    return this.latest !== null;
  }

  private set(status: SaveStatus, detail?: string) {
    this._status = status;
    this.o.onStatus?.(status, detail);
  }

  change(bytes: Uint8Array): void {
    if (this.disposed) return;
    this.latest = bytes;
    void this.o.local?.putPending({ projectId: this.o.projectId, bytes, baseRevision: this._revision, updatedAt: Date.now() }).catch(() => undefined);
    if (this._status === "conflict") return;
    this.set("pending");
    // Save at most `delayMs` after the first unsaved change: a stream of edits
    // (typing, dragging, scrolling) must not keep postponing the save.
    if (!this.timer) this.schedule(this.o.delayMs ?? 1000);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private async run(): Promise<void> {
    this.timer = null;
    if (this.inflight) return this.inflight;
    if (!this.latest || this._status === "conflict") return;
    const bytes = this.latest;
    this.inflight = (async () => {
      this.set("saving");
      try {
        this._revision = await this.o.save(bytes, this._revision);
        if (this.latest === bytes) {
          this.latest = null;
          await this.o.local?.deletePending(this.o.projectId).catch(() => undefined);
          this.set("saved");
        } else {
          // Edited during the save: keep the device copy current and save again.
          void this.o.local?.putPending({ projectId: this.o.projectId, bytes: this.latest!, baseRevision: this._revision, updatedAt: Date.now() }).catch(() => undefined);
          this.set("pending");
          this.schedule(50);
        }
      } catch (error) {
        if (error instanceof ProjectConflictError) {
          this.set("conflict", error.message);
          return;
        }
        const status = (error as { status?: number }).status;
        if (status === 0 || (status !== undefined && status >= 500)) {
          this.set("offline", (error as Error).message);
          if (!this.disposed) this.schedule(this.o.retryMs ?? 5000);
        } else this.set("error", (error as Error).message);
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Saves now and waits; resolves once the server has the latest change (or saving failed). */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.inflight) await this.inflight;
    if (this.latest && this._status !== "conflict") await this.run();
    if (this.inflight) await this.inflight;
  }

  /** After the workspace was reloaded from the server at `revision`. */
  reset(revision: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.latest = null;
    this._revision = revision;
    void this.o.local?.deletePending(this.o.projectId).catch(() => undefined);
    this.set("saved");
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
