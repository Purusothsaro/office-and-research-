import type { Paragraph, TextBody, TextRun } from "../model";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SAFE_COLOR = /^#[0-9a-f]{6}$/i;

/** HTML for the in-place editor. Only escaped text and validated styles are emitted. */
export function bodyToHtml(body: TextBody | undefined): string {
  const paragraphs = body?.paragraphs.length ? body.paragraphs : [{ runs: [{ text: "" }] }];
  return paragraphs
    .map((p) => {
      const attrs = [p.align ? `text-align:${p.align}` : "", p.bullet ? "display:list-item;margin-left:1.2em" : ""].filter(Boolean).join(";");
      const runs = p.runs
        .map((r) => {
          let html = escape(r.text) || "";
          const style = [r.color && SAFE_COLOR.test(r.color) ? `color:${r.color}` : "", r.size ? `font-size:${Number(r.size)}pt` : ""].filter(Boolean).join(";");
          if (style) html = `<span style="${style}">${html}</span>`;
          if (r.bold) html = `<b>${html}</b>`;
          if (r.italic) html = `<i>${html}</i>`;
          if (r.underline) html = `<u>${html}</u>`;
          return html;
        })
        .join("");
      return `<div data-bullet="${p.bullet ? 1 : 0}" data-level="${p.level ?? 0}"${attrs ? ` style="${attrs}"` : ""}>${runs || "<br>"}</div>`;
    })
    .join("");
}

interface Fmt {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  size?: number;
}

function rgbToHex(value: string): string | undefined {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(value);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  return SAFE_COLOR.test(value) ? value.toLowerCase() : undefined;
}

/** Reads the editor DOM back into paragraphs, keeping simple run formatting. */
export function htmlToBody(root: HTMLElement, previous: TextBody | undefined): TextBody {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;
  const start = (block?: HTMLElement) => {
    const align = block?.style.textAlign as Paragraph["align"] | "";
    current = {
      runs: [],
      ...(align ? { align } : {}),
      ...(block?.dataset.bullet === "1" || block?.style.display === "list-item" || block?.tagName === "LI" ? { bullet: true } : {}),
      ...(Number(block?.dataset.level) ? { level: Number(block?.dataset.level) } : {}),
    };
    paragraphs.push(current);
  };
  const push = (text: string, fmt: Fmt) => {
    if (!current) start();
    const run: TextRun = { text, ...fmt };
    const last = current!.runs[current!.runs.length - 1];
    if (last && JSON.stringify({ ...last, text: "" }) === JSON.stringify({ ...run, text: "" })) last.text += text;
    else current!.runs.push(run);
  };
  const walk = (node: Node, fmt: Fmt) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) push(text, fmt);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "BR") {
      if (!current) start();
      // A trailing <br> in an empty block is just a placeholder.
      if (node.parentElement && node.parentElement.childNodes.length > 1 && node.nextSibling) start();
      return;
    }
    const next: Fmt = { ...fmt };
    if (tag === "B" || tag === "STRONG" || Number(node.style.fontWeight) >= 600 || node.style.fontWeight === "bold") next.bold = true;
    if (tag === "I" || tag === "EM" || node.style.fontStyle === "italic") next.italic = true;
    if (tag === "U" || node.style.textDecoration.includes("underline")) next.underline = true;
    const color = node.style.color ? rgbToHex(node.style.color) : tag === "FONT" ? rgbToHex(node.getAttribute("color") ?? "") : undefined;
    if (color) next.color = color;
    const size = parseFloat(node.style.fontSize);
    if (size && node.style.fontSize.endsWith("pt")) next.size = size;
    const block = tag === "DIV" || tag === "P" || tag === "LI";
    if (block) start(node);
    node.childNodes.forEach((child) => walk(child, next));
  };
  root.childNodes.forEach((child) => walk(child, {}));
  if (paragraphs.length === 0) paragraphs.push({ runs: [{ text: "" }] });
  // Runs without an explicit size keep the size the text had before editing.
  const fallbackSize = previous?.paragraphs[0]?.runs[0]?.size;
  for (const p of paragraphs) {
    if (p.runs.length === 0) p.runs.push({ text: "" });
    for (const r of p.runs) if (r.size === undefined && fallbackSize) r.size = fallbackSize;
  }
  return { paragraphs, ...(previous?.valign ? { valign: previous.valign } : {}) };
}
