import { KIND_LABELS, TEMPLATES, type FileKind, type TemplateInfo } from "@octo/core";
import { NotebookPen, Plus } from "lucide-react";
import { FileIcon } from "../components/FileIcon";

export type NewFileKind = Exclude<FileKind, "pdf"> | "text";

const BLANKS: { kind: NewFileKind; label: string }[] = [
  { kind: "document", label: "Blank document" },
  { kind: "spreadsheet", label: "Blank spreadsheet" },
  { kind: "presentation", label: "Blank presentation" },
  { kind: "text", label: "Text note" },
  { kind: "workspace", label: "Case workspace" },
];

function BlankTile({ kind, label, onClick, disabled }: { kind: NewFileKind; label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-left transition hover:border-brand-600 hover:shadow-sm disabled:opacity-60"
    >
      <span className="relative">
        {kind === "text" ? (
          <span className="inline-flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600" aria-hidden>
            <NotebookPen className="size-5" strokeWidth={1.75} />
          </span>
        ) : (
          <FileIcon kind={kind} />
        )}
        <Plus aria-hidden className="absolute -right-2 -top-2 size-4 rounded-full bg-brand-600 p-0.5 text-white" />
      </span>
      <span className="text-sm font-medium text-slate-800">{label}</span>
    </button>
  );
}

function TemplateTile({ template, onClick, disabled }: { template: TemplateInfo; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-600 hover:shadow-sm disabled:opacity-60"
    >
      <FileIcon kind={template.kind} format={template.format} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{template.title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{template.description}</span>
      </span>
    </button>
  );
}

interface StartPanelProps {
  busy: boolean;
  onCreate: (kind: NewFileKind) => void;
  onTemplate: (template: TemplateInfo) => void;
  onShowAllTemplates?: () => void;
  /** Show every template grouped by kind instead of a short strip. */
  full?: boolean;
}

export function StartPanel({ busy, onCreate, onTemplate, onShowAllTemplates, full = false }: StartPanelProps) {
  if (full) {
    const kinds = ["document", "spreadsheet", "presentation"] as const;
    return (
      <div className="space-y-8">
        <section aria-labelledby="blank-heading">
          <h2 id="blank-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Blank files
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BLANKS.map((b) => (
              <BlankTile key={b.kind} {...b} disabled={busy} onClick={() => onCreate(b.kind)} />
            ))}
          </div>
        </section>
        {kinds.map((kind) => (
          <section key={kind} aria-labelledby={`tpl-${kind}`}>
            <h2 id={`tpl-${kind}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {KIND_LABELS[kind].singular} templates
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES.filter((t) => t.kind === kind).map((t) => (
                <TemplateTile key={t.id} template={t} disabled={busy} onClick={() => onTemplate(t)} />
              ))}
            </div>
          </section>
        ))}
        <p className="text-xs text-slate-500">Templates are drafting starting points with [bracketed] placeholders. They are not legal advice.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="start-heading" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="start-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Start something new
        </h2>
        {onShowAllTemplates && (
          <button type="button" onClick={onShowAllTemplates} className="text-sm font-medium text-brand-600 hover:underline">
            All templates
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {BLANKS.map((b) => (
          <BlankTile key={b.kind} {...b} disabled={busy} onClick={() => onCreate(b.kind)} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.slice(0, 3).map((t) => (
          <TemplateTile key={t.id} template={t} disabled={busy} onClick={() => onTemplate(t)} />
        ))}
      </div>
    </section>
  );
}
