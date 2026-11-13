import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  Bold,
  BringToFront,
  ChevronDown,
  Circle,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  Group,
  Image as ImageIcon,
  Italic,
  List,
  Minus,
  MoveRight,
  Paintbrush,
  Play,
  Plus,
  Printer,
  Redo2,
  SendToBack,
  Square,
  Table,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash,
  Triangle,
  Type,
  Underline,
  Undo2,
  Ungroup,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LAYOUTS, newId, newSlide, THEMES, textBody, type Deck, type LayoutId, type Paragraph, type ShapeKind, type Slide, type SlideElement, type TextBody, type ThemeId } from "../model";
import { bodyToHtml, htmlToBody } from "./rich-text";
import { ElementView, PX_PER_IN, SlideView } from "./SlideView";
import "./slides.css";

export interface SlidesEditorProps {
  initial: Deck;
  onChange: (deck: Deck) => void;
  onDownload?: () => void;
  onShowHistory?: () => void;
  onError?: (message: string) => void;
}

const COLORS = ["#000000", "#1f2937", "#6b7280", "#ffffff", "#1e3a5f", "#1e4f8a", "#0f9f8f", "#15803d", "#c2410c", "#c00000", "#7c3aed", "#db2777", "#dbeafe", "#dcfce7", "#fef9c3", "#fee2e2"];
const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72];

