import { formatBytes, formatRelativeTime, FORMATS } from "@octo/core";
import type { FileRecord } from "@octo/storage";
import { Copy, Download, ExternalLink, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileIcon } from "../components/FileIcon";

export type FileAction = "open" | "rename" | "duplicate" | "download" | "delete";
export type ViewMode = "grid" | "list";

interface FileBrowserProps {
  files: FileRecord[];
  view: ViewMode;
  onAction: (action: FileAction, file: FileRecord) => void;
  /** Id of a file that should receive focus (for example, after creation). */
  focusId?: string | null;
}

const MENU_ITEMS: { action: FileAction; label: string; icon: typeof Copy; shortcut?: string }[] = [
  { action: "open", label: "Open", icon: ExternalLink, shortcut: "Enter" },
  { action: "rename", label: "Rename", icon: Pencil, shortcut: "F2" },
  { action: "duplicate", label: "Duplicate", icon: Copy },
  { action: "download", label: "Download", icon: Download },
  { action: "delete", label: "Delete", icon: Trash2, shortcut: "Del" },
];

function ActionsMenu({ file, onAction, onClose, trigger }: { file: FileRecord; onAction: FileBrowserProps["onAction"]; onClose: () => void; trigger: HTMLElement | null }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [onClose, trigger]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => items[(to + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
    else if (event.key === "Escape" || event.key === "Tab") {
      onClose();
      trigger?.focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={menu}
      role="menu"
      aria-label={`Actions for ${file.name}`}
      onKeyDown={onKeyDown}
      className="absolute right-2 top-10 z-30 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
    >
      {MENU_ITEMS.map(({ action, label, icon: Icon, shortcut }) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            onClose();
            onAction(action, file);
          }}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none ${
            action === "delete" ? "text-red-700" : "text-slate-800"
          }`}
        >
          <Icon aria-hidden className="size-4" />
          <span className="flex-1">{label}</span>
          {shortcut && <kbd className="text-xs text-slate-400">{shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}

/**
 * File grid/list with roving focus: one item is in the tab order; arrow keys
 * move between items, Enter opens, F2 renames, Delete deletes and
 * Shift+F10 or the context-menu key opens the actions menu.
 */
export function FileBrowser({ files, view, onAction, focusId }: FileBrowserProps) {
  const [active, setActive] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const container = useRef<HTMLUListElement>(null);
  const menuTriggers = useRef(new Map<string, HTMLButtonElement>());

  const clamped = Math.min(active, Math.max(files.length - 1, 0));

  useLayoutEffect(() => {
    if (!focusId) return;
    const index = files.findIndex((f) => f.id === focusId);
    if (index >= 0) {
      setActive(index);
      container.current?.querySelectorAll<HTMLElement>("[data-file-open]")[index]?.focus();
    }
  }, [focusId, files]);

  const focusItem = (index: number) => {
    const next = Math.max(0, Math.min(index, files.length - 1));
    setActive(next);
    container.current?.querySelectorAll<HTMLElement>("[data-file-open]")[next]?.focus();
  };

  const columns = (): number => {
    if (view === "list" || !container.current) return 1;
    const items = Array.from(container.current.children) as HTMLElement[];
    const top = items[0]?.offsetTop;
    const perRow = items.filter((el) => el.offsetTop === top).length;
    return Math.max(1, perRow);
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number, file: FileRecord) => {
    switch (event.key) {
      case "ArrowRight":
        focusItem(index + 1);
        break;
      case "ArrowLeft":
        focusItem(index - 1);
        break;
      case "ArrowDown":
        focusItem(index + columns());
        break;
      case "ArrowUp":
        focusItem(index - columns());
        break;
      case "Home":
        focusItem(0);
        break;
      case "End":
        focusItem(files.length - 1);
        break;
      case "F2":
        onAction("rename", file);
        break;
      case "Delete":
        onAction("delete", file);
        break;
      case "ContextMenu":
        setMenuFor(file.id);
        break;
      case "F10":
        if (!event.shiftKey) return;
        setMenuFor(file.id);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const listClass =
    view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3" : "flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white";

  return (
    <ul ref={container} className={listClass} aria-label="Files">
      {files.map((file, index) => {
        const isActive = index === clamped;
        const meta = `${FORMATS[file.format].label} · ${formatBytes(file.size)} · Edited ${formatRelativeTime(file.updatedAt)}`;
        return (
          <li
            key={file.id}
            className={`group relative ${view === "grid" ? "rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md" : ""}`}
            onContextMenu={(e) => {
              e.preventDefault();
              setActive(index);
              setMenuFor(file.id);
            }}
          >
            <button
              type="button"
              data-file-open
              tabIndex={isActive ? 0 : -1}
              onFocus={() => setActive(index)}
              onClick={() => onAction("open", file)}
              onKeyDown={(e) => onKeyDown(e, index, file)}
              aria-label={`${file.name}, ${meta}`}
              className={`flex w-full items-center gap-3 text-left focus-visible:outline-offset-[-2px] ${
                view === "grid" ? "flex-col items-start rounded-xl p-4" : "px-4 py-3 pr-14 hover:bg-slate-50"
              }`}
            >
              <FileIcon kind={file.kind} format={file.format} size={view === "grid" ? "lg" : "md"} />
              {/* In grid view the button is a column with items-start, so the text needs an explicit full width to truncate. */}
              <span className={`min-w-0 flex-1 ${view === "grid" ? "w-full" : ""}`}>
                <span className="block truncate font-medium text-slate-900" title={file.name}>
                  {file.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{meta}</span>
              </span>
            </button>
            <button
              type="button"
              ref={(el) => {
                if (el) menuTriggers.current.set(file.id, el);
                else menuTriggers.current.delete(file.id);
              }}
              tabIndex={isActive ? 0 : -1}
              aria-haspopup="menu"
              aria-expanded={menuFor === file.id}
              aria-label={`More actions for ${file.name}`}
              onClick={() => setMenuFor(menuFor === file.id ? null : file.id)}
              className="absolute right-2 top-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <MoreVertical aria-hidden className="size-4" />
            </button>
            {menuFor === file.id && (
              <ActionsMenu file={file} onAction={onAction} onClose={() => setMenuFor(null)} trigger={menuTriggers.current.get(file.id) ?? null} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
