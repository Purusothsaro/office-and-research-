import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { layoutPages, type BlockMetrics } from "../layout";
import { DEFAULT_PAGE, fillPageFields, pageGeometry, type PageSetup } from "../model";

export const PAGE_GAP = 24;
const FOOTNOTE_LINE = 16;
const FOOTNOTE_CHAR_WIDTH = 6.4;

export interface PaginationInfo {
  pages: number;
  /** Page number (1-based) containing each top-level block. */
  blockPages: number[];
}

interface PaginationState {
  decorations: DecorationSet;
  info: PaginationInfo;
  signature: string;
}

export const paginationKey = new PluginKey<PaginationState>("pagination");

export interface PaginationStorage {
  page: PageSetup;
  info: PaginationInfo;
  /** Bumped when page setup changes so the layout is re-measured. */
  version: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pagination: { setPageSetup: (page: PageSetup) => ReturnType };
  }
  interface Storage {
    pagination: PaginationStorage;
  }
}

interface FootnoteInfo {
  number: number;
  text: string;
}

function collectFootnotes(doc: PMNode): Map<number, FootnoteInfo[]> {
  // Keyed by top-level block index.
  const result = new Map<number, FootnoteInfo[]>();
  let n = 0;
  doc.forEach((block, _offset, index) => {
    block.descendants((node) => {
      if (node.type.name === "footnote") {
        const list = result.get(index) ?? [];
        list.push({ number: ++n, text: node.attrs.text as string });
        result.set(index, list);
      }
    });
  });
  return result;
}

function footnoteHeight(text: string, contentWidth: number): number {
  const lines = Math.max(1, Math.ceil(((text.length + 4) * FOOTNOTE_CHAR_WIDTH) / contentWidth));
  return lines * FOOTNOTE_LINE + 2;
}

function el(tag: string, className: string, style: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
}

function headerFooterText(page: PageSetup, kind: "header" | "footer", n: number, total: number): string {
  const base = fillPageFields(page[kind].text, n, total);
  if (kind === "footer" && page.pageNumbers) return base ? `${base}    Page ${n} of ${total}` : `Page ${n} of ${total}`;
  return base;
}

interface ChromeSpec {
  /** Bottom of page `endPage` (slack + footnotes + bottom margin), or null for the top of page 1. */
  endPage: number | null;
  slack: number;
  footnotes: FootnoteInfo[];
  footnoteArea: number;
  /** Next page number whose header follows, or null at the end of the document. */
  startPage: number | null;
  total: number;
}

function renderChrome(spec: ChromeSpec, page: PageSetup): HTMLElement {
  const g = pageGeometry(page);
  const root = el("div", "doc-page-chrome", { marginLeft: `-${g.marginsPx.left}px`, marginRight: `-${g.marginsPx.right}px` });
  root.contentEditable = "false";
  root.setAttribute("data-page-chrome", "");

  if (spec.endPage !== null) {
    const tail = el("div", "doc-page-tail", {
      height: `${spec.slack + spec.footnoteArea + g.marginsPx.bottom}px`,
      paddingLeft: `${g.marginsPx.left}px`,
      paddingRight: `${g.marginsPx.right}px`,
    });
    if (spec.footnotes.length) {
      const notes = el("div", "doc-footnotes", { bottom: `${g.marginsPx.bottom}px`, left: `${g.marginsPx.left}px`, right: `${g.marginsPx.right}px` });
      for (const f of spec.footnotes) {
        const row = el("div", "doc-footnote");
        row.append(el("sup", "", {}, String(f.number)), document.createTextNode(` ${f.text}`));
        notes.append(row);
      }
      tail.append(notes);
    }
    const footer = headerFooterText(page, "footer", spec.endPage, spec.total);
    if (footer) {
      tail.append(
        el("div", "doc-page-footer", { bottom: `${g.marginsPx.bottom / 2 - 8}px`, left: `${g.marginsPx.left}px`, right: `${g.marginsPx.right}px`, textAlign: page.footer.align }, footer),
      );
    }
    root.append(tail);
  }
  if (spec.endPage !== null && spec.startPage !== null) root.append(el("div", "doc-page-gap", { height: `${PAGE_GAP}px` }));
  if (spec.startPage !== null) {
    const head = el("div", "doc-page-head", { height: `${g.marginsPx.top}px` });
    const header = headerFooterText(page, "header", spec.startPage, spec.total);
    if (header) {
      head.append(
        el("div", "doc-page-header", { top: `${g.marginsPx.top / 2 - 8}px`, left: `${g.marginsPx.left}px`, right: `${g.marginsPx.right}px`, textAlign: page.header.align }, header),
      );
    }
    root.append(head);
  }
  return root;
}

