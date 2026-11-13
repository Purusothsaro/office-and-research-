import type { PendingWorkspace, ProjectMeta } from "@octo/research";
import { Archive, ArchiveRestore, Copy, FolderOpen, Gavel, LogOut, MoreHorizontal, Pencil, Plus, Scale, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brand } from "../auth/Root";
import { Button, Dialog, IconButton, inputClass, Menu, MenuItem, useToast } from "../components/ui";
import { useApp } from "../lib/app";
import { ProjectDialog } from "./ProjectDialog";

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export function ProjectsPage() {
  const { api, local, user, signOut } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ kind: "new" } | { kind: "edit"; project: ProjectMeta } | { kind: "delete"; project: ProjectMeta } | null>(null);
  const [pending, setPending] = useState<PendingWorkspace[]>([]);

  const load = useCallback(async () => {
    try {
      setProjects(await api.listProjects(tab));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, tab]);

  useEffect(() => {
    // Loads from the server; state is set when the response arrives.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
    return api.subscribe((e) => {
      if (e.type !== "projects-changed") return;
      void load();
      local.listPending().then(setPending, () => undefined);
    });
  }, [api, load, local]);
  useEffect(() => {
    local.listPending().then(setPending, () => undefined);
  }, [local]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects ?? []).filter((p) => !q || [p.name, p.caseName, p.reference, p.court, p.jurisdiction].join(" ").toLowerCase().includes(q));
  }, [projects, query]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast(done, "success");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 bg-ink-900 px-4 py-2.5 sm:px-6">
        <Brand dark />
        <span className="ml-auto hidden text-sm text-slate-300 sm:inline">{user.name}</span>
        <Button variant="dark" onClick={signOut}>
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Research projects</h1>
            <p className="mt-1 text-sm text-slate-600">One project per matter: its documents, excerpts, issues and arguments.</p>
          </div>
          <Button variant="primary" className="ml-auto h-9" onClick={() => setDialog({ kind: "new" })}>
            <Plus className="size-4" aria-hidden /> New project
          </Button>
        </div>
        {pending.length > 0 && (
          <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {pending.length === 1 ? "One project has" : `${pending.length} projects have`} changes saved on this device that haven't reached the server yet. Open the project to restore them.
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Projects" className="flex rounded-lg bg-slate-200/70 p-0.5">
            {(["active", "archived"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => (setProjects(null), setTab(t))} className={`rounded-md px-3 py-1 text-sm font-medium ${tab === t ? "bg-white text-ink-900 shadow-sm" : "text-slate-600"}`}>
                {t === "active" ? "Active" : "Archived"}
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-slate-400" aria-hidden />
            <input className={`${inputClass} pl-8`} placeholder="Search projects" aria-label="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {!projects && !error && <p className="mt-8 text-sm text-slate-500">Loading projects…</p>}
        {projects && shown.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Scale className="mx-auto size-8 text-brand-500" aria-hidden />
            <p className="mt-3 font-medium text-slate-800">{query ? "No projects match your search." : tab === "archived" ? "No archived projects." : "No projects yet."}</p>
            {!query && tab === "active" && <p className="mt-1 text-sm text-slate-600">Create a project for a matter, then import its PDFs, Word files and notes.</p>}
          </div>
        )}
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id} className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md">
              <button className="text-left after:absolute after:inset-0" onClick={() => navigate(`/p/${p.id}`)} aria-label={`Open ${p.name}`}>
                <span className="flex items-start gap-2 pr-8">
                  <Gavel className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                  <span className="font-semibold text-ink-900">{p.name}</span>
                </span>
              </button>
              {p.caseName && p.caseName !== p.name && <p className="mt-1 text-sm text-slate-700 italic">{p.caseName}</p>}
              <p className="mt-2 text-xs text-slate-500">{[p.court, p.jurisdiction, p.reference].filter(Boolean).join(" · ") || "No court details yet"}</p>
              {p.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
              <p className="mt-auto pt-3 text-xs text-slate-400">
                Updated {ago(p.updatedAt)}
                {pending.some((x) => x.projectId === p.id) && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Unsynced changes</span>}
              </p>
              <div className="absolute top-2.5 right-2.5 z-10">
                <Menu
                  label={`Actions for ${p.name}`}
                  align="right"
                  trigger={(t) => (
                    <IconButton label={`Actions for ${p.name}`} {...t}>
                      <MoreHorizontal className="size-4" aria-hidden />
                    </IconButton>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem onClick={() => (close(), navigate(`/p/${p.id}`))}>
                        <FolderOpen className="size-4" aria-hidden /> Open
                      </MenuItem>
                      <MenuItem onClick={() => (close(), setDialog({ kind: "edit", project: p }))}>
                        <Pencil className="size-4" aria-hidden /> Rename and edit details
                      </MenuItem>
                      <MenuItem onClick={() => (close(), void act(() => api.duplicateProject(p.id), "Project duplicated"))}>
                        <Copy className="size-4" aria-hidden /> Duplicate
                      </MenuItem>
                      <MenuItem onClick={() => (close(), void act(() => api.updateProject(p.id, { archived: !p.archived }), p.archived ? "Project restored" : "Project archived"))}>
                        {p.archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />} {p.archived ? "Restore" : "Archive"}
                      </MenuItem>
                      <MenuItem danger onClick={() => (close(), setDialog({ kind: "delete", project: p }))}>
                        <Trash2 className="size-4" aria-hidden /> Delete…
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </div>
            </li>
          ))}
        </ul>
      </main>
      {dialog?.kind === "new" && (
        <ProjectDialog
          onClose={() => setDialog(null)}
          onSave={async (fields) => {
            const p = await api.createProject(fields);
            navigate(`/p/${p.id}`);
          }}
        />
      )}
      {dialog?.kind === "edit" && <ProjectDialog project={dialog.project} onClose={() => setDialog(null)} onSave={async (fields) => void (await api.updateProject(dialog.project.id, fields), await load())} />}
      {dialog?.kind === "delete" && (
        <Dialog
          title="Delete project?"
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const p = dialog.project;
                  setDialog(null);
                  void act(async () => {
                    await api.deleteProject(p.id);
                    await local.deletePending(p.id).catch(() => undefined);
                  }, "Project deleted");
                }}
              >
                Delete project
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            “{dialog.project.name}” and its workspace, excerpts, annotations and history will be deleted permanently. Imported documents stay in your OctoGenie files.
          </p>
        </Dialog>
      )}
    </div>
  );
}
