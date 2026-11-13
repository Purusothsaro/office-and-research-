import { Extension, type AnyExtension } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import Highlight from "@tiptap/extension-highlight";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { CharacterCount, Dropcursor, Gapcursor, Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { ColumnSection, Footnote, PageBreak, SafeImage, Shape, TableOfContents } from "./nodes";
import { Pagination, type PaginationInfo } from "./pagination";
import { ParagraphFormatting } from "./paragraph-format";
import { SearchReplace } from "./search";

export const ALLOWED_LINK_PROTOCOLS = ["http", "https", "mailto"];

export function isAllowedLink(url: string): boolean {
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    if (!/^(https?:|mailto:)$/.test(parsed.protocol)) return false;
    return /^(https?:\/\/|mailto:)/i.test(url.trim());
  } catch {
    return false;
  }
}

/**
 * Ctrl+Home/End handled by the editor: the browser's native caret movement
 * gets confused by the non-editable page chrome around the content.
 */
const DocumentNavigation = Extension.create({
  name: "documentNavigation",
  addKeyboardShortcuts() {
    const move = (toEnd: boolean, extend: boolean) => () => {
      const { state, view } = this.editor;
      const target = toEnd ? Selection.atEnd(state.doc) : Selection.atStart(state.doc);
      const selection = extend ? TextSelection.between(state.selection.$anchor, target.$head) : target;
      view.dispatch(state.tr.setSelection(selection).scrollIntoView());
      return true;
    };
    return { "Mod-End": move(true, false), "Mod-Home": move(false, false), "Mod-Shift-End": move(true, true), "Mod-Shift-Home": move(false, true) };
  },
});

export interface ExtensionOptions {
  /** Interactive editors paginate; headless (export/tests) don't need to. */
  paginate?: boolean;
  onLayout?: (info: PaginationInfo) => void;
  onMathClick?: (kind: "inline" | "block", latex: string, pos: number) => void;
}

/** Extensions shared by the editor UI, DOCX conversion and tests. */
export function documentExtensions(options: ExtensionOptions = {}): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      dropcursor: false,
      gapcursor: false,
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ALLOWED_LINK_PROTOCOLS,
        defaultProtocol: "https",
        isAllowedUri: (url) => isAllowedLink(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
      },
    }),
    Dropcursor,
    Gapcursor,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    TableKit.configure({ table: { resizable: true, HTMLAttributes: { class: "doc-table" } } }),
    SafeImage,
    InlineMath.configure({
      katexOptions: { throwOnError: false, trust: false },
      onClick: (node, pos) => options.onMathClick?.("inline", node.attrs.latex as string, pos),
    }),
    BlockMath.configure({
      katexOptions: { throwOnError: false, trust: false },
      onClick: (node, pos) => options.onMathClick?.("block", node.attrs.latex as string, pos),
    }),
    ParagraphFormatting,
    PageBreak,
    Footnote,
    Shape,
    TableOfContents,
    ColumnSection,
    SearchReplace,
    DocumentNavigation,
    CharacterCount,
    Placeholder.configure({ placeholder: ({ editor }) => (editor.isEmpty ? "Start typing…" : ""), showOnlyWhenEditable: true }),
  ];
  if (options.paginate) extensions.push(Pagination.configure(options.onLayout ? { onLayout: options.onLayout } : {}));
  return extensions;
}

export * from "./nodes";
export * from "./pagination";
export * from "./paragraph-format";
export * from "./search";