function measure(view: EditorView, page: PageSetup): { decorations: DecorationSet; info: PaginationInfo; signature: string } | null {
  const g = pageGeometry(page);
  const doc = view.state.doc;
  const footnotes = collectFootnotes(doc);
  const blocks: BlockMetrics[] = [];
  const offsets: number[] = [];
  let ok = true;
  doc.forEach((node, offset, index) => {
    const dom = view.nodeDOM(offset) as HTMLElement | null;
    if (!dom || !(dom instanceof HTMLElement)) {
      ok = false;
      return;
    }
    offsets.push(offset);
    blocks.push({
      height: dom.offsetHeight,
      footnoteHeights: (footnotes.get(index) ?? []).map((f) => footnoteHeight(f.text, g.contentWidthPx)),
      pageBreak: node.type.name === "pageBreak",
    });
  });
  if (!ok) return null;

  const layout = layoutPages(blocks, g.contentHeightPx);
  const total = layout.pageStarts.length;
  const notesOnPage = layout.ranges.map(([start, end]) => {
    const list: FootnoteInfo[] = [];
    for (let i = start; i < end; i++) list.push(...(footnotes.get(i) ?? []));
    return list;
  });

  const decorations: Decoration[] = [];
  const pageKey = JSON.stringify(page);
  const parts: string[] = [`${total}|${pageKey}`];
  const add = (pos: number, side: number, spec: ChromeSpec) => {
    // The key must change whenever the rendered chrome would, or ProseMirror reuses stale DOM.
    const key = `chrome-${pageKey}-${JSON.stringify(spec)}-${pos}`;
    parts.push(key);
    decorations.push(Decoration.widget(pos, () => renderChrome(spec, page), { side, key, ignoreSelection: true }));
  };

  add(0, -1, { endPage: null, slack: 0, footnotes: [], footnoteArea: 0, startPage: 1, total });
  layout.pageStarts.slice(1).forEach((blockIndex, i) => {
    add(offsets[blockIndex]!, -1, {
      endPage: i + 1,
      slack: Math.round(layout.slack[i]!),
      footnotes: notesOnPage[i]!,
      footnoteArea: Math.round(layout.footnoteArea[i]!),
      startPage: i + 2,
      total,
    });
  });
  add(doc.content.size, 1, {
    endPage: total,
    slack: Math.round(layout.slack[total - 1]!),
    footnotes: notesOnPage[total - 1]!,
    footnoteArea: Math.round(layout.footnoteArea[total - 1]!),
    startPage: null,
    total,
  });

  const blockPages: number[] = [];
  layout.ranges.forEach(([start, end], p) => {
    for (let i = start; i < end; i++) blockPages[i] = p + 1;
  });
  return { decorations: DecorationSet.create(doc, decorations), info: { pages: total, blockPages }, signature: parts.join("\n") };
}

/**
 * Print-layout pagination. Page chrome (margins, gaps, headers, footers,
 * footnotes) is drawn with widget decorations between top-level blocks, so
 * the document stays one continuous ProseMirror flow.
 */
export const Pagination = Extension.create<{ onLayout?: (info: PaginationInfo) => void }, PaginationStorage>({
  name: "pagination",

  addOptions() {
    return { onLayout: undefined };
  },

  addStorage() {
    return { page: structuredClone(DEFAULT_PAGE), info: { pages: 1, blockPages: [] }, version: 0 };
  },

  addCommands() {
    return {
      setPageSetup:
        (page) =>
        ({ tr, dispatch, editor }) => {
          const storage = editor.storage.pagination;
          storage.page = page;
          storage.version++;
          if (dispatch) dispatch(tr.setMeta("addToHistory", false));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    // Read through the editor so commands and the plugin share one object.
    const storage = () => extension.editor.storage.pagination;
    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty, info: { pages: 1, blockPages: [] }, signature: "" }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as Partial<PaginationState> | undefined;
            if (meta?.decorations) return { decorations: meta.decorations, info: meta.info!, signature: meta.signature! };
            return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: { decorations: (state) => paginationKey.getState(state)?.decorations },
        view(view) {
          let frame = 0;
          let version = storage().version;
          const run = () => {
            frame = 0;
            if (view.isDestroyed) return;
            const result = measure(view, storage().page);
            if (!result) return;
            const current = paginationKey.getState(view.state);
            if (current?.signature === result.signature) return;
            storage().info = result.info;
            view.dispatch(view.state.tr.setMeta(paginationKey, result).setMeta("addToHistory", false));
            extension.options.onLayout?.(result.info);
          };
          const schedule = () => {
            if (!frame) frame = requestAnimationFrame(run);
          };
          const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
          observer?.observe(view.dom);
          // Images change height when they finish loading.
          const onLoad = () => schedule();
          view.dom.addEventListener("load", onLoad, true);
          schedule();
          return {
            update(_view, prev) {
              if (prev.doc !== view.state.doc || version !== storage().version) {
                version = storage().version;
                schedule();
              }
            },
            destroy() {
              observer?.disconnect();
              view.dom.removeEventListener("load", onLoad, true);
              if (frame) cancelAnimationFrame(frame);
            },
          };
        },
      }),
    ];
  },
});
