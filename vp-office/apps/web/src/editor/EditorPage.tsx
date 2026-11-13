import { formatBytes, formatRelativeTime, FORMATS } from "@octo/core";
import { NotFoundError, type DraftRecord, type FileRecord, type RevisionRecord } from "@octo/storage";
import { ArrowLeft, Download } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/Dialog";
import { FileIcon } from "../components/FileIcon";
import { useToast } from "../components/Toasts";
import { downloadFile, editorFor } from "../lib/files";
import { useRepository } from "../lib/repository";
import { PlainTextEditor } from "./PlainTextEditor";

// The document editor is large; load it only when a DOCX is opened.
const DocxEditorPage = lazy(() => import("./DocxEditorPage").then((m) => ({ default: m.DocxEditorPage })));
const PdfEditorPage = lazy(() => import("./PdfEditorPage").then((m) => ({ default: m.PdfEditorPage })));
const SheetEditorPage = lazy(() => import("./SheetEditorPage").then((m) => ({ default: m.SheetEditorPage })));
const SlidesEditorPage = lazy(() => import("./SlidesEditorPage").then((m) => ({ default: m.SlidesEditorPage })));
const WorkspacePage = lazy(() => import("./WorkspacePage").then((m) => ({ default: m.WorkspacePage })));

type LoadState =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error" }
  | { state: "ready"; file: FileRecord; content: Uint8Array; draft?: DraftRecord; revisions: RevisionRecord[] };

export function EditorPage() {
  const { id = "" } = useParams();
  const repo = useRepository();
  const [load, setLoad] = useState<LoadState>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    (async () => {
      const file = await repo.get(id);
      const [content, draft, revisions] = await Promise.all([repo.getContent(id), repo.getDraft(id), repo.listRevisions(id)]);
      if (!cancelled) setLoad({ state: "ready", file, content, revisions, ...(draft ? { draft } : {}) });
    })().catch((error: unknown) => {
      if (!cancelled) setLoad({ state: error instanceof NotFoundError ? "missing" : "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [repo, id]);

  if (load.state === "loading") return <p className="p-8 text-sm text-slate-500">Opening file…</p>;
  if (load.state !== "ready") {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">{load.state === "missing" ? "File not found" : "The file could not be opened"}</h1>
        <p className="mt-1 text-sm text-slate-600">{load.state === "missing" ? "It may have been deleted." : "Browser storage may be unavailable."}</p>
        <Link to="/" className="mt-4 inline-block font-medium text-brand-600 hover:underline">
          Back to files
        </Link>
      </div>
    );
  }

  if (load.file.format === "docx" || load.file.format === "md" || load.file.format === "rtf") {
    return (
      <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading the document editor…</p>}>
        <DocxEditorPage key={load.file.id} file={load.file} content={load.content} draft={load.draft} />
      </Suspense>
    );
  }
  if (load.file.format === "xlsx" || load.file.format === "csv") {
    return (
      <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading the spreadsheet editor…</p>}>
        <SheetEditorPage key={load.file.id} file={load.file} content={load.content} draft={load.draft} />
      </Suspense>
    );
  }
  if (load.file.format === "pptx") {
    return (
      <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading the presentation editor…</p>}>
        <SlidesEditorPage key={load.file.id} file={load.file} content={load.content} draft={load.draft} />
      </Suspense>
    );
  }
  if (load.file.format === "octows") {
    return (
      <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading the case workspace…</p>}>
        <WorkspacePage key={load.file.id} file={load.file} content={load.content} draft={load.draft} />
      </Suspense>
    );
  }
  if (load.file.format === "pdf") {
    return (
      <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading the PDF editor…</p>}>
        <PdfEditorPage key={load.file.id} file={load.file} content={load.content} draft={load.draft} />
      </Suspense>
    );
  }
  if (editorFor(load.file).available) {
    return <PlainTextEditor key={load.file.id} file={load.file} content={load.content} draft={load.draft} />;
  }
  return <ModulePlaceholder file={load.file} revisions={load.revisions} />;
}

export function EditorHeader({ file, children }: { file: FileRecord; children?: React.ReactNode }) {
  return (
    <header data-print-hide className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
      <Link to="/" className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Back to files">
        <ArrowLeft aria-hidden className="size-5" />
      </Link>
      <FileIcon kind={file.kind} size="sm" />
      <h1 className="min-w-0 truncate font-medium text-slate-900" title={file.name}>
        {file.name}
      </h1>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  );
}

function ModulePlaceholder({ file, revisions }: { file: FileRecord; revisions: RevisionRecord[] }) {
  const repo = useRepository();
  const toast = useToast();
  const editor = editorFor(file);
  const download = () => downloadFile(repo, file).catch(() => toast("The file could not be downloaded.", "error"));

  return (
    <div className="flex h-full flex-col">
      <EditorHeader file={file}>
        <Button onClick={download}>
          <Download aria-hidden className="size-4" />
          Download
        </Button>
      </EditorHeader>
      <main className="flex flex-1 items-start justify-center overflow-y-auto p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="flex justify-center">
            <FileIcon kind={file.kind} format={file.format} size="lg" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">{file.name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {FORMATS[file.format].label} · {formatBytes(file.size)} · revision {file.revision}
          </p>
          {!editor.available && (
            <p className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              Editing in the {editor.module} isn't available yet; it's planned for milestone {editor.milestone}. Your file is stored unchanged and you can
              download it at any time.
            </p>
          )}
          {revisions.length > 0 && (
            <div className="mt-6 text-left">
              <h3 className="text-sm font-semibold text-slate-700">Version history</h3>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {revisions.map((r) => (
                  <li key={r.revision} className="flex justify-between py-1.5 text-slate-600">
                    <span>
                      Revision {r.revision} · {r.note}
                    </span>
                    <span>{formatRelativeTime(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
