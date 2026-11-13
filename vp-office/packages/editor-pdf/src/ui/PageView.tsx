import { TextLayer, type PDFDocumentProxy, type PageViewport, type RenderTask } from "pdfjs-dist";
import { memo, useEffect, useRef, useState } from "react";
import {
  guessFont,
  inkBounds,
  normalizeRect,
  textRunRect,
  type TextEdit,
  translateAnnotation,
  unionRects,
  type FormFieldInfo,
  type FormValue,
  type PdfAnnotation,
  type PdfPoint,
  type PdfRect,
} from "../model";

export type Tool = "select" | "edittext" | "highlight" | "note" | "ink" | "text" | "signature";

interface RunItem {
  str: string;
  transform: TextEdit["transform"];
  width: number;
  size: number;
  font: TextEdit["font"];
}

const CSS_FAMILY: Record<TextEdit["font"]["family"], string> = {
  sans: "Helvetica, Arial, sans-serif",
  serif: '"Times New Roman", Times, serif',
  mono: '"Courier New", Courier, monospace',
};

export interface PageViewProps {
  doc: PDFDocumentProxy;
  source: number;
  /** Total rotation (intrinsic + user) in degrees. */
  rotation: number;
  scale: number;
  /** Size at scale 1 with rotation applied, for the placeholder before render. */
  size: { width: number; height: number };
  annotations: PdfAnnotation[];
  textEdits: TextEdit[];
  fields: FormFieldInfo[];
  formValues: Record<string, FormValue>;
  tool: Tool;
  color: string;
  inkWidth: number;
  signature: string | null;
  selectedId: string | null;
  editingId: string | null;
  readOnly: boolean;
  searchRects: PdfRect[];
  currentSearch: PdfRect[] | null;
  label: string;
  onCreate: (annotation: PdfAnnotation) => void;
  onUpdate: (annotation: PdfAnnotation, coalesce?: boolean) => void;
  onSelect: (id: string | null) => void;
  onEdit: (id: string | null) => void;
  onFormChange: (name: string, value: FormValue, coalesce: boolean) => void;
  onNeedSignature: () => void;
  onTextEdit: (edit: TextEdit) => void;
}

const newId = () => crypto.randomUUID();

function toPdf(viewport: PageViewport, x: number, y: number): PdfPoint {
  const [px, py] = viewport.convertToPdfPoint(x, y) as [number, number];
  return [px, py];
}

function toView(viewport: PageViewport, rect: PdfRect): { left: number; top: number; width: number; height: number } {
  const [a, b] = viewport.convertToViewportPoint(rect[0], rect[1]) as [number, number];
  const [c, d] = viewport.convertToViewportPoint(rect[2], rect[3]) as [number, number];
  return { left: Math.min(a, c), top: Math.min(b, d), width: Math.abs(c - a), height: Math.abs(d - b) };
}

/** Merges selection rectangles that sit on the same line. */
function mergeLineRects(rects: PdfRect[]): PdfRect[] {
  const sorted = rects.map(normalizeRect).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const out: PdfRect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - r[1]) < 3 && Math.abs(last[3] - r[3]) < 3 && r[0] <= last[2] + 4) {
      last[2] = Math.max(last[2], r[2]);
    } else out.push([...r]);
  }
  return out;
}

