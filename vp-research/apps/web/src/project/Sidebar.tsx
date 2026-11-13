import {
  ACCEPT_ATTRIBUTE,
  citation,
  REVIEW_STATUSES,
  search,
  type Annotation,
  type DocumentIndex,
  type ResearchDocument,
  type ResearchWorkspace,
  type SearchHit,
} from "@octo/research";
import { AlertCircle, FileText, FileType2, Highlighter, Loader2, MessageSquare, MoreVertical, Plus, Quote, ScanText, Search, Trash2, Underline, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconButton, Menu, MenuItem } from "../components/ui";

export interface Job {
  documentId: string;
  message: string;
  fraction?: number;
}

/** Fixed-row virtual list: only rows near the viewport are in the DOM. */
function VirtualList<T>({ items, rowHeight, render, label }: { items: T[]; rowHeight: number; render: (item: T, i: number) => ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  useEffect(() => {
    const el = ref.current!;
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const first = Math.max(0, Math.floor(view.top / rowHeight) - 5);
  const last = Math.min(items.length, Math.ceil((view.top + view.height) / rowHeight) + 5);
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto" onScroll={(e) => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}>
      <ul aria-label={label} className="relative" style={{ height: items.length * rowHeight }}>
        {items.slice(first, last).map((item, k) => (
          <li key={first + k} className="absolute inset-x-0" style={{ top: (first + k) * rowHeight, height: rowHeight }}>
            {render(item, first + k)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const FORMAT_LABEL: Record<string, string> = { pdf: "PDF", docx: "Word", txt: "Text", md: "Markdown" };

function StatusBadge({ doc, job }: { doc: ResearchDocument; job?: Job }) {
  if (job || doc.status === "processing")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-brand-700">
        <Loader2 className="size-3 animate-spin" aria-hidden /> {job?.message ?? "Processing…"}
      </span>
    );
  if (doc.status === "error")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-red-700" title={doc.error}>
        <AlertCircle className="size-3" aria-hidden /> {doc.error ?? "Couldn't be processed"}
      </span>
    );
  if (doc.status === "needs-ocr")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
        <ScanText className="size-3" aria-hidden /> Scanned — no text yet
      </span>
    );
  const mode = doc.textMode === "ocr" ? "OCR text" : doc.textMode === "converted" ? "Converted" : "Native text";
  return (
    <span className="text-[11px] text-slate-500">
      {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"} · {mode}
    </span>
  );
}

export function DocumentsTab(props: {
  ws: ResearchWorkspace;
  jobs: Map<string, Job>;
  activeId: string | null;
  onOpen: (doc: ResearchDocument, split?: boolean) => void;
  onImport: (files: File[]) => void;
  onOcr: (doc: ResearchDocument) => void;
  onReplace: (doc: ResearchDocument, file: File) => void;
  onRename: (doc: ResearchDocument) => void;
  onRemove: (doc: ResearchDocument) => void;
  onRetry: (doc: ResearchDocument) => void;
}) {
  const { ws } = props;
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<ResearchDocument | null>(null);
  const [over, setOver] = useState(false);
  const docs = useMemo(() => ws.documents.filter((d) => (type === "all" || d.format === type) && (!q.trim() || `${d.name} ${d.short ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [ws.documents, q, type]);
  const counts = (id: string) => {
    const srcIds = new Set(Object.values(ws.sources).filter((s) => s.documentId === id).map((s) => s.id));
    return { excerpts: ws.cards.filter((c) => c.type === "excerpt" && srcIds.has(c.sourceId)).length, notes: ws.annotations.filter((a) => srcIds.has(a.sourceId)).length };
  };
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${over ? "bg-brand-50 ring-2 ring-brand-300 ring-inset" : ""}`}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        props.onImport(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="space-y-2 border-b border-slate-200 p-2">
        <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/60 px-3 py-2 text-[13px] font-medium text-brand-700 hover:bg-brand-50">
          <Upload className="size-4" aria-hidden /> Import documents
        </button>
        <input ref={input} type="file" multiple accept={ACCEPT_ATTRIBUTE} hidden aria-label="Choose documents to import" data-testid="import-input" onChange={(e) => (props.onImport(Array.from(e.target.files ?? [])), (e.target.value = ""))} />
        <input
          ref={replaceInput}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          hidden
          aria-label="Choose replacement file"
          data-testid="replace-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && replacing.current) props.onReplace(replacing.current, f);
            e.target.value = "";
          }}
        />
        <div className="flex gap-1.5">
          <input className="h-7 min-w-0 flex-1 rounded border border-slate-300 px-2 text-xs" placeholder="Filter documents" aria-label="Filter documents" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Document type" className="h-7 rounded border border-slate-300 px-1 text-xs" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            <option value="pdf">PDF</option>
            <option value="docx">Word</option>
            <option value="txt">Text</option>
            <option value="md">Markdown</option>
          </select>
        </div>
        <p className="text-[11px] text-slate-500">PDF, Word (.docx), text and Markdown. Drop files here.</p>
      </div>
      {!ws.documents.length ? (
        <p className="p-4 text-center text-[13px] text-slate-500">No documents yet.</p>
      ) : (
        <VirtualList
          label="Documents"
          items={docs}
          rowHeight={64}
          render={(d) => {
            const c = counts(d.id);
            const job = props.jobs.get(d.id);
            return (
              <div className={`group flex h-full items-start gap-2 border-b border-slate-100 px-2 py-2 ${props.activeId === d.id ? "bg-brand-50" : "hover:bg-slate-50"}`}>
                <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => props.onOpen(d)} aria-current={props.activeId === d.id}>
                  {d.format === "pdf" ? <FileText className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden /> : <FileType2 className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />}
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-slate-900" title={d.name}>
                      {d.short ? `${d.short} — ` : ""}
                      {d.name}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-600">{FORMAT_LABEL[d.format]}</span>
                      <StatusBadge doc={d} job={job} />
                    </span>
                    {(c.excerpts > 0 || c.notes > 0) && (
                      <span className="block text-[10.5px] text-slate-400">
                        {c.excerpts} excerpt{c.excerpts === 1 ? "" : "s"} · {c.notes} mark{c.notes === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                </button>
                <Menu label={`Actions for ${d.name}`} align="right" trigger={(t) => <IconButton label={`Actions for ${d.name}`} className="size-7" {...t}><MoreVertical className="size-4" aria-hidden /></IconButton>}>
                  {(close) => (
                    <>
                      <MenuItem onClick={() => (close(), props.onOpen(d))}>Open</MenuItem>
                      <MenuItem onClick={() => (close(), props.onOpen(d, true))}>Open side by side</MenuItem>
                      <MenuItem onClick={() => (close(), props.onRename(d))}>Citation label…</MenuItem>
                      {d.format === "pdf" && (
                        <MenuItem disabled={!!job} onClick={() => (close(), props.onOcr(d))}>
                          {d.textMode === "ocr" ? "Run OCR again" : "Recognise text (OCR)"}
                        </MenuItem>
                      )}
                      {d.status === "error" && <MenuItem onClick={() => (close(), props.onRetry(d))}>Try processing again</MenuItem>}
                      <MenuItem
                        disabled={!!job}
                        onClick={() => {
                          close();
                          replacing.current = d;
                          replaceInput.current?.click();
                        }}
                      >
                        Replace with new version…
                      </MenuItem>
                      <MenuItem danger onClick={() => (close(), props.onRemove(d))}>
                        <Trash2 className="size-4" aria-hidden /> Remove from project…
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}

export function SearchTab({ ws, indexes, pendingCount, activeId, onOpenHit, onExcerptHit, onQuery, onViewTogether }: { ws: ResearchWorkspace; indexes: DocumentIndex[]; pendingCount: number; activeId: string | null; onOpenHit: (hit: SearchHit) => void; onExcerptHit: (hit: SearchHit) => void; onQuery: (q: string) => void; onViewTogether: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [wholeWord, setWholeWord] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => onQuery(debounced), [debounced, onQuery]);
  const ids = scope === "all" ? undefined : scope === "current" ? (activeId ? [activeId] : []) : [scope];
  const result = useMemo(() => search(indexes, debounced, { ...(ids ? { documentIds: ids } : {}), wholeWord, limit: 400 }), [indexes, debounced, scope, wholeWord, activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDoc = new Map<string, SearchHit[]>();
  for (const h of result.hits) byDoc.set(h.documentId, [...(byDoc.get(h.documentId) ?? []), h]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-slate-200 p-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-slate-400" aria-hidden />
          <input autoFocus className="h-8 w-full rounded border border-slate-300 pr-2 pl-7 text-sm" placeholder="Search all documents" aria-label="Search all documents" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="flex items-center gap-2">
          <select aria-label="Search in" className="h-7 min-w-0 flex-1 rounded border border-slate-300 px-1 text-xs" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">All documents</option>
            <option value="current">Current document</option>
            {ws.documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> Whole words
          </label>
        </div>
        <p className="text-[11px] text-slate-500" aria-live="polite">
          {debounced.trim().length < 2 ? "Type at least 2 characters." : `${result.hits.length}${result.truncated ? "+" : ""} result${result.hits.length === 1 ? "" : "s"} in ${byDoc.size} document${byDoc.size === 1 ? "" : "s"}`}
          {pendingCount > 0 && ` · ${pendingCount} document${pendingCount === 1 ? " is" : "s are"} still being indexed`}
        </p>
        {result.hits.length > 0 && (
          <button type="button" className="w-full rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100" onClick={onViewTogether}>
            See all results together, in context
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {[...byDoc].map(([docId, hits]) => {
          const doc = ws.documents.find((d) => d.id === docId);
          return (
            <section key={docId} aria-label={`Results in ${doc?.name}`}>
              <h3 className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-2 py-1 text-[11.5px] font-semibold text-slate-700">
                {doc?.name} <span className="font-normal text-slate-500">({hits.length})</span>
              </h3>
              <ul>
                {hits.map((h, i) => (
                  <li key={i} className="group flex items-start border-b border-slate-100">
                    <button type="button" className="min-w-0 flex-1 px-2 py-1.5 text-left hover:bg-slate-50" onClick={() => onOpenHit(h)}>
                      <span className="text-[10.5px] font-semibold text-brand-700">p. {h.page + 1}</span>
                      <span className="block text-xs leading-snug text-slate-700">
                        {h.before}
                        <mark className="rounded-sm bg-yellow-200 px-0.5 text-slate-900">{h.match}</mark>
                        {h.after}
                      </span>
                    </button>
                    <IconButton label="Add as excerpt" className="mt-1 mr-1 size-7 opacity-60 group-hover:opacity-100" onClick={() => onExcerptHit(h)}>
                      <Plus className="size-3.5" aria-hidden />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const KIND_ICON = { highlight: Highlighter, underline: Underline, comment: MessageSquare };

export function AnnotationsTab({ ws, onOpen, onEdit }: { ws: ResearchWorkspace; onOpen: (a: Annotation) => void; onEdit: (a: Annotation, at: { x: number; y: number }) => void }) {
  const [kind, setKind] = useState("all");
  const [tag, setTag] = useState("all");
  const [status, setStatus] = useState("all");
  const list = ws.annotations
    .filter((a) => (kind === "all" || a.kind === kind) && (tag === "all" || a.tags.includes(tag)) && (status === "all" || a.status === status))
    .sort((a, b) => {
      const sa = ws.sources[a.sourceId];
      const sb = ws.sources[b.sourceId];
      return ws.documents.findIndex((d) => d.id === sa?.documentId) - ws.documents.findIndex((d) => d.id === sb?.documentId) || (sa?.page ?? 0) - (sb?.page ?? 0);
    });
  const excerpts = ws.cards.filter((c) => c.type === "excerpt").length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 p-2">
        <select aria-label="Annotation type" className="h-7 rounded border border-slate-300 px-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All marks</option>
          <option value="highlight">Highlights</option>
          <option value="underline">Underlines</option>
          <option value="comment">Comments</option>
        </select>
        <select aria-label="Tag" className="h-7 rounded border border-slate-300 px-1 text-xs" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="all">Any tag</option>
          {ws.tags.map((t) => (
            <option key={t.name}>{t.name}</option>
          ))}
        </select>
        <select aria-label="Status" className="h-7 rounded border border-slate-300 px-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Any status</option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="w-full text-[11px] text-slate-500">
          {list.length} mark{list.length === 1 ? "" : "s"} · {excerpts} excerpt{excerpts === 1 ? "" : "s"} on the workspace
        </p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Annotations">
        {list.map((a) => {
          const Icon = KIND_ICON[a.kind];
          const src = ws.sources[a.sourceId];
          return (
            <li key={a.id} className="border-b border-slate-100">
              <button type="button" className="w-full px-2 py-2 text-left hover:bg-slate-50" onClick={() => onOpen(a)} onContextMenu={(e) => (e.preventDefault(), onEdit(a, { x: e.clientX, y: e.clientY }))}>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  <Icon className="size-3.5" style={{ color: a.color === "#fde047" ? "#ca8a04" : a.color }} aria-hidden />
                  {citation(ws, a.sourceId)}
                  {a.status && <span className="ml-auto rounded-full px-1.5 text-[10px] text-white" style={{ background: REVIEW_STATUSES.find((s) => s.id === a.status)?.color }}>{REVIEW_STATUSES.find((s) => s.id === a.status)?.label}</span>}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-slate-700 italic">“{src?.quote}”</span>
                {a.note && <span className="mt-0.5 block text-xs text-slate-900">{a.note}</span>}
              </button>
            </li>
          );
        })}
        {!list.length && (
          <li className="p-4 text-center text-[13px] text-slate-500">
            <Quote className="mx-auto mb-1 size-5 text-slate-300" aria-hidden />
            Highlights, underlines and comments you add to documents appear here.
          </li>
        )}
      </ul>
    </div>
  );
}
