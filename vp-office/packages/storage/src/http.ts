import {
  ConflictError,
  NotFoundError,
  type CreateFileInput,
  type DocumentRepository,
  type DraftRecord,
  type FileRecord,
  type RepositoryEvent,
  type RevisionRecord,
} from "./types";

export class AuthRequiredError extends Error {
  constructor() {
    super("Sign in to continue.");
    this.name = "AuthRequiredError";
  }
}

export class ServerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServerError";
  }
}

const HEADERS = { "X-Octo-Client": "web" };

/**
 * Repository backed by the OctoGenie Office server (MongoDB). All data,
 * including drafts, lives on the server; this class only talks HTTP.
 */
export class HttpRepository implements DocumentRepository {
  private listeners = new Set<(e: RepositoryEvent) => void>();
  private source: EventSource | null = null;
  /** Called when the session has expired, so the app can show sign-in. */
  onAuthRequired: (() => void) | null = null;

  constructor(private readonly base = "/api") {}

  private async request(path: string, init: RequestInit & { id?: string } = {}): Promise<Response> {
    const res = await fetch(`${this.base}${path}`, { credentials: "same-origin", ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } });
    if (res.ok) return res;
    if (res.status === 401) {
      this.onAuthRequired?.();
      throw new AuthRequiredError();
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string; expectedRevision?: number; actualRevision?: number };
    if (res.status === 404) throw new NotFoundError(init.id ?? path);
    if (res.status === 409 && body.actualRevision !== undefined) throw new ConflictError(init.id ?? path, body.expectedRevision ?? -1, body.actualRevision ?? -1);
    throw new ServerError(res.status, body.error ?? `Request failed (${res.status}).`);
  }

  private json = async <T>(path: string, init: RequestInit & { id?: string } = {}) => (await (await this.request(path, init)).json()) as T;

  async list(): Promise<FileRecord[]> {
    return (await this.json<{ files: FileRecord[] }>("/files")).files;
  }

  async get(id: string): Promise<FileRecord> {
    return (await this.json<{ file: FileRecord }>(`/files/${encodeURIComponent(id)}`, { id })).file;
  }

  async getContent(id: string, revision?: number): Promise<Uint8Array> {
    const q = revision !== undefined ? `?revision=${revision}` : "";
    return new Uint8Array(await (await this.request(`/files/${encodeURIComponent(id)}/content${q}`, { id })).arrayBuffer());
  }

  async listRevisions(id: string): Promise<RevisionRecord[]> {
    return (await this.json<{ revisions: RevisionRecord[] }>(`/files/${encodeURIComponent(id)}/revisions`, { id })).revisions;
  }

  async create(input: CreateFileInput): Promise<FileRecord> {
    const q = new URLSearchParams({ name: input.name, ...(input.templateId ? { templateId: input.templateId } : {}) });
    return (await this.json<{ file: FileRecord }>(`/files?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: input.bytes as BodyInit })).file;
  }

  async rename(id: string, baseName: string): Promise<FileRecord> {
    return (await this.json<{ file: FileRecord }>(`/files/${encodeURIComponent(id)}`, { id, method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: baseName }) })).file;
  }

  async duplicate(id: string): Promise<FileRecord> {
    return (await this.json<{ file: FileRecord }>(`/files/${encodeURIComponent(id)}/duplicate`, { id, method: "POST" })).file;
  }

  async saveContent(id: string, bytes: Uint8Array, baseRevision: number, note = "Saved"): Promise<FileRecord> {
    const q = new URLSearchParams({ baseRevision: String(baseRevision), note });
    return (await this.json<{ file: FileRecord }>(`/files/${encodeURIComponent(id)}/content?${q}`, { id, method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit })).file;
  }

  async delete(id: string): Promise<void> {
    await this.request(`/files/${encodeURIComponent(id)}`, { id, method: "DELETE" });
  }

  async putDraft(draft: Omit<DraftRecord, "updatedAt">): Promise<void> {
    await this.request(`/drafts/${encodeURIComponent(draft.fileId)}?baseRevision=${draft.baseRevision}`, {
      id: draft.fileId,
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: draft.content as BodyInit,
      // Lets the last draft write finish while the page is closing.
      keepalive: draft.content.byteLength < 60_000,
    });
  }

  async getDraft(fileId: string): Promise<DraftRecord | undefined> {
    try {
      const res = await this.request(`/drafts/${encodeURIComponent(fileId)}`, { id: fileId });
      return {
        fileId,
        baseRevision: Number(res.headers.get("X-Base-Revision")),
        updatedAt: Number(res.headers.get("X-Updated-At")),
        content: new Uint8Array(await res.arrayBuffer()),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return undefined;
      throw error;
    }
  }

  async listDrafts(): Promise<DraftRecord[]> {
    const { drafts } = await this.json<{ drafts: Omit<DraftRecord, "content">[] }>("/drafts");
    // Contents are fetched on demand; listings only need metadata.
    return drafts.map((d) => ({ ...d, content: new Uint8Array() }));
  }

  async deleteDraft(fileId: string): Promise<void> {
    await this.request(`/drafts/${encodeURIComponent(fileId)}`, { id: fileId, method: "DELETE" });
  }

  subscribe(listener: (event: RepositoryEvent) => void): () => void {
    this.listeners.add(listener);
    if (!this.source && typeof EventSource !== "undefined") {
      this.source = new EventSource(`${this.base}/events`, { withCredentials: true });
      this.source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data as string) as RepositoryEvent;
          for (const l of this.listeners) l(event);
        } catch {
          // Ignore malformed events.
        }
      };
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.source?.close();
        this.source = null;
      }
    };
  }

  close(): void {
    this.source?.close();
    this.source = null;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

async function authCall(path: string, body?: unknown): Promise<SessionUser> {
  const res = await fetch(`/api/auth/${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: { ...HEADERS, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: SessionUser; error?: string };
  // 502/503/504 without our JSON means the dev proxy couldn't reach the API server.
  if (!data.error && [502, 503, 504].includes(res.status)) throw new ServerError(res.status, "Can't reach the OctoGenie Office server. Make sure it's running (npm run dev starts it) and MongoDB is available.");
  if (!res.ok || !data.user) throw new ServerError(res.status, data.error ?? "Something went wrong.");
  return data.user;
}

export const session = {
  me: () => authCall("me"),
  login: (email: string, password: string) => authCall("login", { email, password }),
  register: (email: string, password: string, name: string) => authCall("register", { email, password, name }),
  logout: () => fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: HEADERS }).then(() => undefined),
};
