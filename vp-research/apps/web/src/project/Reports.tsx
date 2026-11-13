import {
  buildReport,
  citation,
  exportAnnotatedPdf,
  exportProjectData,
  ORGANIZE_OPTIONS,
  reportToDocx,
  reportToPdf,
  workspaceSvg,
  type ExcerptCard,
  type OrganizeBy,
  type ProjectMeta,
  type ResearchWorkspace,
  type RevisionInfo,
} from "@octo/research";
import { ArrowUpRight, FileDown, FileJson, FileText, Image, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dialog, Field, inputClass, useToast } from "../components/ui";
import { download, safeName, useApp } from "../lib/app";
import type { DocumentService } from "./documents";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Side-by-side view of excerpts with the source region of each page. */
export function CompareDialog({ ws, cards, service, onOpen, onClose }: { ws: ResearchWorkspace; cards: ExcerptCard[]; service: DocumentService; onOpen: (c: ExcerptCard) => void; onClose: () => void }) {
  return (
    <Dialog title={`Compare ${cards.length} excerpts`} onClose={onClose} wide="xl">
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(cards.length, 3)}, minmax(0, 1fr))` }}>
        {cards.map((c) => (
          <article key={c.id} className="flex min-w-0 flex-col rounded-lg border border-slate-200">
            <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <span className="truncate text-xs font-semibold text-brand-700">{citation(ws, c.sourceId)}</span>
              <Button variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={() => (onOpen(c), onClose())}>
                Open <ArrowUpRight className="size-3.5" aria-hidden />
              </Button>
            </header>
            <blockquote className="px-3 py-2 font-serif text-[13px] leading-snug text-slate-800">“{ws.sources[c.sourceId]?.quote}”</blockquote>
            {c.text.trim() !== ws.sources[c.sourceId]?.quote.trim() && <p className="px-3 pb-2 text-xs text-slate-600">Card wording: {c.text}</p>}
            <SourceCrop ws={ws} card={c} service={service} />
          </article>
        ))}
      </div>
    </Dialog>
  );
}

function SourceCrop({ ws, card, service }: { ws: ResearchWorkspace; card: ExcerptCard; service: DocumentService }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const src = ws.sources[card.sourceId];
    if (!src) return;
    let cancelled = false;
    void (async () => {
      try {
        const pdf = await service.openPdf(src.viewFileId, src.viewRevision);
        const page = await pdf.getPage(src.page + 1);
        const vp = page.getViewport({ scale: 1.6 });
        const off = document.createElement("canvas");
        off.width = Math.ceil(vp.width);
        off.height = Math.ceil(vp.height);
        await page.render({ canvas: off, canvasContext: off.getContext("2d")!, viewport: vp }).promise;
        if (cancelled || !ref.current) return;
        const ys = src.rects.flatMap((r) => [vp.convertToViewportPoint(r[0], r[1])[1]!, vp.convertToViewportPoint(r[2], r[3])[1]!]);
        const top = Math.max(0, Math.min(...ys) - 70);
        const bottom = Math.min(off.height, Math.max(...ys) + 70);
        const c = ref.current;
        c.width = off.width;
        c.height = Math.max(40, bottom - top);
        const ctx = c.getContext("2d")!;
        ctx.drawImage(off, 0, top, off.width, c.height, 0, 0, off.width, c.height);
        ctx.fillStyle = "rgba(112, 86, 232, 0.25)";
        for (const r of src.rects) {
          const [a, b] = vp.convertToViewportPoint(r[0], r[1]) as [number, number];
          const [d, e] = vp.convertToViewportPoint(r[2], r[3]) as [number, number];
          ctx.fillRect(Math.min(a, d), Math.min(b, e) - top, Math.abs(d - a), Math.abs(e - b));
        }
        void pdf.destroy();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ws, card.sourceId, service]);
  if (failed) return <p className="px-3 pb-3 text-xs text-slate-500">The source page couldn't be shown.</p>;
  return <canvas ref={ref} className="mt-auto w-full border-t border-slate-100" aria-label={`Source page region for ${citation(ws, card.sourceId)}`} />;
}

/** Builds a research summary from cards and exports it to Word or PDF. */
export function SummaryDialog({ ws, project, selectedIds, filteredIds, onClose, onSavedToFiles }: { ws: ResearchWorkspace; project: ProjectMeta; selectedIds: string[]; filteredIds: string[] | null; onClose: () => void; onSavedToFiles?: (name: string) => void }) {
  const { api } = useApp();
  const toast = useToast();
  const selectedPoints = selectedIds.filter((id) => ws.cards.some((c) => c.id === id && c.type !== "group"));
  const [scope, setScope] = useState<"selected" | "filtered" | "all">(selectedPoints.length ? "selected" : filteredIds ? "filtered" : "all");
  const [by, setBy] = useState<OrganizeBy>("group");
  const [title, setTitle] = useState(`${project.caseName || project.name} — research summary`);
  const [busy, setBusy] = useState(false);
  const ids = scope === "selected" ? selectedPoints : scope === "filtered" && filteredIds ? filteredIds : undefined;
  const report = useMemo(() => buildReport(ws, project, { title: title.trim() || "Research summary", by, ...(ids ? { cardIds: ids } : {}) }), [ws, project, title, by, ids]);
  const entries = report.sections.reduce((n, s) => n + s.entries.length, 0);
  const run = async (kind: "docx" | "pdf" | "files") => {
    setBusy(true);
    try {
      const name = safeName(report.title);
      if (kind === "pdf") download(await reportToPdf(report), `${name}.pdf`, "application/pdf");
      else {
        const bytes = await reportToDocx(report);
        if (kind === "docx") download(bytes, `${name}.docx`, DOCX_MIME);
        else {
          const f = await api.uploadFile(`${name}.docx`, bytes);
          onSavedToFiles?.(f.name);
          toast(`Saved “${f.name}” to your OctoGenie files`, "success");
        }
      }
    } catch (e) {
      toast(`The summary could not be exported: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Research summary"
      onClose={onClose}
      wide="lg"
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">
            {entries} item{entries === 1 ? "" : "s"} in {report.sections.length} section{report.sections.length === 1 ? "" : "s"}
          </span>
          <Button disabled={busy || !entries} onClick={() => void run("files")}>
            Save Word copy to files
          </Button>
          <Button disabled={busy || !entries} onClick={() => void run("pdf")}>
            <FileDown className="size-4" aria-hidden /> Download PDF
          </Button>
          <Button variant="primary" disabled={busy || !entries} onClick={() => void run("docx")}>
            <FileDown className="size-4" aria-hidden /> Download Word
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title">
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
        </div>
        <Field label="Include">
          <select className={inputClass} value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="selected" disabled={!selectedPoints.length}>
              Selected cards ({selectedPoints.length})
            </option>
            <option value="filtered" disabled={!filteredIds}>
              Cards matching the filter{filteredIds ? ` (${filteredIds.length})` : ""}
            </option>
            <option value="all">All excerpts and notes</option>
          </select>
        </Field>
        <Field label="Organize by">
          <select className={inputClass} value={by} onChange={(e) => setBy(e.target.value as OrganizeBy)}>
            {ORGANIZE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        The summary is assembled only from your excerpts and notes, with document and page citations. Supporting and contradicting connections are listed under each item; the spatial arrangement of the workspace is not kept. It is not a verified legal analysis.
      </p>
      <div className="mt-3 max-h-[42vh] overflow-y-auto rounded-lg border border-slate-200 p-4" aria-label="Summary preview">
        <h3 className="font-serif text-lg font-semibold">{report.title}</h3>
        {report.sections.map((s) => (
          <section key={s.title} className="mt-3">
            <h4 className="font-semibold text-brand-700">{s.title}</h4>
            {s.subtitle && <p className="text-xs text-slate-500 italic">{s.subtitle}</p>}
            <ul className="mt-1 space-y-2">
              {s.entries.map((e, i) => (
                <li key={i} className="text-[13px]">
                  {e.kind === "note" ? (
                    <p>
                      <b>Note:</b> {e.text}
                    </p>
                  ) : (
                    <>
                      <p className="font-serif italic">“{e.quote}”</p>
                      <p className="text-xs text-slate-600">— {e.citation}</p>
                      {e.warning && <p className="text-xs font-medium text-red-700">Check source: {e.warning}</p>}
                    </>
                  )}
                  {e.contradicts.length > 0 && <p className="text-xs text-red-800">Contradicts / contradicted by: {e.contradicts.join("; ")}</p>}
                  {e.supports.length > 0 && <p className="text-xs text-green-800">Supports / supported by: {e.supports.join("; ")}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!entries && <p className="text-sm text-slate-500">Nothing to include yet.</p>}
      </div>
    </Dialog>
  );
}

export function ExportDialog({ ws, project, service, activeDocId, onSummary, onClose }: { ws: ResearchWorkspace; project: ProjectMeta; service: DocumentService; activeDocId: string | null; onSummary: () => void; onClose: () => void }) {
  const toast = useToast();
  const [docId, setDocId] = useState(activeDocId ?? ws.documents[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const base = safeName(project.name);
  const annotated = async () => {
    const doc = ws.documents.find((d) => d.id === docId);
    if (!doc) return;
    setBusy(true);
    try {
      const out = await exportAnnotatedPdf(await service.pdfBytes(doc.viewFileId, doc.viewRevision), ws, doc);
      download(out.pdf, `${safeName(doc.name.replace(/\.[^.]+$/, ""))} (annotated).pdf`, "application/pdf");
      toast(`Exported ${out.written} annotation${out.written === 1 ? "" : "s"}.${out.warnings.length ? ` ${out.warnings.join(" ")}` : ""}`, out.warnings.length ? "warning" : "success");
    } catch (e) {
      toast(`The annotated PDF could not be created: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const png = async () => {
    const svg = workspaceSvg(ws);
    const img = new window.Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      await new Promise((res, rej) => ((img.onload = res), (img.onerror = rej), (img.src = url)));
      const scale = Math.min(2, 8000 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
      if (blob) download(new Uint8Array(await blob.arrayBuffer()), `${base} workspace.png`, "image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const row = (icon: React.ReactNode, title: string, keeps: string, loses: string, action: React.ReactNode) => (
    <li className="flex flex-wrap items-start gap-3 border-b border-slate-100 py-3">
      <span className="mt-0.5 text-brand-600">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-600">
          <b>Keeps:</b> {keeps}
        </p>
        <p className="text-xs text-slate-600">
          <b>Doesn't keep:</b> {loses}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
    </li>
  );
  return (
    <Dialog title="Export" onClose={onClose} wide="lg">
      <ul>
        {row(<FileText className="size-5" />, "Research summary (Word or PDF)", "quotes, notes, citations by document and page, case details, supports/contradicts lists", "positions on the workspace, ink, interactive links", <Button variant="primary" onClick={() => (onClose(), onSummary())}>Build summary…</Button>)}
        {row(
          <FileDown className="size-5" />,
          "Annotated PDF",
          "highlights, underlines and comments as standard PDF annotations on a copy of the document",
          "workspace cards and connections; the original file is never changed",
          <>
            <select aria-label="Document to export" className="h-8 max-w-48 rounded-md border border-slate-300 px-1.5 text-xs" value={docId} onChange={(e) => setDocId(e.target.value)}>
              {ws.documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Button disabled={busy || !docId} onClick={() => void annotated()}>
              Download PDF
            </Button>
          </>,
        )}
        {row(
          <Image className="size-5" />,
          "Workspace snapshot",
          "the arrangement: groups, cards with citations, labelled connections, ink",
          "full card text beyond what fits, the ability to edit",
          <>
            <Button onClick={() => download(workspaceSvg(ws), `${base} workspace.svg`, "image/svg+xml")}>SVG</Button>
            <Button onClick={() => void png()}>PNG</Button>
          </>,
        )}
        {row(
          <FileJson className="size-5" />,
          "Project data (JSON)",
          "everything in the workspace: sources with page and coordinates, cards, connections, annotations, tags (format documented in docs/EXPORT_FORMAT.md)",
          "the document files themselves (they stay in your OctoGenie files)",
          <Button onClick={() => download(JSON.stringify(exportProjectData(project, ws), null, 2), `${base} project data.json`, "application/json")}>Download JSON</Button>,
        )}
      </ul>
    </Dialog>
  );
}

export function HistoryDialog({ revisions, current, onRestore, onClose }: { revisions: RevisionInfo[]; current: number; onRestore: (r: number) => void; onClose: () => void }) {
  return (
    <Dialog title="Workspace history" onClose={onClose} wide="md">
      <p className="mb-2 text-sm text-slate-600">Every save keeps a version (the last 100). Restoring a version saves it as the newest one; nothing is lost.</p>
      <ul>
        {revisions.map((r) => (
          <li key={r.revision} className="flex items-center gap-3 border-b border-slate-100 py-2 text-sm">
            <span className="w-14 text-slate-500 tabular-nums">#{r.revision}</span>
            <span className="flex-1">
              {new Date(r.createdAt).toLocaleString()} <span className="text-slate-500">· {r.note}</span>
            </span>
            {r.revision === current ? (
              <span className="text-xs text-slate-500">Current</span>
            ) : (
              <Button className="h-7 text-xs" onClick={() => (onRestore(r.revision), onClose())}>
                <RotateCcw className="size-3.5" aria-hidden /> Restore
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