function PageViewImpl(props: PageViewProps) {
  const { doc, source, rotation, scale, size, annotations, tool, readOnly } = props;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [draft, setDraft] = useState<PdfPoint[] | null>(null);
  const [areaStart, setAreaStart] = useState<{ x: number; y: number } | null>(null);
  const [areaNow, setAreaNow] = useState<{ x: number; y: number } | null>(null);
  const [runs, setRuns] = useState<RunItem[] | null>(null);
  const [editingRun, setEditingRun] = useState<RunItem | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; original: PdfAnnotation; mode: "move" | "resize" } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Render only pages near the viewport.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { rootMargin: "800px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    let text: TextLayer | null = null;
    (async () => {
      const page = await doc.getPage(source + 1);
      if (cancelled) return;
      const vp = page.getViewport({ scale, rotation });
      setViewport(vp);
      const c = canvas.current!;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(vp.width * ratio);
      c.height = Math.floor(vp.height * ratio);
      c.style.width = `${vp.width}px`;
      c.style.height = `${vp.height}px`;
      task = page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await task.promise.catch(() => undefined);
      if (cancelled || !textLayer.current) return;
      textLayer.current.replaceChildren();
      text = new TextLayer({ textContentSource: page.streamTextContent(), container: textLayer.current, viewport: vp });
      await text.render().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      text?.cancel();
    };
  }, [doc, source, rotation, scale, visible]);

  // Text runs for the Edit text tool, with a best guess at each run's font.
  useEffect(() => {
    if (tool !== "edittext" || !visible || runs) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(source + 1);
      const content = await page.getTextContent();
      const list: RunItem[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [a, b, c, d, x, y] = item.transform as TextEdit["transform"];
        let fontName = "";
        try {
          if (page.commonObjs.has(item.fontName)) fontName = (page.commonObjs.get(item.fontName) as { name?: string }).name ?? "";
        } catch {
          // Font not loaded; fall back to the generic family.
        }
        list.push({ str: item.str, transform: [a, b, c, d, x, y], width: item.width, size: Math.hypot(c, d) || item.height, font: guessFont(fontName, content.styles[item.fontName]?.fontFamily) });
      }
      if (!cancelled) setRuns(list);
    })().catch(() => !cancelled && setRuns([]));
    return () => {
      cancelled = true;
    };
  }, [doc, source, tool, visible, runs]);

  const editFor = (run: RunItem) => props.textEdits.find((e) => Math.abs(e.transform[4] - run.transform[4]) < 0.5 && Math.abs(e.transform[5] - run.transform[5]) < 0.5);

  const commitRun = (run: RunItem, value: string) => {
    setEditingRun(null);
    const existing = editFor(run);
    if (!existing && value === run.str) return;
    props.onTextEdit({
      id: existing?.id ?? newId(),
      page: source,
      transform: run.transform,
      width: run.width,
      size: run.size,
      original: run.str,
      text: value,
      font: existing?.font ?? run.font,
      color: existing?.color ?? null,
    });
  };

  // Free canvas memory for pages far off-screen.
  useEffect(() => {
    if (!visible && canvas.current) {
      canvas.current.width = 0;
      canvas.current.height = 0;
    }
  }, [visible]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const base = () => ({ id: newId(), page: source, color: props.color, comment: "", author: "OctoGenie Office", createdAt: Date.now() });

  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly || !viewport || e.button !== 0) return;
    const p = local(e);
    const target = e.target as HTMLElement;
    if (target.closest("[data-form-field]") || target.closest("[data-annot-ui]")) return;
    if (tool === "ink") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDraft([toPdf(viewport, p.x, p.y)]);
    } else if (tool === "highlight") {
      setAreaStart(p);
      setAreaNow(p);
    } else if (tool === "select" && !target.closest("[data-annot-id]")) {
      props.onSelect(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!viewport) return;
    const p = local(e);
    if (draft) setDraft([...draft, toPdf(viewport, p.x, p.y)]);
    else if (areaStart) setAreaNow(p);
    const drag = dragRef.current;
    if (drag) {
      const dx = (p.x - drag.startX) / scale;
      const dy = (p.y - drag.startY) / scale;
      // Convert a screen delta to PDF space, accounting for rotation.
      const [ox, oy] = toPdf(viewport, drag.startX, drag.startY);
      const [nx, ny] = toPdf(viewport, drag.startX + dx * scale, drag.startY + dy * scale);
      const a = drag.original;
      if (drag.mode === "move") props.onUpdate(translateAnnotation(a, nx - ox, ny - oy), true);
      else {
        const [x1, y1, x2, y2] = a.rect;
        const w = Math.max(20, x2 - x1 + (nx - ox));
        const h = Math.max(12, y2 - y1 - (ny - oy));
        props.onUpdate({ ...a, rect: [x1, y2 - h, x1 + w, y2] }, true);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!viewport) return;
    const p = local(e);
    if (draft) {
      const points = [...draft, toPdf(viewport, p.x, p.y)];
      setDraft(null);
      if (points.length > 1) props.onCreate({ ...base(), kind: "ink", paths: [points], width: props.inkWidth, rect: inkBounds([points], props.inkWidth) });
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      return;
    }
    if (tool === "highlight") {
      const selection = window.getSelection();
      const start = areaStart;
      setAreaStart(null);
      setAreaNow(null);
      if (selection && !selection.isCollapsed && textLayer.current?.contains(selection.anchorNode)) {
        const boxRect = box.current!.getBoundingClientRect();
        const rects: PdfRect[] = [];
        for (let i = 0; i < selection.rangeCount; i++) {
          for (const r of Array.from(selection.getRangeAt(i).getClientRects())) {
            if (r.width < 1 || r.height < 1) continue;
            const [x1, y1] = toPdf(viewport, r.left - boxRect.left, r.bottom - boxRect.top);
            const [x2, y2] = toPdf(viewport, r.right - boxRect.left, r.top - boxRect.top);
            rects.push(normalizeRect([x1, y1, x2, y2]));
          }
        }
        const merged = mergeLineRects(rects);
        if (merged.length) props.onCreate({ ...base(), kind: "highlight", rects: merged, rect: unionRects(merged), quote: selection.toString().trim() });
        selection.removeAllRanges();
        return;
      }
      if (start && Math.hypot(p.x - start.x, p.y - start.y) > 6) {
        const [x1, y1] = toPdf(viewport, start.x, start.y);
        const [x2, y2] = toPdf(viewport, p.x, p.y);
        const rect = normalizeRect([x1, y1, x2, y2]);
        props.onCreate({ ...base(), kind: "highlight", rects: [rect], rect, quote: "" });
      }
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest("[data-annot-id]") || target.closest("[data-form-field]") || target.closest("[data-annot-ui]")) return;
    const [x, y] = toPdf(viewport, p.x, p.y);
    if (tool === "note") {
      props.onCreate({ ...base(), kind: "note", rect: [x, y - 20, x + 20, y] });
    } else if (tool === "text") {
      const a = { ...base(), kind: "text" as const, text: "", fontSize: 12, rect: [x, y - 20, x + 200, y] as PdfRect };
      props.onCreate(a);
      props.onEdit(a.id);
    } else if (tool === "signature") {
      if (!props.signature) return props.onNeedSignature();
      const img = new Image();
      img.onload = () => {
        const w = 180 / scale;
        const h = (w * img.naturalHeight) / img.naturalWidth;
        props.onCreate({ ...base(), kind: "signature", image: props.signature!, rect: [x, y - h, x + w, y] });
      };
      img.src = props.signature;
    }
  };

  const startDrag = (e: React.PointerEvent, a: PdfAnnotation, mode: "move" | "resize") => {
    if (readOnly || tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    props.onSelect(a.id);
    if (mode === "move" && a.kind === "highlight") return;
    (box.current as HTMLElement).setPointerCapture(e.pointerId);
    const p = local(e);
    dragRef.current = { id: a.id, startX: p.x, startY: p.y, original: a, mode };
  };

  const interactive = tool !== "select" && tool !== "highlight" && tool !== "edittext" && !readOnly;
  const width = viewport?.width ?? size.width * scale;
  const height = viewport?.height ?? size.height * scale;

  return (
    <div
      ref={box}
      className={`pdf-page pdf-tool-${tool}`}
      style={{ width, height, "--total-scale-factor": scale, "--scale-factor": scale } as React.CSSProperties}
      data-page-source={source}
      aria-label={props.label}
      role="region"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <canvas ref={canvas} className="pdf-canvas" aria-hidden />
      <div ref={textLayer} className="pdf-text-layer" style={{ pointerEvents: interactive || tool === "edittext" ? "none" : undefined }} />
      {viewport && props.textEdits.length > 0 && (
        <div className="pdf-edit-layer" aria-hidden>
          {props.textEdits.map((e) => {
            const cover = toView(viewport, textRunRect(e.transform, e.width, e.size));
            const [bx, by] = viewport.convertToViewportPoint(e.transform[4], e.transform[5]) as [number, number];
            const angle = (Math.atan2(e.transform[1], e.transform[0]) * 180) / Math.PI - (viewport.rotation ?? 0);
            return (
              <div key={e.id}>
                <div className="pdf-edit-cover" style={{ left: cover.left - 1, top: cover.top - 1, width: cover.width + 2, height: cover.height + 2 }} />
                {e.text && (
                  <span
                    className="pdf-edit-text"
                    style={{
                      left: bx,
                      top: by - e.size * scale * 0.8,
                      fontSize: e.size * scale,
                      fontFamily: CSS_FAMILY[e.font.family],
                      fontWeight: e.font.bold ? 700 : 400,
                      fontStyle: e.font.italic ? "italic" : "normal",
                      color: e.color ?? "#000",
                      transform: angle ? `rotate(${-angle}deg)` : undefined,
                    }}
                  >
                    {e.text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {viewport && tool === "edittext" && !readOnly && (
        <div className="pdf-run-layer">
          {(runs ?? []).map((run, i) => {
            const r = toView(viewport, textRunRect(run.transform, run.width, run.size));
            const edit = editFor(run);
            if (editingRun === run) {
              return (
                <input
                  key={i}
                  data-annot-ui
                  autoFocus
                  aria-label={`Edit text: ${run.str}`}
                  className="pdf-run-input"
                  defaultValue={edit ? edit.text : run.str}
                  style={{ left: r.left - 2, top: r.top - 2, width: Math.max(r.width + 40, 80), height: r.height + 4, fontSize: run.size * scale, fontFamily: CSS_FAMILY[run.font.family], fontWeight: run.font.bold ? 700 : 400 }}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => commitRun(run, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingRun(null);
                  }}
                />
              );
            }
            return (
              <button
                key={i}
                type="button"
                data-annot-ui
                className={`pdf-run ${edit ? "pdf-run-edited" : ""}`}
                style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
                aria-label={`Edit "${edit ? edit.text || "(deleted)" : run.str}"`}
                title="Click to edit this text"
                onClick={() => setEditingRun(run)}
              />
            );
          })}
        </div>
      )}
      {viewport && (
        <div className="pdf-annot-layer" style={{ pointerEvents: "none" }}>
          {props.searchRects.map((r, i) => (
            <div key={`s${i}`} className="pdf-search-hit" style={toView(viewport, r)} />
          ))}
          {props.currentSearch?.map((r, i) => <div key={`c${i}`} className="pdf-search-hit pdf-search-current" style={toView(viewport, r)} />)}
          {annotations.map((a) => (
            <AnnotationView
              key={a.id}
              a={a}
              viewport={viewport}
              scale={scale}
              selected={props.selectedId === a.id}
              editing={props.editingId === a.id}
              tool={tool}
              onPointerDown={(e, mode) => startDrag(e, a, mode)}
              onCommitText={(text) => {
                const lines = Math.max(1, text.split("\n").length + Math.floor(text.length / 34));
                const [x1, , x2, y2] = a.rect;
                props.onUpdate({ ...(a as Extract<PdfAnnotation, { kind: "text" }>), text, rect: [x1, y2 - (lines * 12 * 1.2 + 6), x2, y2] });
                props.onEdit(null);
              }}
              onStartEdit={() => !readOnly && a.kind === "text" && props.onEdit(a.id)}
            />
          ))}
          {draft && (
            <svg className="pdf-ink-draft" width={width} height={height}>
              <polyline
                points={draft.map(([x, y]) => (viewport.convertToViewportPoint(x, y) as number[]).join(",")).join(" ")}
                fill="none"
                stroke={props.color}
                strokeWidth={props.inkWidth * scale}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {areaStart && areaNow && (
            <div
              className="pdf-area-draft"
              style={{ left: Math.min(areaStart.x, areaNow.x), top: Math.min(areaStart.y, areaNow.y), width: Math.abs(areaNow.x - areaStart.x), height: Math.abs(areaNow.y - areaStart.y), background: props.color }}
            />
          )}
        </div>
      )}
      {viewport && (
        <div className="pdf-form-layer">
          {props.fields.flatMap((field) =>
            field.widgets
              .filter((w) => w.page === source)
              .map((w, i) => <FormWidgetView key={`${field.name}-${i}`} field={field} widget={w} viewport={viewport} value={props.formValues[field.name] ?? field.value} readOnly={readOnly || field.readOnly} onChange={props.onFormChange} />),
          )}
        </div>
      )}
      {interactive && <div className="pdf-interaction" aria-hidden />}
    </div>
  );
}

function AnnotationView({
  a,
  viewport,
  scale,
  selected,
  editing,
  tool,
  onPointerDown,
  onCommitText,
  onStartEdit,
}: {
  a: PdfAnnotation;
  viewport: PageViewport;
  scale: number;
  selected: boolean;
  editing: boolean;
  tool: Tool;
  onPointerDown: (e: React.PointerEvent, mode: "move" | "resize") => void;
  onCommitText: (text: string) => void;
  onStartEdit: () => void;
}) {
  const rect = toView(viewport, a.rect);
  const common = {
    "data-annot-id": a.id,
    className: `pdf-annot pdf-annot-${a.kind} ${selected ? "pdf-annot-selected" : ""}`,
    style: { ...rect, pointerEvents: tool === "select" ? ("auto" as const) : ("none" as const) },
    onPointerDown: (e: React.PointerEvent) => onPointerDown(e, "move"),
    title: a.comment || undefined,
  };
  const handle = selected && (a.kind === "text" || a.kind === "signature") && (
    <span data-annot-ui className="pdf-annot-handle" onPointerDown={(e) => onPointerDown(e, "resize")} aria-hidden />
  );
  switch (a.kind) {
    case "highlight":
      return (
        <div {...common} className={`${common.className} pdf-annot-highlight-box`} style={{ ...common.style, background: "transparent" }}>
          {a.rects.map((r, i) => {
            const v = toView(viewport, r);
            return <span key={i} className="pdf-hl-rect" style={{ left: v.left - rect.left, top: v.top - rect.top, width: v.width, height: v.height, background: a.color }} />;
          })}
        </div>
      );
    case "note":
      return (
        <div {...common} style={{ ...common.style, background: a.color }} role="img" aria-label={`Note: ${a.comment || "empty"}`}>
          <svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden>
            <path d="M4 6h12M4 10h12M4 14h8" stroke="#5a4500" strokeWidth="1.4" />
          </svg>
        </div>
      );
    case "ink":
      return (
        <div {...common}>
          <svg width={rect.width} height={rect.height} aria-hidden style={{ overflow: "visible" }}>
            {a.paths.map((path, i) => (
              <polyline
                key={i}
                points={path
                  .map(([x, y]) => {
                    const [vx, vy] = viewport.convertToViewportPoint(x, y) as [number, number];
                    return `${vx - rect.left},${vy - rect.top}`;
                  })
                  .join(" ")}
                fill="none"
                stroke={a.color}
                strokeWidth={a.width * scale}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </div>
      );
    case "text":
      return (
        <div {...common} onDoubleClick={onStartEdit} style={{ ...common.style, color: a.color, fontSize: a.fontSize * scale, pointerEvents: editing || tool === "select" ? "auto" : "none" }}>
          {editing ? (
            <textarea
              data-annot-ui
              autoFocus
              aria-label="Text box"
              defaultValue={a.text}
              className="pdf-text-edit"
              style={{ fontSize: a.fontSize * scale, color: a.color }}
              onBlur={(e) => onCommitText(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            />
          ) : (
            <span className="pdf-text-content">{a.text || "Text"}</span>
          )}
          {handle}
        </div>
      );
    case "signature":
      return (
        <div {...common}>
          <img src={a.image} alt="Signature" draggable={false} className="h-full w-full" />
          {handle}
        </div>
      );
  }
}

function FormWidgetView({
  field,
  widget,
  viewport,
  value,
  readOnly,
  onChange,
}: {
  field: FormFieldInfo;
  widget: FormFieldInfo["widgets"][number];
  viewport: PageViewport;
  value: FormValue;
  readOnly: boolean;
  onChange: (name: string, value: FormValue, coalesce: boolean) => void;
}) {
  const style = { ...toView(viewport, widget.rect) };
  const fontSize = Math.max(9, Math.min(style.height * 0.65, 16));
  const label = field.name;
  switch (field.type) {
    case "text":
      return field.multiline ? (
        <textarea data-form-field aria-label={label} className="pdf-field" style={{ ...style, fontSize }} value={String(value)} readOnly={readOnly} maxLength={field.maxLength} onChange={(e) => onChange(field.name, e.target.value, true)} />
      ) : (
        <input data-form-field aria-label={label} className="pdf-field" style={{ ...style, fontSize }} value={String(value)} readOnly={readOnly} maxLength={field.maxLength} onChange={(e) => onChange(field.name, e.target.value, true)} />
      );
    case "checkbox":
      return <input data-form-field type="checkbox" aria-label={label} className="pdf-field pdf-field-check" style={style} checked={value === true} disabled={readOnly} onChange={(e) => onChange(field.name, e.target.checked, false)} />;
    case "radio":
      return (
        <input
          data-form-field
          type="radio"
          name={`radio-${field.name}`}
          aria-label={`${label}: ${widget.exportValue}`}
          className="pdf-field pdf-field-check"
          style={style}
          checked={value === widget.exportValue}
          disabled={readOnly}
          onChange={() => onChange(field.name, widget.exportValue ?? "", false)}
        />
      );
    case "dropdown":
      return (
        <select data-form-field aria-label={label} className="pdf-field" style={{ ...style, fontSize }} value={String(value)} disabled={readOnly} onChange={(e) => onChange(field.name, e.target.value, false)}>
          <option value="" />
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "optionlist":
      return (
        <select
          data-form-field
          multiple
          aria-label={label}
          className="pdf-field"
          style={{ ...style, fontSize }}
          value={Array.isArray(value) ? value : []}
          disabled={readOnly}
          onChange={(e) => onChange(field.name, Array.from(e.target.selectedOptions, (o) => o.value), false)}
        >
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "signature":
      return <div data-form-field className="pdf-field-signature" style={style} title="Digital signatures aren't supported. Use the Signature tool to add a visible signature." />;
    default:
      return null;
  }
}

export const PageView = memo(PageViewImpl);
