import type { ProjectFields, ProjectMeta } from "@octo/research";
import { useState } from "react";
import { Button, Dialog, Field, inputClass } from "../components/ui";

/** Create or edit a project's case details. */
export function ProjectDialog({ project, onClose, onSave }: { project?: ProjectMeta; onClose: () => void; onSave: (fields: ProjectFields) => Promise<void> }) {
  const [f, setF] = useState({
    name: project?.name ?? "",
    caseName: project?.caseName ?? "",
    reference: project?.reference ?? "",
    court: project?.court ?? "",
    jurisdiction: project?.jurisdiction ?? "",
    description: project?.description ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.name.trim() && !f.caseName.trim()) return setError("Give the project a name or a case name.");
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...f, name: f.name.trim() || f.caseName.trim() });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={project ? "Project details" : "New research project"}
      onClose={onClose}
      wide="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {project ? "Save details" : "Create project"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Project name">
            <input className={inputClass} value={f.name} onChange={set("name")} placeholder="e.g. Smith – liability review" maxLength={200} autoFocus />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Case name">
            <input className={inputClass} value={f.caseName} onChange={set("caseName")} placeholder="e.g. Smith v. Jones" maxLength={300} />
          </Field>
        </div>
        <Field label="Case reference">
          <input className={inputClass} value={f.reference} onChange={set("reference")} placeholder="Claim or docket number" maxLength={120} />
        </Field>
        <Field label="Court">
          <input className={inputClass} value={f.court} onChange={set("court")} maxLength={200} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Jurisdiction">
            <input className={inputClass} value={f.jurisdiction} onChange={set("jurisdiction")} maxLength={120} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description" hint="What this research is for. Visible only to you.">
            <textarea className={`${inputClass} min-h-20`} value={f.description} onChange={set("description")} maxLength={4000} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
