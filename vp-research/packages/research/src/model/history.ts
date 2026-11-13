/**
 * Undo/redo for immutable states. Consecutive changes with the same key
 * (e.g. one drag, or typing in one card) merge into a single undo step.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey: string | null = null;
  private lastAt = 0;

  constructor(
    private readonly limit = 200,
    /** Changes with the same key further apart than this start a new step. */
    private readonly mergeWindowMs = 1500,
  ) {}

  /** Records `previous` as an undo point before a change. */
  record(previous: T, key: string | null = null, at = Date.now()): void {
    const merge = key !== null && key === this.lastKey && at - this.lastAt < this.mergeWindowMs;
    this.lastKey = key;
    this.lastAt = at;
    if (merge) return;
    this.past.push(previous);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    this.lastKey = null;
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastKey = null;
    return next;
  }

  /** Ends merging, so the next change starts a new step. */
  seal(): void {
    this.lastKey = null;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.lastKey = null;
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}
