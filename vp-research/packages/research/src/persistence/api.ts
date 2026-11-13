import type { ProjectMeta } from "../model/types";

const HEADERS = { "X-Octo-Client": "web" };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ProjectConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super("This project was changed in another tab or on another device.");
    this.name = "ProjectConflictError";
  }
}

export interface FileInfo {
  id: string;
  name: string;
  format: string;
  size: number;
  revision: number;
  derivedFrom?: string;
  derivedRevision?: number;
  derivedKind?: string;
}

export type ProjectFields = Partial<Pick<ProjectMeta, "name" | "caseName" | "reference" | "court" | "jurisdiction" | "description" | "archived">>;

export interface RevisionInfo {
  revision: number;
  size: number;
  note: string;
  createdAt: number;
}

export type ServerEvent = { type: "projects-changed" } | { type: "project-saved"; projectId: string; revision: number } | { type: "files-changed" } | { type: "file-saved"; fileId: string; revision: number };

/** HTTP client for projects and their documents on the OctoGenie server. */
export class ResearchApi {
  onAuthRequired: (() => void) | null = null;
  private source: EventSource | null = null;
  private listeners = new Set<(e: ServerEvent) => void>();

  constructor(private readonly base = "/api") {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, { credentials: "same-origin", ...init, headers: { ...HEADERS, ...init.headers } });
    } catch {
      throw new ApiError(0, "Can't reach the server. Check your connection; your changes are kept on this device.");
    }
    if (res.ok) return res;
    if (res.status === 401) this.onAuthRequired?.();
    const body = (await res.json().catch(() => ({}))) as { error?: string; expectedRevision?: number; actualRevision?: number };
    if (res.status === 409 && typeof body.actualRevision === "number") throw new ProjectConflictError(body.expectedRevision ?? -1, body.actualRevision);
    if ([502, 503, 504].includes(res.status) && !body.error) throw new ApiError(res.status, "Can't reach the OctoGenie server. Make sure it's running (npm run dev starts it).");
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status}).`);
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await (await this.request(path, init)).json()) as T;
  }

  private jsonBody = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  // ---- Projects ----
  async listProjects(archived: "active" | "archived" | "all" = "active"): Promise<ProjectMeta[]> {
    const q = archived === "all" ? "?archived=all" : archived === "archived" ? "?archived=1" : "";
    return (await this.json<{ projects: ProjectMeta[] }>(`/projects${q}`)).projects;
  }
  async createProject(fields: ProjectFields): Promise<ProjectMeta> {
    return (await this.json<{ project: ProjectMeta }>("/projects", this.jsonBody("POST", fields))).project;
  }
  async getProject(id: string): Promise<ProjectMeta> {
    return (await this.json<{ project: ProjectMeta }>(`/projects/${encodeURIComponent(id)}`)).project;
  }
  async updateProject(id: string, fields: ProjectFields): Promise<ProjectMeta> {
    return (await this.json<{ project: ProjectMeta }>(`/projects/${encodeURIComponent(id)}`, this.jsonBody("PATCH", fields))).project;
  }
  async duplicateProject(id: string): Promise<ProjectMeta> {
    return (await this.json<{ project: ProjectMeta }>(`/projects/${encodeURIComponent(id)}/duplicate`, { method: "POST" })).project;
  }
  async deleteProject(id: string): Promise<void> {
    await this.request(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
  async getWorkspace(id: string, revision?: number): Promise<{ bytes: Uint8Array; revision: number }> {
    const res = await this.request(`/projects/${encodeURIComponent(id)}/workspace${revision ? `?revision=${revision}` : ""}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), revision: Number(res.headers.get("X-Revision")) };
  }
  async saveWorkspace(id: string, bytes: Uint8Array, baseRevision: number, note = "Saved"): Promise<ProjectMeta> {
    const q = new URLSearchParams({ baseRevision: String(baseRevision), note });
    return (await this.json<{ project: ProjectMeta }>(`/projects/${encodeURIComponent(id)}/workspace?${q}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit, keepalive: bytes.byteLength < 60_000 })).project;
  }
  async listRevisions(id: string): Promise<RevisionInfo[]> {
    return (await this.json<{ revisions: RevisionInfo[] }>(`/projects/${encodeURIComponent(id)}/revisions`)).revisions;
  }

  // ---- Documents (stored as the user's files; originals are never modified) ----
  async uploadFile(name: string, bytes: Uint8Array, derived?: { from: string; revision: number; kind: "ocr" | "converted" }): Promise<FileInfo> {
    const q = new URLSearchParams({ name, ...(derived ? { derivedFrom: derived.from, derivedRevision: String(derived.revision), derivedKind: derived.kind } : {}) });
    return (await this.json<{ file: FileInfo }>(`/files?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit })).file;
  }
  async getFile(id: string): Promise<FileInfo> {
    return (await this.json<{ file: FileInfo }>(`/files/${encodeURIComponent(id)}`)).file;
  }
  async listFiles(): Promise<FileInfo[]> {
    return (await this.json<{ files: FileInfo[] }>("/files")).files;
  }
  async derivedFiles(id: string): Promise<FileInfo[]> {
    return (await this.json<{ files: FileInfo[] }>(`/files/${encodeURIComponent(id)}/derived`)).files;
  }
  async fileContent(id: string, revision?: number): Promise<Uint8Array> {
    return new Uint8Array(await (await this.request(`/files/${encodeURIComponent(id)}/content${revision ? `?revision=${revision}` : ""}`)).arrayBuffer());
  }
  /** Stores a new version of a file (the previous one stays in its history). */
  async replaceFile(id: string, bytes: Uint8Array, baseRevision: number): Promise<FileInfo> {
    const q = new URLSearchParams({ baseRevision: String(baseRevision), note: "Replaced from a research project" });
    return (await this.json<{ file: FileInfo }>(`/files/${encodeURIComponent(id)}/content?${q}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit })).file;
  }

  // ---- Live events ----
  subscribe(fn: (e: ServerEvent) => void): () => void {
    this.listeners.add(fn);
    if (!this.source && typeof EventSource !== "undefined") {
      this.source = new EventSource(`${this.base}/events`, { withCredentials: true });
      this.source.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data as string) as ServerEvent;
          for (const l of this.listeners) l(e);
        } catch {
          // Ignore malformed events.
        }
      };
    }
    return () => {
      this.listeners.delete(fn);
      if (!this.listeners.size) {
        this.source?.close();
        this.source = null;
      }
    };
  }
}
