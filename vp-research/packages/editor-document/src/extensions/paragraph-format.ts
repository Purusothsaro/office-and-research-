import { Extension } from "@tiptap/core";
import { twipsToPx } from "../model";

export type BorderStyle = "none" | "box" | "top" | "bottom";
export type ParagraphStyleName = "title" | "subtitle" | null;

export interface ParagraphFormat {
  /** Left indent in twips. */
  indent: number | null;
  /** First-line indent in twips; negative values are hanging indents. */
  firstLine: number | null;
  spaceBefore: number | null;
  spaceAfter: number | null;
  /** Line height multiplier, e.g. 1.15. */
  lineHeight: number | null;
  border: BorderStyle | null;
  shading: string | null;
  styleName: ParagraphStyleName;
}

const BLOCK_TYPES = ["paragraph", "heading"];
const INDENT_STEP = 720; // 0.5"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setParagraphFormat: (format: Partial<ParagraphFormat>) => ReturnType;
      changeIndent: (direction: 1 | -1) => ReturnType;
    };
  }
}

const num = (value: string | null) => (value === null || value === "" || Number.isNaN(Number(value)) ? null : Number(value));
const HEX = /^#[0-9a-f]{6}$/i;

function css(attrs: Record<string, unknown>): string {
  const parts: string[] = [];
  const a = attrs as Partial<ParagraphFormat>;
  if (a.indent) parts.push(`margin-left:${twipsToPx(a.indent)}px`);
  if (a.firstLine) parts.push(`text-indent:${twipsToPx(a.firstLine)}px`);
  if (a.spaceBefore !== null && a.spaceBefore !== undefined) parts.push(`padding-top:${twipsToPx(a.spaceBefore)}px`);
  if (a.spaceAfter !== null && a.spaceAfter !== undefined) parts.push(`padding-bottom:${twipsToPx(a.spaceAfter)}px`);
  if (a.lineHeight) parts.push(`line-height:${a.lineHeight}`);
  if (a.shading && HEX.test(a.shading)) parts.push(`background-color:${a.shading}`);
  if (a.border === "box") parts.push("border:1px solid #333;padding-left:4px;padding-right:4px");
  if (a.border === "top") parts.push("border-top:1px solid #333");
  if (a.border === "bottom") parts.push("border-bottom:1px solid #333");
  return parts.join(";");
}

/** Paragraph-level formatting shared by paragraphs and headings. */
export const ParagraphFormatting = Extension.create({
  name: "paragraphFormat",

  addGlobalAttributes() {
    const attr = (name: keyof ParagraphFormat, parse: (v: string | null) => unknown) => ({
      default: null,
      parseHTML: (el: HTMLElement) => parse(el.getAttribute(`data-${name.toLowerCase()}`)),
      renderHTML: (attrs: Record<string, unknown>) => (attrs[name] === null || attrs[name] === undefined ? {} : { [`data-${name.toLowerCase()}`]: String(attrs[name]) }),
    });
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          indent: attr("indent", num),
          firstLine: attr("firstLine", num),
          spaceBefore: attr("spaceBefore", num),
          spaceAfter: attr("spaceAfter", num),
          lineHeight: attr("lineHeight", num),
          border: attr("border", (v) => (v === "box" || v === "top" || v === "bottom" ? v : null)),
          shading: attr("shading", (v) => (v && HEX.test(v) ? v : null)),
          styleName: attr("styleName", (v) => (v === "title" || v === "subtitle" ? v : null)),
          // Computed inline style; never parsed back.
          formatStyle: {
            default: null,
            parseHTML: () => null,
            renderHTML: (attrs: Record<string, unknown>) => {
              const style = css(attrs);
              return style ? { style } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphFormat:
        (format) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (BLOCK_TYPES.includes(node.type.name)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...format });
          });
          if (dispatch) dispatch(tr);
          return true;
        },
      changeIndent:
        (direction) =>
        ({ tr, state, dispatch, editor }) => {
          if (editor.isActive("listItem")) {
            return direction > 0 ? editor.commands.sinkListItem("listItem") : editor.commands.liftListItem("listItem");
          }
          const { from, to } = state.selection;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!BLOCK_TYPES.includes(node.type.name)) return;
            const next = Math.max(0, Math.min(7200, ((node.attrs.indent as number | null) ?? 0) + direction * INDENT_STEP));
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next || null });
          });
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => (this.editor.isActive("table") ? false : this.editor.commands.changeIndent(1)),
      "Shift-Tab": () => (this.editor.isActive("table") ? false : this.editor.commands.changeIndent(-1)),
    };
  },
});
