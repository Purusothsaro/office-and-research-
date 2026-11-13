import type { Editor } from "@tiptap/react";
import katex from "katex";
import { useMemo, useState } from "react";
import { isAllowedLink } from "../extensions";
import { type HeaderFooter, type Margins, type PageSetup, TWIPS_PER_INCH } from "../model";
import { DialogButton, Field, inputClass, Modal } from "./controls";

export function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = (editor.getAttributes("link").href as string | undefined) ?? "";
  const { from, to } = editor.state.selection;
  const selected = editor.state.doc.textBetween(from, to, " ");
  const [url, setUrl] = useState(existing);
  const [text, setText] = useState(selected);
  const valid = isAllowedLink(url.trim());

  const apply = () => {
    if (!valid) return;
    const href = url.trim();
    if (from === to) {
      editor.chain().focus().insertContent({ type: "text", text: text.trim() || href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    onClose();
  };

  return (
    <Modal
      title={existing ? "Edit link" : "Insert link"}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <DialogButton
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                onClose();
              }}
            >
              Remove link
            </DialogButton>
          )}
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton primary disabled={!valid} onClick={apply}>
            Apply
          </DialogButton>
        </>
      }
    >
      <form onSubmit={(e) => (e.preventDefault(), apply())} className="space-y-3">
        <Field label="Address" hint="Web (https://) and email (mailto:) links only.">
          {(id) => <input id={id} className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}
        </Field>
        {from === to && <Field label="Text to display">{(id) => <input id={id} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />}</Field>}
        {url && !valid && <p className="text-xs text-red-700">Enter a full https:// or mailto: address.</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function EquationDialog({ initial, display, onSubmit, onClose }: { initial: string; display: boolean; onSubmit: (latex: string, display: boolean) => void; onClose: () => void }) {
  const [latex, setLatex] = useState(initial);
  const [block, setBlock] = useState(display);
  // KaTeX escapes input and trust:false blocks \href, \url and HTML extensions.
  const preview = useMemo(() => katex.renderToString(latex || "\\;", { throwOnError: false, displayMode: block, trust: false }), [latex, block]);
  return (
    <Modal
      title="Equation"
      wide
      onClose={onClose}
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton primary disabled={!latex.trim()} onClick={() => onSubmit(latex.trim(), block)}>
            {initial ? "Update" : "Insert"}
          </DialogButton>
        </>
      }
    >
      <Field label="LaTeX" hint="For example: \frac{a}{b}, x^2, \sum_{i=1}^{n} i">
        {(id) => <textarea id={id} rows={3} className={`${inputClass} font-mono`} value={latex} onChange={(e) => setLatex(e.target.value)} />}
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> Display on its own line
      </label>
      <div className="min-h-12 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3" aria-label="Preview" dangerouslySetInnerHTML={{ __html: preview }} />
    </Modal>
  );
}

export function FootnoteDialog({ initial, onSubmit, onDelete, onClose }: { initial: string; onSubmit: (text: string) => void; onDelete?: () => void; onClose: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <Modal
      title={onDelete ? "Edit footnote" : "Insert footnote"}
      onClose={onClose}
      footer={
        <>
          {onDelete && <DialogButton onClick={onDelete}>Delete footnote</DialogButton>}
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton primary disabled={!text.trim()} onClick={() => onSubmit(text.trim())}>
            {onDelete ? "Update" : "Insert"}
          </DialogButton>
        </>
      }
    >
      <Field label="Footnote text">{(id) => <textarea id={id} rows={4} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
    </Modal>
  );
}

export function HeaderFooterDialog({ page, onSubmit, onClose }: { page: PageSetup; onSubmit: (page: PageSetup) => void; onClose: () => void }) {
  const [header, setHeader] = useState<HeaderFooter>(page.header);
  const [footer, setFooter] = useState<HeaderFooter>(page.footer);
  const [numbers, setNumbers] = useState(page.pageNumbers);
  const alignSelect = (value: HeaderFooter["align"], set: (a: HeaderFooter["align"]) => void, label: string) => (
    <select aria-label={label} className="rounded-md border border-slate-300 px-2 py-2" value={value} onChange={(e) => set(e.target.value as HeaderFooter["align"])}>
      <option value="left">Left</option>
      <option value="center">Center</option>
      <option value="right">Right</option>
    </select>
  );
  return (
    <Modal
      title="Header & footer"
      onClose={onClose}
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton primary onClick={() => onSubmit({ ...page, header, footer, pageNumbers: numbers })}>
            Apply
          </DialogButton>
        </>
      }
    >
      <Field label="Header" hint="Use {PAGE} and {PAGES} for page numbers.">
        {(id) => (
          <div className="flex gap-2">
            <input id={id} className={inputClass} value={header.text} onChange={(e) => setHeader({ ...header, text: e.target.value })} />
            {alignSelect(header.align, (align) => setHeader({ ...header, align }), "Header alignment")}
          </div>
        )}
      </Field>
      <Field label="Footer">
        {(id) => (
          <div className="flex gap-2">
            <input id={id} className={inputClass} value={footer.text} onChange={(e) => setFooter({ ...footer, text: e.target.value })} />
            {alignSelect(footer.align, (align) => setFooter({ ...footer, align }), "Footer alignment")}
          </div>
        )}
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /> Show "Page X of Y" in the footer
      </label>
    </Modal>
  );
}

