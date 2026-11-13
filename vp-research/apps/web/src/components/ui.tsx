import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "toolbar" | "dark";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  toolbar: "text-slate-700 hover:bg-slate-100 data-[on=true]:bg-brand-100 data-[on=true]:text-brand-700",
  dark: "text-slate-100 hover:bg-ink-700 hover:text-white",
};

export function Button({ variant = "secondary", className = "", on, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; on?: boolean }) {
  return (
    <button
      type="button"
      data-on={on ? "true" : undefined}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({ label, className = "", on, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; on?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={props.title ?? label}
      data-on={on ? "true" : undefined}
      aria-pressed={on === undefined ? undefined : on}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-35 data-[on=true]:bg-brand-100 data-[on=true]:text-brand-700 ${className}`}
      {...props}
    />
  );
}

export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: "md" | "lg" | "xl" }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[autofocus], input, textarea, select, button:not([aria-label='Close'])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const width = wide === "xl" ? "max-w-6xl" : wide === "lg" ? "max-w-3xl" : wide === "md" ? "max-w-xl" : "max-w-md";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className={`flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-xl bg-white shadow-2xl`}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id={id} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-[13px] font-medium text-slate-700">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

/** A dropdown menu anchored to its trigger. */
export function Menu({ trigger, children, align = "left", label }: { trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div role="menu" aria-label={label} className={`absolute z-40 mt-1 min-w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, danger, disabled, hint }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] disabled:opacity-40 ${danger ? "text-red-700 hover:bg-red-50" : "text-slate-800 hover:bg-slate-100"}`}
    >
      {children}
      {hint && <span className="ml-auto pl-4 text-[11px] text-slate-400">{hint}</span>}
    </button>
  );
}

// ---- Toasts ----

type Tone = "info" | "success" | "error" | "warning";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" || tone === "warning" ? 8000 : 4000);
  }, []);
  const tones: Record<Tone, string> = { info: "bg-ink-900 text-white", success: "bg-emerald-700 text-white", error: "bg-red-700 text-white", warning: "bg-amber-100 text-amber-950 border border-amber-300" };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(92vw,400px)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={`pointer-events-auto rounded-lg px-3.5 py-2 text-[13px] shadow-lg ${tones[t.tone]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
