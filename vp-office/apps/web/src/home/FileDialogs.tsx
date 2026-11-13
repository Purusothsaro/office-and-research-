import { baseName, extensionOf } from "@octo/core";
import type { FileRecord } from "@octo/storage";
import { useRef, useState } from "react";
import { Button, Dialog } from "../components/Dialog";

export function RenameDialog({ file, onCancel, onRename }: { file: FileRecord; onCancel: () => void; onRename: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(baseName(file.name));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onRename(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Rename file"
      onClose={onCancel}
      initialFocus={input}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" type="submit" form="rename-form" disabled={!trimmed || busy}>
            Rename
          </Button>
        </>
      }
    >
      <form id="rename-form" onSubmit={submit}>
        <label htmlFor="rename-input" className="mb-1.5 block font-medium text-slate-800">
          Name
        </label>
        <div className="flex items-center rounded-md border border-slate-300 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100">
          <input
            id="rename-input"
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            maxLength={190}
            className="min-w-0 flex-1 rounded-l-md px-3 py-2 outline-none"
            aria-describedby="rename-ext"
          />
          <span id="rename-ext" className="px-3 text-slate-500">
            .{extensionOf(file.name)}
          </span>
        </div>
      </form>
    </Dialog>
  );
}

export function DeleteDialog({ file, onCancel, onDelete }: { file: FileRecord; onCancel: () => void; onDelete: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      title="Delete file?"
      onClose={onCancel}
      initialFocus={cancel}
      footer={
        <>
          <Button ref={cancel} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete();
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete
          </Button>
        </>
      }
    >
      <p>
        <strong className="font-semibold text-slate-900">{file.name}</strong> and its version history will be permanently deleted from this browser. This
        can't be undone.
      </p>
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ["/", "Search files"],
  ["Arrow keys", "Move between files"],
  ["Home / End", "First / last file"],
  ["Enter", "Open file"],
  ["F2", "Rename file"],
  ["Delete", "Delete file"],
  ["Shift+F10", "File actions menu"],
  ["?", "Show this help"],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {SHORTCUTS.map(([key, label]) => (
          <div key={key} className="contents">
            <dt>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