export function MarginsDialog({ margins, onSubmit, onClose }: { margins: Margins; onSubmit: (m: Margins) => void; onClose: () => void }) {
  const toIn = (t: number) => String(Math.round((t / TWIPS_PER_INCH) * 100) / 100);
  const [values, setValues] = useState({ top: toIn(margins.top), right: toIn(margins.right), bottom: toIn(margins.bottom), left: toIn(margins.left) });
  const parsed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) as Record<keyof Margins, number>;
  const valid = Object.values(parsed).every((v) => Number.isFinite(v) && v >= 0 && v <= 4);
  return (
    <Modal
      title="Custom margins"
      onClose={onClose}
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton
            primary
            disabled={!valid}
            onClick={() =>
              onSubmit({
                top: Math.round(parsed.top * TWIPS_PER_INCH),
                right: Math.round(parsed.right * TWIPS_PER_INCH),
                bottom: Math.round(parsed.bottom * TWIPS_PER_INCH),
                left: Math.round(parsed.left * TWIPS_PER_INCH),
              })
            }
          >
            Apply
          </DialogButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {(["top", "bottom", "left", "right"] as const).map((side) => (
          <Field key={side} label={`${side[0]!.toUpperCase()}${side.slice(1)} (inches)`}>
            {(id) => <input id={id} type="number" step="0.05" min="0" max="4" className={inputClass} value={values[side]} onChange={(e) => setValues({ ...values, [side]: e.target.value })} />}
          </Field>
        ))}
      </div>
      {!valid && <p className="text-xs text-red-700">Margins must be between 0 and 4 inches.</p>}
    </Modal>
  );
}

export function WordCountDialog({ editor, pages, onClose }: { editor: Editor; pages: number; onClose: () => void }) {
  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n", " ");
  let paragraphs = 0;
  editor.state.doc.descendants((n) => {
    if (n.isTextblock && n.textContent.trim()) paragraphs++;
  });
  const rows: [string, number][] = [
    ["Pages", pages],
    ["Words", text.trim() ? text.trim().split(/\s+/).length : 0],
    ["Characters (no spaces)", text.replace(/\s/g, "").length],
    ["Characters (with spaces)", text.replace(/\n/g, "").length],
    ["Paragraphs", paragraphs],
  ];
  return (
    <Modal title="Word count" onClose={onClose} footer={<DialogButton onClick={onClose}>Close</DialogButton>}>
      <dl className="grid grid-cols-[1fr_auto] gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="text-right font-medium tabular-nums">{v.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl+S", "Save now"],
  ["Ctrl+Z / Ctrl+Y", "Undo / redo"],
  ["Ctrl+B / I / U", "Bold / italic / underline"],
  ["Ctrl+Shift+S", "Strikethrough"],
  ["Ctrl+. / Ctrl+,", "Superscript / subscript"],
  ["Ctrl+Shift+L / E / R / J", "Align left / center / right / justify"],
  ["Ctrl+Shift+7 / 8", "Numbered / bulleted list"],
  ["Ctrl+Alt+1…6", "Heading 1–6"],
  ["Ctrl+Alt+0", "Normal text"],
  ["Tab / Shift+Tab", "Increase / decrease indent"],
  ["Ctrl+Enter", "Page break"],
  ["Ctrl+K", "Insert link"],
  ["Ctrl+F / Ctrl+H", "Find / replace"],
  ["Ctrl+P", "Print or save as PDF"],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" wide onClose={onClose} footer={<DialogButton onClick={onClose}>Close</DialogButton>}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
