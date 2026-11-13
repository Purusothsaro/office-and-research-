import {
  CARD_COLORS,
  citation,
  passageLinksOf,
  relationsOf,
  GROUP_CATEGORIES,
  HIGHLIGHT_COLORS,
  RELATIONS,
  REVIEW_STATUSES,
  type AlignMode,
  type Annotation,
  type Card,
  type Connector,
  type GroupCategory,
  type Relation,
  type ResearchWorkspace,
  type ReviewStatus,
  type Sheet,
} from "@octo/research";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Columns2,
  Copy,
  Group,
  Link2,
  Quote,
  Trash2,
  Ungroup,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, Dialog, IconButton, inputClass, Menu, MenuItem } from "../components/ui";

/** Positions a floating panel at a screen point, kept inside the window. */
function Floating({ at, onClose, children, label, width = 300 }: { at: { x: number; y: number }; onClose: () => void; children: ReactNode; label: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)) });
  }, [at.x, at.y]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-label={label} className="fixed z-50 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl" style={{ ...pos, width }}>
      {children}
    </div>
  );
}

export function TagInput({ ws, value, onChange }: { ws: ResearchWorkspace; value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => {
    const clean = t.trim();
    if (clean && !value.includes(clean)) onChange([...value, clean]);
    setDraft("");
  };
  const suggestions = ws.tags.filter((t) => !value.includes(t.name) && (!draft || t.name.toLowerCase().includes(draft.toLowerCase()))).slice(0, 8);
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ background: ws.tags.find((x) => x.name === t)?.color ?? "#64748b" }}>
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <input
        className={`${inputClass} mt-1.5 h-8`}
        placeholder="Add a tag (e.g. witness, exhibit, issue) and press Enter"
        aria-label="Add tag"
        value={draft}
        maxLength={40}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
          if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
      />
      {suggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {suggestions.map((t) => (
            <button key={t.name} type="button" className="rounded border border-slate-200 px-1.5 text-[11px] text-slate-600 hover:bg-slate-100" onClick={() => add(t.name)}>
              + {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusSelect({ value, onChange, label = "Review status" }: { value?: ReviewStatus; onChange: (s: ReviewStatus | undefined) => void; label?: string }) {
  return (
    <select aria-label={label} className="h-8 rounded-md border border-slate-300 bg-white px-1.5 text-xs" value={value ?? ""} onChange={(e) => onChange((e.target.value || undefined) as ReviewStatus | undefined)}>
      <option value="">No status</option>
      {REVIEW_STATUSES.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function AnnotationPopover({ ws, annotation, at, onClose, onChange, onTags, onDelete, onToWorkspace }: { ws: ResearchWorkspace; annotation: Annotation; at: { x: number; y: number }; onClose: () => void; onChange: (patch: Partial<Annotation>) => void; onTags: (tags: string[]) => void; onDelete: () => void; onToWorkspace: () => void }) {
  const src = ws.sources[annotation.sourceId];
  const [note, setNote] = useState(annotation.note ?? "");
  const save = () => note !== (annotation.note ?? "") && onChange({ note });
  const label = annotation.kind === "comment" ? "Comment" : annotation.kind === "underline" ? "Underline" : "Highlight";
  return (
    <Floating at={at} onClose={() => (save(), onClose())} label={label}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">
          {label} · p. {(src?.page ?? 0) + 1}
        </span>
        <select aria-label="Mark type" className="ml-auto h-7 rounded border border-slate-300 px-1 text-xs" value={annotation.kind} onChange={(e) => onChange({ kind: e.target.value as Annotation["kind"] })}>
          <option value="highlight">Highlight</option>
          <option value="underline">Underline</option>
          <option value="comment">Comment</option>
        </select>
      </div>
      <blockquote className="my-2 line-clamp-4 border-l-2 border-slate-300 pl-2 font-serif text-xs text-slate-600 italic">“{src?.quote}”</blockquote>
      <textarea
        autoFocus={annotation.kind === "comment"}
        aria-label="Comment text"
        className={`${inputClass} min-h-16 text-[13px]`}
        placeholder={annotation.kind === "comment" ? "Write a comment" : "Add a margin note (optional)"}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
      />
      <div className="mt-2 flex items-center gap-1.5">
        {(annotation.kind === "highlight" ? HIGHLIGHT_COLORS : ["#2563eb", "#7dd3fc", "#16a34a", "#dc2626", "#9333ea"]).map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} className={`size-5 rounded border ${annotation.color === c ? "ring-2 ring-brand-500 ring-offset-1" : "border-black/10"}`} style={{ background: c }} onClick={() => onChange({ color: c })} />
        ))}
        <span className="ml-auto">
          <StatusSelect value={annotation.status} onChange={(status) => onChange(status ? { status } : { status: undefined })} />
        </span>
      </div>
      <div className="mt-2">
        <TagInput ws={ws} value={annotation.tags} onChange={onTags} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button className="h-7 text-xs" onClick={() => (save(), onToWorkspace(), onClose())}>
          <Quote className="size-3.5" aria-hidden /> To workspace
        </Button>
        <Button className="h-7 text-xs text-red-700" onClick={() => (onDelete(), onClose())}>
          <Trash2 className="size-3.5" aria-hidden /> Delete
        </Button>
      </div>
    </Floating>
  );
}

export function ContextMenu({ at, onClose, children }: { at: { x: number; y: number }; onClose: () => void; children: ReactNode }) {
  return (
    <Floating at={at} onClose={onClose} label="Context menu" width={230}>
      <div role="menu" className="-m-2 flex flex-col" onClick={onClose}>
        {children}
      </div>
    </Floating>
  );
}

export function CtxItem({ children, onClick, danger, hint }: { children: ReactNode; onClick: () => void; danger?: boolean; hint?: string }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${danger ? "text-red-700 hover:bg-red-50" : "text-slate-800 hover:bg-slate-100"}`}>
      {children}
      {hint && <span className="ml-auto text-[11px] text-slate-400">{hint}</span>}
    </button>
  );
}

const ALIGN: { mode: AlignMode; label: string; icon: typeof AlignStartVertical }[] = [
  { mode: "left", label: "Align left", icon: AlignStartVertical },
  { mode: "center-x", label: "Align centres horizontally", icon: AlignCenterVertical },
  { mode: "right", label: "Align right", icon: AlignEndVertical },
  { mode: "top", label: "Align top", icon: AlignStartHorizontal },
  { mode: "center-y", label: "Align centres vertically", icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom", icon: AlignEndHorizontal },
  { mode: "distribute-x", label: "Distribute horizontally", icon: AlignHorizontalDistributeCenter },
  { mode: "distribute-y", label: "Distribute vertically", icon: AlignVerticalDistributeCenter },
];

/** Floating bar for the current canvas selection. */
export function SelectionBar(props: {
  ws: ResearchWorkspace;
  cards: Card[];
  connector: Connector | null;
  onColor: (c: string) => void;
  onStatus: (s: ReviewStatus | undefined) => void;
  onTags: () => void;
  onAlign: (m: AlignMode) => void;
  onGroup: () => void;
  onConnect: (r: Relation) => void;
  onCompare: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSeparate: () => void;
  /** Number of connections of the single selected card (shown as a button that opens the relationships panel). */
  relations?: number;
  relationsOpen?: boolean;
  onRelations?: () => void;
  onEdit: () => void;
  onCategory: (c: GroupCategory) => void;
  onConnector: (patch: Partial<Pick<Connector, "relation" | "label">>) => void;
  commenting: boolean;
  onComment: () => void;
  onSaveComment: (text: string) => void;
  onCopy: () => void;
  onCut: () => void;
  onCopyLink: () => void;
  /** Child workspaces of the current one, and its parent, for "To Child Workspace". */
  childSheets: Sheet[];
  parentSheet: Sheet | null;
  /** Move the selection to a workspace (null: make a new child workspace). */
  onToSheet: (id: string | null) => void;
  onFontSize: (px: number) => void;
}) {
  const { cards, connector } = props;
  if (connector)
    return (
      <div role="toolbar" aria-label="Connection" className="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-lg">
        <select aria-label="Relationship" className="h-8 rounded-md border border-slate-300 px-1.5 text-xs" value={connector.relation} onChange={(e) => props.onConnector({ relation: e.target.value as Relation })}>
          {RELATIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          key={`${connector.id}:${connector.label ?? ""}`}
          aria-label="Connection label"
          className="h-8 w-44 rounded-md border border-slate-300 px-2 text-xs"
          placeholder="Label (optional)"
          defaultValue={connector.label ?? ""}
          maxLength={80}
          onBlur={(e) => props.onConnector({ label: e.currentTarget.value.trim() })}
          onKeyDown={(e) => e.key === "Enter" && props.onConnector({ label: e.currentTarget.value.trim() })}
        />
        <IconButton label="Delete connection" onClick={props.onDelete}>
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
      </div>
    );
  if (!cards.length) return null;
  const excerpts = cards.filter((c) => c.type === "excerpt");
  const single = cards.length === 1 ? cards[0]! : null;
  const text = "inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40";
  return (
    <div role="toolbar" aria-label="Selection" className="absolute inset-x-0 top-0 z-30 flex flex-col border-b border-brand-200 bg-white shadow-md">
      {/* Takes over the workspace toolbar strip while cards are selected, so it never covers them. */}
      <div className="flex items-center gap-0.5 overflow-x-auto px-1.5 py-1 whitespace-nowrap [scrollbar-width:thin]">
        <span className="px-1 text-xs font-medium text-slate-500">{cards.length === 1 ? (single!.type === "group" ? "Group" : single!.type === "excerpt" ? "Excerpt" : "Note") : `${cards.length} selected`}</span>
        <button type="button" className={text} onClick={props.onComment} disabled={!single || single.type === "group"} aria-label="Comment" title="Attach a comment to this card">
          Comment
        </button>
        <button type="button" className={text} onClick={props.onEdit} disabled={!single || single.type === "group"} aria-label="Edit excerpt text" title="Edit the card's wording (the source is kept)">
          Edit
        </button>
        <button type="button" className={text} onClick={props.onCopy} aria-label="Copy" title="Copy the text with its citation">
          Copy
        </button>
        <button type="button" className={text} onClick={props.onCut} aria-label="Cut" title="Copy, then remove from the workspace">
          Cut
        </button>
        <button type="button" className={text} onClick={props.onCopyLink} disabled={!single} aria-label="Copy link" title="Copy a link that opens this card">
          Copy Link
        </button>
        <Menu
          label="To child workspace"
          trigger={(t) => (
            <button type="button" className={text} {...t} aria-label="To child workspace" title="Move to a child workspace">
              To Child Workspace
            </button>
          )}
        >
          {(close) => (
            <>
              {props.childSheets.map((sh) => (
                <MenuItem key={sh.id} onClick={() => (close(), props.onToSheet(sh.id))}>
                  {sh.name}
                </MenuItem>
              ))}
              {props.parentSheet && (
                <MenuItem onClick={() => (close(), props.onToSheet(props.parentSheet!.id))}>Back to “{props.parentSheet.name}”</MenuItem>
              )}
              <MenuItem onClick={() => (close(), props.onToSheet(null))}>New child workspace…</MenuItem>
            </>
          )}
        </Menu>
        <button type="button" className={`${text} text-red-700`} onClick={props.onDelete} aria-label="Delete selected" title="Delete (Del)">
          Delete
        </button>
        <button type="button" className={text} onClick={props.onTags} aria-label="Tags" title="Tags">
          Tags
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {single?.type === "group" ? (
          <select aria-label="Group type" className="h-8 rounded-md border border-slate-300 px-1.5 text-xs" value={single.category} onChange={(e) => props.onCategory(e.target.value as GroupCategory)}>
            {GROUP_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-1" role="group" aria-label="Colour">
            {CARD_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} className="size-6 rounded-full border border-black/15 shadow-inner" style={{ background: c }} onClick={() => props.onColor(c)} />
            ))}
          </div>
        )}
        <Menu
          label="Text size"
          align="right"
          trigger={(t) => (
            <IconButton label="Text size" {...t}>
              <span className="text-[13px] font-semibold">
                T<span className="text-[10px]">T</span>
              </span>
            </IconButton>
          )}
        >
          {(close) =>
            [
              [11, "Small"],
              [13, "Normal"],
              [16, "Large"],
              [20, "Extra large"],
            ].map(([n, l]) => (
              <MenuItem key={n} onClick={() => (close(), props.onFontSize(n as number))}>
                <span style={{ fontSize: n as number }}>{l}</span>
              </MenuItem>
            ))
          }
        </Menu>
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
        <StatusSelect value={single?.status} onChange={props.onStatus} />
        {cards.length >= 2 && (
          <>
            {ALIGN.map((a) => (
              <IconButton key={a.mode} label={a.label} className="size-7" onClick={() => props.onAlign(a.mode)}>
                <a.icon className="size-4" aria-hidden />
              </IconButton>
            ))}
            <Button variant="ghost" className="h-8 px-2 text-xs" onClick={props.onGroup}>
              <Group className="size-4" aria-hidden /> Group
            </Button>
          </>
        )}
        {cards.length === 2 && (
          <select aria-label="Connect selected cards" className="h-8 rounded-md border border-slate-300 px-1.5 text-xs" value="" onChange={(e) => e.target.value && props.onConnect(e.target.value as Relation)}>
            <option value="">Connect as…</option>
            {RELATIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        )}
        {excerpts.length >= 2 && (
          <Button variant="ghost" className="h-8 px-2 text-xs" onClick={props.onCompare}>
            <Columns2 className="size-4" aria-hidden /> Compare
          </Button>
        )}
        {single && props.onRelations && (
          <Button variant="toolbar" on={props.relationsOpen} aria-pressed={props.relationsOpen} className="h-8 px-2 text-xs" onClick={props.onRelations} title="Show what this card is connected to and where it came from">
            <Link2 className="size-4" aria-hidden /> Connections ({props.relations ?? 0})
          </Button>
        )}
        {cards.some((c) => c.stack) && (
          <Button variant="ghost" className="h-8 px-2 text-xs" onClick={props.onSeparate} title="Take the selected cards out of their merged stack (or Alt+drag one out)">
            <Ungroup className="size-4" aria-hidden /> Separate
          </Button>
        )}
        <IconButton label="Duplicate" onClick={props.onDuplicate}>
          <Copy className="size-4" aria-hidden />
        </IconButton>
      </div>
      {props.commenting && single && (
        <div className="flex items-center gap-1.5 border-t border-slate-100 px-2 py-1">
          <input
            autoFocus
            aria-label="Card comment"
            className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm"
            placeholder="Write a comment for this card"
            defaultValue={single.comment ?? ""}
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.onSaveComment(e.currentTarget.value.trim());
              if (e.key === "Escape") props.onSaveComment(single.comment ?? "");
            }}
            onBlur={(e) => props.onSaveComment(e.currentTarget.value.trim())}
          />
        </div>
      )}
    </div>
  );
}

export function TagsDialog({ ws, title, value, onSave, onClose }: { ws: ResearchWorkspace; title: string; value: string[]; onSave: (tags: string[]) => void; onClose: () => void }) {
  const [tags, setTags] = useState(value);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => (onSave(tags), onClose())}>
            Save tags
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm text-slate-600">Tags organize material by witness, document, evidence category or anything else. Filter and summarize by them later.</p>
      <TagInput ws={ws} value={tags} onChange={setTags} />
    </Dialog>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["Add excerpt from selected text", "Select text → Add excerpt, or drag it onto the workspace"],
    ["New note", "N, or double-click the workspace"],
    ["Merge cards", "Drag an excerpt or note onto another and release"],
    ["Take a card out of a merged stack", "Alt+drag it out, or Separate"],
    ["Group selected cards", "G"],
    ["Connect two cards", "C, then click both cards"],
    ["Pen", "P"],
    ["Select several", "Shift+click, or Shift+drag on the workspace"],
    ["Select all", "Ctrl+A"],
    ["Duplicate", "Ctrl+D"],
    ["Delete", "Delete or Backspace"],
    ["Move selection", "Arrow keys (Shift for 10×)"],
    ["Undo / redo", "Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y"],
    ["Fit workspace", "F"],
    ["Zoom workspace", "Ctrl+scroll"],
    ["Search all documents", "Ctrl+Shift+F"],
    ["Find in document", "Ctrl+F in the viewer"],
    ["Next / previous page", "Page Down / Page Up in the viewer"],
    ["Cancel", "Esc"],
  ];
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} wide="md">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-b border-slate-100">
              <td className="py-1.5 pr-4 text-slate-700">{a}</td>
              <td className="py-1.5 text-slate-900">
                <kbd className="font-sans">{b}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

/**
 * What the selected card is connected to and where it came from, one tap away:
 * its source passage, each connection (type and the card at the other end),
 * and a way to gather the connected cards beside it.
 */
export function RelationsPanel({ ws, card, onOpenSource, onShowCard, onGather, onClose }: { ws: ResearchWorkspace; card: Card; onOpenSource: (sourceId: string) => void; onShowCard: (id: string) => void; onGather: () => void; onClose: () => void }) {
  const relations = relationsOf(ws, card.id);
  const passages = passageLinksOf(ws, card.id);
  const snippet = (c: Card) => {
    const t = c.type === "group" ? c.title || "Untitled group" : c.text.replace(/\s+/g, " ").trim() || "(empty note)";
    return t.length > 110 ? `${t.slice(0, 107)}…` : t;
  };
  const src = card.type === "excerpt" ? ws.sources[card.sourceId] : undefined;
  return (
    <aside aria-label="Relationships" className="absolute right-3 bottom-3 z-30 flex max-h-[min(60%,520px)] w-[min(330px,calc(100%-24px))] flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
      <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <span className="text-xs font-semibold text-slate-800">{card.type === "excerpt" ? "Excerpt" : card.type === "note" ? "Note" : "Group"}</span>
        <span className="text-[11px] text-slate-500">
          {relations.length + passages.length} connection{relations.length + passages.length === 1 ? "" : "s"}
        </span>
        <IconButton label="Close relationships" className="ml-auto size-7" onClick={onClose}>
          <X className="size-3.5" aria-hidden />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {card.type === "excerpt" && (
          <section aria-label="Original context" className="mb-2">
            <h3 className="text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase">Original context</h3>
            <blockquote className="mt-1 line-clamp-3 border-l-2 border-brand-200 pl-2 font-serif text-xs text-slate-700 italic">“{src?.quote}”</blockquote>
            <button type="button" className="mt-1 text-[11.5px] font-semibold text-brand-700 hover:underline" onClick={() => onOpenSource(card.sourceId)}>
              {citation(ws, card.sourceId)} ↗
            </button>
          </section>
        )}
        {passages.length > 0 && (
          <section aria-label="Linked passages" className="mb-2">
            <h3 className="text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase">Linked passages</h3>
            <ul className="mt-1 space-y-1.5">
              {passages.map(({ link, annotation, source }) => {
                const rel = RELATIONS.find((r) => r.id === link.relation) ?? RELATIONS[3]!;
                return (
                  <li key={link.id} className="rounded-lg border border-slate-100 p-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full px-1.5 text-[10px] font-semibold text-white" style={{ background: rel.color }}>
                        {link.label?.trim() || rel.label}
                      </span>
                      <button type="button" className="ml-auto text-[10.5px] font-semibold text-brand-700 hover:underline" onClick={() => onOpenSource(annotation.sourceId)} aria-label={`Open linked passage: ${citation(ws, annotation.sourceId)}`}>
                        {citation(ws, annotation.sourceId)} ↗
                      </button>
                    </div>
                    <p className="mt-0.5 line-clamp-2 font-serif text-xs text-slate-700 italic">“{source.quote}”</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <section aria-label="Connections">
          <h3 className="text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase">Connections</h3>
          {!relations.length && !passages.length && <p className="mt-1 text-xs text-slate-500">None yet. Use Connect (C), or select two cards and choose “Connect as…”.</p>}
          <ul className="mt-1 space-y-1.5">
            {relations.map(({ connector, other }) => {
              const rel = RELATIONS.find((r) => r.id === connector.relation) ?? RELATIONS[3]!;
              return (
                <li key={connector.id} className="rounded-lg border border-slate-100 p-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full px-1.5 text-[10px] font-semibold text-white" style={{ background: rel.color }}>
                      {connector.label?.trim() || rel.label}
                    </span>
                    {other.type === "excerpt" && (
                      <button type="button" className="ml-auto text-[10.5px] font-semibold text-brand-700 hover:underline" onClick={() => onOpenSource(other.sourceId)} aria-label={`Open source: ${citation(ws, other.sourceId)}`}>
                        {citation(ws, other.sourceId)} ↗
                      </button>
                    )}
                  </div>
                  <button type="button" className="mt-0.5 block w-full text-left text-xs text-slate-700 hover:text-ink-900" onClick={() => onShowCard(other.id)} aria-label={`Show on workspace: ${snippet(other)}`}>
                    {other.type === "excerpt" ? <span className="font-serif italic">“{snippet(other)}”</span> : snippet(other)}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {relations.length > 0 && (
        <footer className="border-t border-slate-100 px-3 py-2">
          <Button className="h-7 w-full text-xs" onClick={onGather} title="Move the connected cards into a column beside this one">
            Gather connected cards here
          </Button>
        </footer>
      )}
    </aside>
  );
}