function Menu({ label, icon, children, wide }: { label: string; icon?: ReactNode; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="sl-menu" ref={root}>
      <button type="button" className="sl-btn" aria-haspopup="true" aria-expanded={open} title={label} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        {icon}
        <span className="sl-btn-label">{label}</span>
        <ChevronDown aria-hidden className="size-3 opacity-60" />
      </button>
      {open && (
        <div className={`sl-pop ${wide ? "sl-pop-wide" : ""}`} role="menu" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Btn({ label, icon, onClick, disabled, active, showLabel }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; showLabel?: boolean }) {
  return (
    <button
      type="button"
      className={`sl-btn ${active ? "sl-btn-active" : ""}`}
      title={label}
      aria-label={label}
      {...(active !== undefined ? { "aria-pressed": active } : {})}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
      {showLabel && <span className="sl-btn-label">{label}</span>}
    </button>
  );
}

const SHAPES: { kind: ShapeKind; label: string; icon: ReactNode }[] = [
  { kind: "rect", label: "Rectangle", icon: <Square aria-hidden className="size-4" /> },
  { kind: "roundRect", label: "Rounded rectangle", icon: <Square aria-hidden className="size-4 rounded" /> },
  { kind: "ellipse", label: "Ellipse", icon: <Circle aria-hidden className="size-4" /> },
  { kind: "triangle", label: "Triangle", icon: <Triangle aria-hidden className="size-4" /> },
  { kind: "line", label: "Line", icon: <Minus aria-hidden className="size-4" /> },
  { kind: "arrow", label: "Arrow", icon: <MoveRight aria-hidden className="size-4" /> },
];

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

function Presenter({ deck, start, onClose }: { deck: Deck; start: number; onClose: () => void }) {
  const visible = deck.slides.map((s, i) => [s, i] as const).filter(([s]) => !s.hidden);
  const [index, setIndex] = useState(() => Math.max(0, visible.findIndex(([, i]) => i >= start)));
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.requestFullscreen?.().catch(() => undefined);
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) setIndex((i) => Math.min(i + 1, visible.length - 1));
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) setIndex((i) => Math.max(i - 1, 0));
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    const exitFs = () => !document.fullscreenElement && onClose();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", exitFs);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", exitFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose, visible.length]);
  const current = visible[index];
  const scale = Math.min(size.w / (deck.width * PX_PER_IN), size.h / (deck.height * PX_PER_IN));
  return createPortal(
    <div ref={root} className="sl-presenter" role="dialog" aria-label="Presentation" onClick={() => setIndex((i) => Math.min(i + 1, visible.length - 1))}>
      {current && <SlideView deck={deck} slide={current[0]} scale={scale} />}
      <div className="sl-presenter-bar" onClick={(e) => e.stopPropagation()}>
        <span>
          {index + 1} / {visible.length}
        </span>
        <button type="button" onClick={onClose} aria-label="End presentation">
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function SlidesEditor({ initial, onChange, onDownload, onShowHistory, onError }: SlidesEditorProps) {
  const [deck, setDeck] = useState<Deck>(initial);
  const history = useRef<{ past: Deck[]; future: Deck[]; key: string | null; at: number }>({ past: [], future: [], key: null, at: 0 });
  const [, rerender] = useState(0);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [scale, setScale] = useState(0.7);
  const clipboard = useRef<SlideElement[]>([]);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const slide = deck.slides[Math.min(current, deck.slides.length - 1)]!;

  const commit = useCallback((next: Deck, key: string | null = null) => {
    const h = history.current;
    const now = Date.now();
    if (!(key && h.key === key && now - h.at < 1200)) {
      h.past.push(deckRef.current);
      if (h.past.length > 200) h.past.shift();
    }
    h.future = [];
    h.key = key;
    h.at = now;
    deckRef.current = next;
    setDeck(next);
    onChangeRef.current(next);
    rerender((n) => n + 1);
  }, []);

  const updateSlide = useCallback(
    (fn: (s: Slide) => Slide, key: string | null = null) => {
      const d = deckRef.current;
      const idx = Math.min(current, d.slides.length - 1);
      commit({ ...d, slides: d.slides.map((s, i) => (i === idx ? fn(s) : s)) }, key);
    },
    [commit, current],
  );

  const updateElements = useCallback(
    (ids: string[], fn: (el: SlideElement) => SlideElement, key: string | null = null) => updateSlide((s) => ({ ...s, elements: s.elements.map((e) => (ids.includes(e.id) ? fn(e) : e)) }), key),
    [updateSlide],
  );

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(deckRef.current);
    h.key = null;
    deckRef.current = prev;
    setDeck(prev);
    onChangeRef.current(prev);
    setSelected([]);
    setEditingId(null);
    rerender((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(deckRef.current);
    h.key = null;
    deckRef.current = next;
    setDeck(next);
    onChangeRef.current(next);
    rerender((n) => n + 1);
  }, []);

  // Fit the slide to the available width.
  useLayoutEffect(() => {
    const el = canvasWrap.current;
    if (!el) return;
    const fit = () => setScale(Math.max(0.2, Math.min((el.clientWidth - 48) / (deck.width * PX_PER_IN), (el.clientHeight - 48) / (deck.height * PX_PER_IN))));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [deck.width, deck.height]);

  /** Expands a selection to whole groups. */
  const withGroups = useCallback(
    (ids: string[]) => {
      const groups = new Set(slide.elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId));
      return slide.elements.filter((e) => ids.includes(e.id) || (e.groupId && groups.has(e.groupId))).map((e) => e.id);
    },
    [slide],
  );

  const addElement = (el: SlideElement) => {
    updateSlide((s) => ({ ...s, elements: [...s.elements, el] }));
    setSelected([el.id]);
  };
  const center = (w: number, h: number) => ({ x: (deck.width - w) / 2, y: (deck.height - h) / 2, w, h });

  const deleteSelected = () => {
    if (!selected.length) return;
    updateSlide((s) => ({ ...s, elements: s.elements.filter((e) => !selected.includes(e.id)) }));
    setSelected([]);
  };

  const duplicateSelected = (els = slide.elements.filter((e) => selected.includes(e.id))) => {
    if (!els.length) return;
    const groupMap = new Map<string, string>();
    const copies = els.map((e) => ({ ...structuredClone(e), id: newId(), x: e.x + 0.25, y: e.y + 0.25, ...(e.groupId ? { groupId: groupMap.get(e.groupId) ?? groupMap.set(e.groupId, newId()).get(e.groupId)! } : {}) }));
    updateSlide((s) => ({ ...s, elements: [...s.elements, ...copies] }));
    setSelected(copies.map((c) => c.id));
  };

  const align = (where: "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom") => {
    const els = slide.elements.filter((e) => selected.includes(e.id));
    if (!els.length) return;
    // One object aligns to the slide; several align to their shared bounds.
    const bounds =
      els.length === 1
        ? { x1: 0, y1: 0, x2: deck.width, y2: deck.height }
        : { x1: Math.min(...els.map((e) => e.x)), y1: Math.min(...els.map((e) => e.y)), x2: Math.max(...els.map((e) => e.x + e.w)), y2: Math.max(...els.map((e) => e.y + e.h)) };
    updateElements(selected, (e) => {
      switch (where) {
        case "left":
          return { ...e, x: bounds.x1 };
        case "hcenter":
          return { ...e, x: (bounds.x1 + bounds.x2) / 2 - e.w / 2 };
        case "right":
          return { ...e, x: bounds.x2 - e.w };
        case "top":
          return { ...e, y: bounds.y1 };
        case "vmiddle":
          return { ...e, y: (bounds.y1 + bounds.y2) / 2 - e.h / 2 };
        case "bottom":
          return { ...e, y: bounds.y2 - e.h };
      }
    });
  };

  const reorder = (dir: "front" | "back") =>
    updateSlide((s) => {
      const picked = s.elements.filter((e) => selected.includes(e.id));
      const rest = s.elements.filter((e) => !selected.includes(e.id));
      return { ...s, elements: dir === "front" ? [...rest, ...picked] : [...picked, ...rest] };
    });

  const group = () => {
    if (selected.length < 2) return;
    const id = newId();
    updateElements(selected, (e) => ({ ...e, groupId: id }));
  };
  const ungroup = () => updateElements(selected, (e) => {
    const { groupId: _g, ...rest } = e;
    return rest as SlideElement;
  });

  /** Applies run formatting to the selected text objects (or the active text selection when editing). */
  const formatRuns = (patch: Partial<{ bold: boolean; italic: boolean; underline: boolean; color: string; size: number }>, command?: string, value?: string) => {
    if (editingId && command) {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(command, false, value);
      return;
    }
    updateElements(selected, (e) => {
      if (e.kind !== "text" && e.kind !== "shape") return e;
      const body = e.body ?? textBody("");
      return { ...e, body: { ...body, paragraphs: body.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, ...patch })) })) } } as SlideElement;
    });
  };
  const formatParagraphs = (patch: Partial<Paragraph>) => {
    if (editingId) {
      const editor = editorRef.current;
      if (editor) {
        const sel = window.getSelection();
        const blocks = Array.from(editor.children) as HTMLElement[];
        const affected = blocks.filter((b) => sel && sel.rangeCount && sel.getRangeAt(0).intersectsNode(b));
        for (const b of affected.length ? affected : blocks) {
          if (patch.align) b.style.textAlign = patch.align;
          if (patch.bullet !== undefined) {
            b.dataset.bullet = patch.bullet ? "1" : "0";
            b.style.display = patch.bullet ? "list-item" : "";
            b.style.marginLeft = patch.bullet ? "1.2em" : "";
          }
        }
      }
      return;
    }
    updateElements(selected, (e) => {
      if (e.kind !== "text" && e.kind !== "shape") return e;
      const body = e.body ?? textBody("");
      return { ...e, body: { ...body, paragraphs: body.paragraphs.map((p) => ({ ...p, ...patch })) } } as SlideElement;
    });
  };

  const finishEditing = useCallback(() => {
    const id = editingId;
    const editor = editorRef.current;
    setEditingId(null);
    if (!id || !editor) return;
    const el = slide.elements.find((e) => e.id === id);
    if (!el || (el.kind !== "text" && el.kind !== "shape")) return;
    const body = htmlToBody(editor, el.body);
    if (JSON.stringify(body) !== JSON.stringify(el.body)) updateElements([id], (e) => ({ ...e, body }) as SlideElement);
  }, [editingId, slide, updateElements]);

  // Pointer interactions on the canvas.
  const drag = useRef<{ mode: "move" | Handle; startX: number; startY: number; originals: SlideElement[] } | null>(null);
  const k = PX_PER_IN * scale;

  const onElementDown = (e: React.PointerEvent, el: SlideElement) => {
    if (editingId === el.id) return;
    e.stopPropagation();
    if (editingId) finishEditing();
    const ids = e.shiftKey ? (selected.includes(el.id) ? selected.filter((i) => i !== el.id) : [...selected, el.id]) : selected.includes(el.id) ? selected : [el.id];
    const full = withGroups(ids);
    setSelected(full);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: "move", startX: e.clientX, startY: e.clientY, originals: slide.elements.filter((x) => full.includes(x.id)).map((x) => structuredClone(x)) };
  };

  const onHandleDown = (e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: handle, startX: e.clientX, startY: e.clientY, originals: slide.elements.filter((x) => selected.includes(x.id)).map((x) => structuredClone(x)) };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / k;
    const dy = (e.clientY - d.startY) / k;
    const key = `drag:${d.mode}:${d.originals.map((o) => o.id).join(",")}`;
    if (d.mode === "move") {
      const snap = (v: number) => (e.altKey ? v : Math.round(v * 20) / 20);
      updateElements(d.originals.map((o) => o.id), (el) => {
        const o = d.originals.find((x) => x.id === el.id)!;
        return { ...el, x: snap(o.x + dx), y: snap(o.y + dy) };
      }, key);
      return;
    }
    const o = d.originals[0];
    if (!o || d.originals.length !== 1) return;
    if (d.mode === "rotate") {
      const rect = canvasWrap.current!.querySelector(`[data-element-id="${o.id}"]`)!.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      if (!e.altKey) angle = Math.round(angle / 15) * 15;
      updateElements([o.id], (el) => ({ ...el, rotation: ((angle % 360) + 360) % 360 }), key);
      return;
    }
    let { x, y, w, h } = o;
    if (d.mode.includes("e")) w = Math.max(0.1, o.w + dx);
    if (d.mode.includes("s")) h = Math.max(0.05, o.h + dy);
    if (d.mode.includes("w")) {
      w = Math.max(0.1, o.w - dx);
      x = o.x + (o.w - w);
    }
    if (d.mode.includes("n")) {
      h = Math.max(0.05, o.h - dy);
      y = o.y + (o.h - h);
    }
    if (e.shiftKey && o.kind === "image") h = (w * o.h) / o.w;
    updateElements([o.id], (el) => ({ ...el, x, y, w, h }), key);
  };
  const onPointerUp = () => {
    drag.current = null;
    history.current.key = null;
  };

  useEffect(() => {
    if (editingId && editorRef.current) {
      const el = editorRef.current;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "F5") {
        e.preventDefault();
        setPresenting(true);
        return;
      }
      if (typing) {
        if (e.key === "Escape" && editingId) finishEditing();
        return;
      }
      if (mod && e.key.toLowerCase() === "z") return void (e.preventDefault(), e.shiftKey ? redo() : undo());
      if (mod && e.key.toLowerCase() === "y") return void (e.preventDefault(), redo());
      if (mod && e.key.toLowerCase() === "d") return void (e.preventDefault(), duplicateSelected());
      if (mod && e.key.toLowerCase() === "c") return void (clipboard.current = slide.elements.filter((x) => selected.includes(x.id)).map((x) => structuredClone(x)));
      if (mod && e.key.toLowerCase() === "v" && clipboard.current.length) return void (e.preventDefault(), duplicateSelected(clipboard.current));
      if (mod && e.key.toLowerCase() === "g") return void (e.preventDefault(), e.shiftKey ? ungroup() : group());
      if (mod && e.key.toLowerCase() === "a") return void (e.preventDefault(), setSelected(slide.elements.map((x) => x.id)));
      if ((e.key === "Delete" || e.key === "Backspace") && selected.length) return void (e.preventDefault(), deleteSelected());
      if (e.key === "Escape") return void setSelected([]);
      if (e.key === "Enter" && selected.length === 1) {
        const el = slide.elements.find((x) => x.id === selected[0]);
        if (el && (el.kind === "text" || el.kind === "shape")) return void (e.preventDefault(), setEditingId(el.id));
      }
      if (e.key.startsWith("Arrow") && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 0.5 : 0.05;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateElements(selected, (el) => ({ ...el, x: el.x + dx, y: el.y + dy }), `nudge:${selected.join(",")}`);
        return;
      }
      if (!selected.length && (e.key === "PageDown" || e.key === "ArrowDown")) setCurrent((c) => Math.min(c + 1, deck.slides.length - 1));
      if (!selected.length && (e.key === "PageUp" || e.key === "ArrowUp")) setCurrent((c) => Math.max(c - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const insertImage = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/gif"].includes(file.type)) return onError?.("Images must be PNG, JPEG or GIF.");
    if (file.size > 10 * 1024 * 1024) return onError?.("Images must be smaller than 10 MB.");
    const src = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const img = new Image();
    await new Promise((res) => ((img.onload = res), (img.onerror = res), (img.src = src)));
    const w = Math.min(6, (img.naturalWidth || 600) / PX_PER_IN);
    const h = (w * (img.naturalHeight || 400)) / (img.naturalWidth || 600);
    addElement({ id: newId(), kind: "image", ...center(w, h), src, alt: file.name.replace(/\.[^.]+$/, "") });
  };

  const addSlide = (layout: LayoutId, after = current) => {
    const s = newSlide(layout, deck);
    commit({ ...deck, slides: [...deck.slides.slice(0, after + 1), s, ...deck.slides.slice(after + 1)] });
    setCurrent(after + 1);
    setSelected([]);
  };
  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= deck.slides.length) return;
    const slides = [...deck.slides];
    const [m] = slides.splice(from, 1);
    slides.splice(to, 0, m!);
    commit({ ...deck, slides });
    setCurrent(to);
  };
  const deleteSlide = (i: number) => {
    if (deck.slides.length <= 1) return onError?.("A presentation needs at least one slide.");
    commit({ ...deck, slides: deck.slides.filter((_, j) => j !== i) });
    setCurrent((c) => Math.max(0, Math.min(c, deck.slides.length - 2)));
    setSelected([]);
  };
  const duplicateSlide = (i: number) => {
    const copy = { ...structuredClone(deck.slides[i]!), id: newId() };
    copy.elements = copy.elements.map((e) => ({ ...e, id: newId() }));
    commit({ ...deck, slides: [...deck.slides.slice(0, i + 1), copy, ...deck.slides.slice(i + 1)] });
    setCurrent(i + 1);
  };

  const print = () => {
    const style = document.createElement("style");
    style.textContent = `@page { size: ${deck.width}in ${deck.height}in; margin: 0; }`;
    document.head.append(style);
    document.body.classList.add("sl-printing");
    const done = () => {
      style.remove();
      document.body.classList.remove("sl-printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(() => !window.matchMedia?.("print").matches && done(), 1000);
  };

  const selectedEls = slide.elements.filter((e) => selected.includes(e.id));
  const single = selectedEls.length === 1 ? selectedEls[0] : undefined;
  const textual = selectedEls.some((e) => e.kind === "text" || e.kind === "shape");
  const firstRun = single && (single.kind === "text" || single.kind === "shape") ? single.body?.paragraphs[0]?.runs[0] : undefined;
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  const thumbScale = 168 / (deck.width * PX_PER_IN);

  const selectionBox = useMemo(() => single, [single]);

  return (
    <div className="sl-editor">
      <div className="sl-toolbar" role="toolbar" aria-label="Presentation tools">
        <div className="sl-group">
          <Btn label="Undo" icon={<Undo2 aria-hidden className="size-4" />} onClick={undo} disabled={!canUndo} />
          <Btn label="Redo" icon={<Redo2 aria-hidden className="size-4" />} onClick={redo} disabled={!canRedo} />
        </div>
        <div className="sl-group">
          <Menu label="New slide" icon={<Plus aria-hidden className="size-4" />}>
            {(close) =>
              (Object.keys(LAYOUTS) as LayoutId[]).map((l) => (
                <button key={l} type="button" role="menuitem" className="sl-item" onClick={() => (addSlide(l), close())}>
                  {LAYOUTS[l]}
                </button>
              ))
            }
          </Menu>
          <Menu label="Layout">
            {(close) =>
              (Object.keys(LAYOUTS) as LayoutId[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="menuitem"
                  className={`sl-item ${slide.layout === l ? "sl-item-active" : ""}`}
                  onClick={() => {
                    // Keep the slide's own content; replace only empty placeholders.
                    updateSlide((s) => ({ ...s, layout: l, elements: s.elements.length ? s.elements : newSlide(l, deck).elements }));
                    close();
                  }}
                >
                  {LAYOUTS[l]}
                </button>
              ))
            }
          </Menu>
        </div>
        <div className="sl-group">
          <Btn label="Text box" showLabel icon={<Type aria-hidden className="size-4" />} onClick={() => addElement({ id: newId(), kind: "text", ...center(4, 1), body: textBody("Text", { size: 20 }) })} />
          <Menu label="Shape" icon={<Square aria-hidden className="size-4" />}>
            {(close) =>
              SHAPES.map((s) => (
                <button
                  key={s.kind}
                  type="button"
                  role="menuitem"
                  className="sl-item"
                  onClick={() => {
                    const line = s.kind === "line" || s.kind === "arrow";
                    addElement({ id: newId(), kind: "shape", shape: s.kind, ...center(line ? 3 : 2.5, line ? 0.3 : 1.5), fill: line ? null : THEMES[deck.theme].accent, stroke: line ? "#1f2937" : null, strokeWidth: 2 });
                    close();
                  }}
                >
                  {s.icon} {s.label}
                </button>
              ))
            }
          </Menu>
          <Btn label="Image" showLabel icon={<ImageIcon aria-hidden className="size-4" />} onClick={() => imageInput.current?.click()} />
          <Btn
            label="Table"
            showLabel
            icon={<Table aria-hidden className="size-4" />}
            onClick={() => addElement({ id: newId(), kind: "table", ...center(8, 2), header: true, rows: [["Header", "Header", "Header"], ["", "", ""], ["", "", ""]] })}
          />
        </div>
        <div className="sl-group" aria-label="Text">
          <Btn label="Bold" icon={<Bold aria-hidden className="size-4" />} disabled={!textual} active={!!firstRun?.bold} onClick={() => formatRuns({ bold: !firstRun?.bold }, "bold")} />
          <Btn label="Italic" icon={<Italic aria-hidden className="size-4" />} disabled={!textual} active={!!firstRun?.italic} onClick={() => formatRuns({ italic: !firstRun?.italic }, "italic")} />
          <Btn label="Underline" icon={<Underline aria-hidden className="size-4" />} disabled={!textual} active={!!firstRun?.underline} onClick={() => formatRuns({ underline: !firstRun?.underline }, "underline")} />
          <select
            aria-label="Font size"
            className="sl-select"
            disabled={!textual}
            value={String(firstRun?.size ?? 18)}
            onChange={(e) => {
              const size = Number(e.target.value);
              if (editingId) {
                // execCommand font sizes are 1–7, so wrap the selection in a span instead.
                const sel = window.getSelection();
                if (sel && sel.rangeCount && !sel.isCollapsed) {
                  const span = document.createElement("span");
                  span.style.fontSize = `${size}pt`;
                  span.append(sel.getRangeAt(0).extractContents());
                  sel.getRangeAt(0).insertNode(span);
                }
                return;
              }
              formatRuns({ size });
            }}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Menu label="Text colour" icon={<Paintbrush aria-hidden className="size-4" />}>
            {(close) => (
              <div className="sl-swatches">
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={c} className="sl-swatch" style={{ background: c }} onMouseDown={(e) => e.preventDefault()} onClick={() => (formatRuns({ color: c }, "foreColor", c), close())} />
                ))}
              </div>
            )}
          </Menu>
          <Btn label="Align left" icon={<TextAlignStart aria-hidden className="size-4" />} disabled={!textual} onClick={() => formatParagraphs({ align: "left" })} />
          <Btn label="Center" icon={<TextAlignCenter aria-hidden className="size-4" />} disabled={!textual} onClick={() => formatParagraphs({ align: "center" })} />
          <Btn label="Align right" icon={<TextAlignEnd aria-hidden className="size-4" />} disabled={!textual} onClick={() => formatParagraphs({ align: "right" })} />
          <Btn
            label="Bullets"
            icon={<List aria-hidden className="size-4" />}
            disabled={!textual}
            onClick={() => {
              const on = !(single && (single.kind === "text" || single.kind === "shape") && single.body?.paragraphs[0]?.bullet);
              formatParagraphs({ bullet: on });
            }}
          />
        </div>
        <div className="sl-group" aria-label="Arrange">
          <Menu label="Align" icon={<AlignStartVertical aria-hidden className="size-4" />}>
            {(close) => (
              <>
                {(
                  [
                    ["left", "Align left", <AlignStartVertical key="a" aria-hidden className="size-4" />],
                    ["hcenter", "Align centre", <AlignCenterVertical key="b" aria-hidden className="size-4" />],
                    ["right", "Align right", <AlignEndVertical key="c" aria-hidden className="size-4" />],
                    ["top", "Align top", <AlignStartHorizontal key="d" aria-hidden className="size-4" />],
                    ["vmiddle", "Align middle", <AlignCenterHorizontal key="e" aria-hidden className="size-4" />],
                    ["bottom", "Align bottom", <AlignEndHorizontal key="f" aria-hidden className="size-4" />],
                  ] as const
                ).map(([w, label, icon]) => (
                  <button key={w} type="button" role="menuitem" className="sl-item" disabled={!selected.length} onClick={() => (align(w), close())}>
                    {icon} {label}
                  </button>
                ))}
                <p className="px-2 pt-1 text-xs text-slate-500">One object aligns to the slide; several align to each other.</p>
              </>
            )}
          </Menu>
          <Btn label="Bring to front" icon={<BringToFront aria-hidden className="size-4" />} disabled={!selected.length} onClick={() => reorder("front")} />
          <Btn label="Send to back" icon={<SendToBack aria-hidden className="size-4" />} disabled={!selected.length} onClick={() => reorder("back")} />
          <Btn label="Group" icon={<Group aria-hidden className="size-4" />} disabled={selected.length < 2} onClick={group} />
          <Btn label="Ungroup" icon={<Ungroup aria-hidden className="size-4" />} disabled={!selectedEls.some((e) => e.groupId)} onClick={ungroup} />
          <Btn label="Delete" icon={<Trash aria-hidden className="size-4" />} disabled={!selected.length} onClick={deleteSelected} />
        </div>
        <div className="sl-group" aria-label="Design">
          <Menu label="Theme">
            {(close) =>
              (Object.keys(THEMES) as ThemeId[]).map((t) => (
                <button key={t} type="button" role="menuitem" className={`sl-item ${deck.theme === t ? "sl-item-active" : ""}`} onClick={() => (commit({ ...deck, theme: t }), close())}>
                  <span className="sl-theme-chip" style={{ background: THEMES[t].titleBackground, borderColor: THEMES[t].accent }} /> {THEMES[t].label}
                </button>
              ))
            }
          </Menu>
          <Menu label="Background">
            {(close) => (
              <div className="sl-swatches">
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Background ${c}`} className="sl-swatch" style={{ background: c }} onClick={() => (updateSlide((s) => ({ ...s, background: c })), close())} />
                ))}
                <button type="button" className="sl-item col-span-4" onClick={() => (updateSlide((s) => { const { background: _b, ...rest } = s; return rest as Slide; }), close())}>
                  Theme default
                </button>
              </div>
            )}
          </Menu>
        </div>
        <div className="sl-group ml-auto">
          {onShowHistory && <Btn label="Version history" icon={<Clock aria-hidden className="size-4" />} onClick={onShowHistory} />}
          <Btn label="Print / PDF" icon={<Printer aria-hidden className="size-4" />} onClick={print} />
          {onDownload && <Btn label="Download PPTX" icon={<Download aria-hidden className="size-4" />} onClick={onDownload} />}
          <Btn label="Present" showLabel icon={<Play aria-hidden className="size-4" />} onClick={() => setPresenting(true)} />
        </div>
      </div>
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif" hidden data-testid="slide-image-input" onChange={(e) => (void insertImage(e.target.files?.[0]), (e.target.value = ""))} />

      <div className="sl-body">
        <nav className="sl-thumbs" aria-label="Slides">
          <ol>
            {deck.slides.map((s, i) => (
              <li
                key={s.id}
                className={`sl-thumb ${i === current ? "sl-thumb-current" : ""} ${s.hidden ? "sl-thumb-hidden" : ""}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/slide", String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const from = Number(e.dataTransfer.getData("text/slide"));
                  if (!Number.isNaN(from) && from !== i) moveSlide(from, i);
                }}
              >
                <span className="sl-thumb-num">{i + 1}</span>
                <button type="button" className="sl-thumb-btn" aria-label={`Slide ${i + 1}${s.hidden ? " (hidden)" : ""}`} aria-current={i === current ? "true" : undefined} onClick={() => (setCurrent(i), setSelected([]), setEditingId(null))}>
                  <SlideView deck={deck} slide={s} scale={thumbScale} />
                </button>
                <div className="sl-thumb-actions">
                  <button type="button" aria-label={`Move slide ${i + 1} up`} disabled={i === 0} onClick={() => moveSlide(i, i - 1)}>
                    <ArrowUp aria-hidden className="size-3.5" />
                  </button>
                  <button type="button" aria-label={`Move slide ${i + 1} down`} disabled={i === deck.slides.length - 1} onClick={() => moveSlide(i, i + 1)}>
                    <ArrowDown aria-hidden className="size-3.5" />
                  </button>
                  <button type="button" aria-label={`Duplicate slide ${i + 1}`} onClick={() => duplicateSlide(i)}>
                    <Copy aria-hidden className="size-3.5" />
                  </button>
                  <button type="button" aria-label={`${s.hidden ? "Show" : "Hide"} slide ${i + 1}`} onClick={() => commit({ ...deck, slides: deck.slides.map((x, j) => (j === i ? { ...x, hidden: !x.hidden } : x)) })}>
                    {s.hidden ? <Eye aria-hidden className="size-3.5" /> : <EyeOff aria-hidden className="size-3.5" />}
                  </button>
                  <button type="button" aria-label={`Delete slide ${i + 1}`} disabled={deck.slides.length === 1} onClick={() => deleteSlide(i)}>
                    <Trash aria-hidden className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="sl-add-slide" onClick={() => addSlide("titleContent", deck.slides.length - 1)}>
            <Plus aria-hidden className="size-4" /> Add slide
          </button>
        </nav>

        <div className="sl-main">
          <div
            ref={canvasWrap}
            className="sl-canvas"
            onPointerDown={() => {
              if (editingId) finishEditing();
              setSelected([]);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="sl-stage" style={{ width: deck.width * k, height: deck.height * k }} aria-label={`Slide ${current + 1} of ${deck.slides.length}`} role="region">
              <SlideView deck={deck} slide={{ ...slide, elements: [] }} scale={scale} />
              {slide.elements.map((el) => {
                const editing = editingId === el.id && (el.kind === "text" || el.kind === "shape");
                return (
                  <div
                    key={el.id}
                    className={`sl-el ${selected.includes(el.id) ? "sl-el-selected" : ""}`}
                    onPointerDown={(e) => onElementDown(e, el)}
                    onDoubleClick={() => (el.kind === "text" || el.kind === "shape") && setEditingId(el.id)}
                    data-kind={el.kind}
                  >
                    <ElementView
                      deck={deck}
                      slide={slide}
                      el={el}
                      scale={scale}
                      editing={
                        editing ? (
                          <div
                            ref={editorRef}
                            className="sl-text-editor"
                            contentEditable
                            suppressContentEditableWarning
                            role="textbox"
                            aria-multiline="true"
                            aria-label="Edit text"
                            style={{ fontSize: ((firstRun?.size ?? 18) * PX_PER_IN * scale) / 72 }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onBlur={finishEditing}
                            dangerouslySetInnerHTML={{ __html: bodyToHtml((el as { body?: TextBody }).body) }}
                          />
                        ) : undefined
                      }
                    />
                  </div>
                );
              })}
              {selectionBox && !editingId && (
                <div
                  className="sl-selection"
                  style={{ left: selectionBox.x * k, top: selectionBox.y * k, width: selectionBox.w * k, height: selectionBox.h * k, transform: selectionBox.rotation ? `rotate(${selectionBox.rotation}deg)` : undefined }}
                >
                  {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as Handle[]).map((h) => (
                    <span key={h} className={`sl-handle sl-handle-${h}`} onPointerDown={(e) => onHandleDown(e, h)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} aria-hidden />
                  ))}
                  <span className="sl-handle sl-handle-rotate" title="Rotate" onPointerDown={(e) => onHandleDown(e, "rotate")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} aria-hidden />
                </div>
              )}
              {selectedEls.length > 1 &&
                selectedEls.map((el) => <div key={`s-${el.id}`} className="sl-multi" style={{ left: el.x * k, top: el.y * k, width: el.w * k, height: el.h * k }} aria-hidden />)}
            </div>
          </div>
          {single?.kind === "table" && (
            <div className="sl-table-edit" aria-label="Table contents">
              <span className="text-xs font-medium text-slate-600">Table</span>
              <table>
                <tbody>
                  {single.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c}>
                          <input
                            aria-label={`Row ${r + 1} column ${c + 1}`}
                            value={cell}
                            onChange={(e) => updateElements([single.id], (el) => (el.kind === "table" ? { ...el, rows: el.rows.map((rr, ri) => rr.map((cc, ci) => (ri === r && ci === c ? e.target.value : cc))) } : el), `cell:${single.id}:${r}:${c}`)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-1">
                <button type="button" className="sl-mini" onClick={() => updateElements([single.id], (el) => (el.kind === "table" ? { ...el, rows: [...el.rows, el.rows[0]!.map(() => "")] } : el))}>
                  + Row
                </button>
                <button type="button" className="sl-mini" onClick={() => updateElements([single.id], (el) => (el.kind === "table" ? { ...el, rows: el.rows.map((r) => [...r, ""]) } : el))}>
                  + Column
                </button>
                <button type="button" className="sl-mini" disabled={single.rows.length <= 1} onClick={() => updateElements([single.id], (el) => (el.kind === "table" ? { ...el, rows: el.rows.slice(0, -1) } : el))}>
                  − Row
                </button>
                <button type="button" className="sl-mini" disabled={(single.rows[0]?.length ?? 0) <= 1} onClick={() => updateElements([single.id], (el) => (el.kind === "table" ? { ...el, rows: el.rows.map((r) => r.slice(0, -1)) } : el))}>
                  − Column
                </button>
              </div>
            </div>
          )}
          <label className="sl-notes">
            <span className="sr-only">Speaker notes</span>
            <textarea
              key={slide.id}
              placeholder="Click to add speaker notes"
              aria-label="Speaker notes"
              defaultValue={slide.notes}
              onChange={(e) => updateSlide((s) => ({ ...s, notes: e.target.value }), `notes:${slide.id}`)}
            />
          </label>
        </div>
      </div>
      <footer className="sl-status">
        <span>
          Slide {current + 1} of {deck.slides.length}
        </span>
        <span>{THEMES[deck.theme].label} theme</span>
        <span className="ml-auto">Double-click to edit text · Shift-click to select several · Ctrl+G to group · F5 to present</span>
      </footer>

      <div className="sl-print" aria-hidden>
        {deck.slides
          .filter((s) => !s.hidden)
          .map((s) => (
            <div key={s.id} className="sl-print-page">
              <SlideView deck={deck} slide={s} scale={1} />
            </div>
          ))}
      </div>
      {presenting && <Presenter deck={deck} start={current} onClose={() => setPresenting(false)} />}
    </div>
  );
}
