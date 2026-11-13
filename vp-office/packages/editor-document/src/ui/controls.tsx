import { ChevronDown, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function RibbonButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  active,
  disabled,
  large,
  showLabel,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  large?: boolean;
  showLabel?: boolean;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      {...(active !== undefined ? { "aria-pressed": active } : {})}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rb-btn ${large ? "rb-btn-large" : ""} ${active ? "rb-btn-active" : ""}`}
    >
      <Icon aria-hidden className={large ? "size-5" : "size-4"} strokeWidth={1.75} />
      {(large || showLabel) && <span className="rb-btn-label">{label}</span>}
    </button>
  );
}

export function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rb-group" role="group" aria-label={label}>
      <div className="rb-group-body">{children}</div>
      <div className="rb-group-label" aria-hidden>
        {label}
      </div>
    </div>
  );
}

/** Button that opens a popover panel. Closes on outside click or Escape. */
export function Dropdown({
  icon: Icon,
  label,
  showLabel,
  large,
  children,
  active,
  width = 220,
}: {
  icon?: LucideIcon;
  label: string;
  showLabel?: boolean;
  large?: boolean;
  active?: boolean;
  width?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>(".rb-pop button, .rb-pop input, .rb-pop select")?.focus();
  }, [open]);

  return (
    <div className="rb-dropdown" ref={root}>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
        className={`rb-btn ${large ? "rb-btn-large" : ""} ${active ? "rb-btn-active" : ""}`}
      >
        {Icon && <Icon aria-hidden className={large ? "size-5" : "size-4"} strokeWidth={1.75} />}
        {(showLabel || large || !Icon) && <span className="rb-btn-label">{label}</span>}
        <ChevronDown aria-hidden className="size-3 opacity-60" />
      </button>
      {open && (
        <div id={id} className="rb-pop" style={{ width }} role="dialog" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ label, onClick, icon: Icon, active, hint }: { label: string; onClick: () => void; icon?: LucideIcon; active?: boolean; hint?: string }) {
  return (
    <button type="button" className={`rb-menu-item ${active ? "rb-menu-item-active" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {Icon && <Icon aria-hidden className="size-4" />}
      <span className="flex-1 text-left">{label}</span>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </button>
  );
}

export const PALETTE = [
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#ffffff",
  "#c00000", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#00897b",
  "#1e88e5", "#1e3a5f", "#5e35b1", "#8e24aa", "#d81b60", "#6d4c41",
  "#ffcdd2", "#ffe0b2", "#fff9c4", "#c8e6c9", "#b2dfdb", "#bbdefb",
];

export function ColorPalette({ onPick, noneLabel }: { onPick: (color: string | null) => void; noneLabel: string }) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Colours">
        {PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={color}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(color)}
            className="size-6 rounded border border-slate-300 hover:scale-110"
            style={{ background: color }}
          />
        ))}
      </div>
      <button type="button" className="rb-menu-item mt-2" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(null)}>
        {noneLabel}
      </button>
    </div>
  );
}

export function RibbonSelect({ label, value, options, onChange, width = 120 }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; width?: number }) {
  return (
    <select aria-label={label} title={label} value={value} onChange={(e) => onChange(e.target.value)} className="rb-select" style={{ width }}>
      {!options.some((o) => o.value === value) && <option value={value}>{value || "—"}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, textarea, select")?.focus() ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previous?.focus?.();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} className={`w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-slate-700">{children}</div>
        {footer && <div className="flex justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-medium text-slate-800">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function DialogButton({ primary, ...props }: React.ComponentProps<"button"> & { primary?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-md px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? "bg-[#1e4f8a] text-white hover:bg-[#1e3a5f]" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
      }`}
    />
  );
}

export const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-[#1e4f8a] focus:ring-2 focus:ring-[#d6e3f3]";
