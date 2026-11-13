import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    customNodes: {
      setPageBreak: () => ReturnType;
      insertFootnote: (text: string) => ReturnType;
      insertShape: (attrs: Partial<ShapeAttrs>) => ReturnType;
      insertTableOfContents: () => ReturnType;
      setColumns: (count: number) => ReturnType;
    };
  }
}

/** Manual page break. */
export const PageBreak = Node.create({
  name: "pageBreak",
  // Above HardBreak, which also binds Mod-Enter.
  priority: 1000,
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: "div[data-page-break]" }],
  renderHTML: () => ["div", { "data-page-break": "", class: "doc-page-break", contenteditable: "false" }, ["span", {}, "Page break"]],
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: "paragraph" }]).run(),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Enter": () => this.editor.commands.setPageBreak() };
  },
});

/** Inline footnote reference; the note text is stored on the node. */
export const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      text: { default: "", parseHTML: (el) => el.getAttribute("data-text") ?? "", renderHTML: (a) => ({ "data-text": a.text as string }) },
    };
  },
  parseHTML: () => [{ tag: "sup[data-footnote]" }],
  renderHTML: ({ HTMLAttributes }) => ["sup", mergeAttributes(HTMLAttributes, { "data-footnote": "", class: "doc-footnote-ref" })],
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("sup");
      dom.className = "doc-footnote-ref";
      dom.setAttribute("data-footnote", "");
      dom.title = node.attrs.text as string;
      dom.addEventListener("click", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos !== undefined) editor.view.dom.dispatchEvent(new CustomEvent("octo:edit-footnote", { detail: { pos }, bubbles: true }));
      });
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== "footnote") return false;
          dom.title = updated.attrs.text as string;
          return true;
        },
      };
    };
  },
  addCommands() {
    return {
      insertFootnote:
        (text) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs: { text } }).run(),
    };
  },
});

export type ShapeKind = "rectangle" | "rounded" | "ellipse" | "triangle" | "line" | "arrow";
export interface ShapeAttrs {
  shape: ShapeKind;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

const HEX = /^#[0-9a-f]{6}$/i;
const safeColor = (c: unknown, fallback: string) => (typeof c === "string" && (HEX.test(c) || c === "none") ? c : fallback);
const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
};

export function normalizeShape(attrs: Partial<ShapeAttrs>): ShapeAttrs {
  const shapes: ShapeKind[] = ["rectangle", "rounded", "ellipse", "triangle", "line", "arrow"];
  return {
    shape: shapes.includes(attrs.shape as ShapeKind) ? (attrs.shape as ShapeKind) : "rectangle",
    width: clamp(attrs.width, 8, 1200, 200),
    height: clamp(attrs.height, 2, 1200, 100),
    fill: safeColor(attrs.fill, "#dbeafe"),
    stroke: safeColor(attrs.stroke, "#1e3a5f"),
    strokeWidth: clamp(attrs.strokeWidth, 0, 20, 2),
  };
}

/** Builds the SVG markup for a shape from validated attributes only. */
export function shapeSvg(input: Partial<ShapeAttrs>): string {
  const { shape, width: w, height: h, fill, stroke, strokeWidth: s } = normalizeShape(input);
  const half = s / 2;
  let body: string;
  switch (shape) {
    case "rectangle":
      body = `<rect x="${half}" y="${half}" width="${w - s}" height="${h - s}" fill="${fill}" stroke="${stroke}" stroke-width="${s}"/>`;
      break;
    case "rounded":
      body = `<rect x="${half}" y="${half}" width="${w - s}" height="${h - s}" rx="${Math.min(w, h) / 6}" fill="${fill}" stroke="${stroke}" stroke-width="${s}"/>`;
      break;
    case "ellipse":
      body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - half}" ry="${h / 2 - half}" fill="${fill}" stroke="${stroke}" stroke-width="${s}"/>`;
      break;
    case "triangle":
      body = `<polygon points="${w / 2},${half} ${w - half},${h - half} ${half},${h - half}" fill="${fill}" stroke="${stroke}" stroke-width="${s}"/>`;
      break;
    case "line":
      body = `<line x1="${half}" y1="${h / 2}" x2="${w - half}" y2="${h / 2}" stroke="${stroke}" stroke-width="${Math.max(1, s)}"/>`;
      break;
    case "arrow": {
      const head = Math.min(h, w / 3);
      body = `<line x1="${half}" y1="${h / 2}" x2="${w - head}" y2="${h / 2}" stroke="${stroke}" stroke-width="${Math.max(1, s)}"/><polygon points="${w - head},${h / 2 - head / 2} ${w},${h / 2} ${w - head},${h / 2 + head / 2}" fill="${stroke}"/>`;
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

export const Shape = Node.create({
  name: "shape",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    const attr = (name: keyof ShapeAttrs, def: string | number) => ({
      default: def,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name.toLowerCase()}`) ?? def,
      renderHTML: (a: Record<string, unknown>) => ({ [`data-${name.toLowerCase()}`]: String(a[name]) }),
    });
    return {
      shape: attr("shape", "rectangle"),
      width: attr("width", 200),
      height: attr("height", 100),
      fill: attr("fill", "#dbeafe"),
      stroke: attr("stroke", "#1e3a5f"),
      strokeWidth: attr("strokeWidth", 2),
    };
  },
  parseHTML: () => [{ tag: "div[data-shape]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-shape": "", class: "doc-shape" })],
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "doc-shape";
      dom.setAttribute("data-shape", "");
      // shapeSvg only interpolates validated numbers and hex colours.
      const render = (attrs: Record<string, unknown>) => (dom.innerHTML = shapeSvg(attrs as Partial<ShapeAttrs>));
      render(node.attrs);
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== "shape") return false;
          render(updated.attrs);
          return true;
        },
      };
    };
  },
  addCommands() {
    return {
      insertShape:
        (attrs) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs: normalizeShape(attrs) }).run(),
    };
  },
});

/** Live table of contents built from the document's headings. */
export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: "div[data-toc]" }],
  renderHTML: () => ["div", { "data-toc": "", class: "doc-toc" }],
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement("div");
      dom.className = "doc-toc";
      dom.setAttribute("data-toc", "");
      dom.contentEditable = "false";
      const render = () => {
        const items: { level: number; text: string; pos: number }[] = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "heading") items.push({ level: node.attrs.level as number, text: node.textContent, pos });
          return node.type.name !== "heading";
        });
        dom.replaceChildren();
        const title = document.createElement("div");
        title.className = "doc-toc-title";
        title.textContent = "Contents";
        dom.append(title);
        if (items.length === 0) {
          const empty = document.createElement("div");
          empty.className = "doc-toc-empty";
          empty.textContent = "Add headings to build the table of contents.";
          dom.append(empty);
        }
        for (const item of items) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "doc-toc-item";
          row.style.paddingLeft = `${(item.level - 1) * 18}px`;
          row.textContent = item.text || "(untitled heading)";
          row.addEventListener("click", () => editor.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run());
          dom.append(row);
        }
      };
      render();
      editor.on("update", render);
      return { dom, destroy: () => editor.off("update", render) };
    };
  },
  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: "paragraph" }]).run(),
    };
  },
});

/** A run of blocks laid out in 2–4 newspaper columns (a DOCX continuous section). */
export const ColumnSection = Node.create({
  name: "columnSection",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (el) => Math.min(Math.max(Number(el.getAttribute("data-columns")) || 2, 2), 4),
        renderHTML: (a) => ({ "data-columns": String(a.count), style: `column-count:${a.count};column-gap:0.5in` }),
      },
    };
  },
  parseHTML: () => [{ tag: "div[data-columns]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { class: "doc-columns" }), 0],
  addCommands() {
    return {
      setColumns:
        (count) =>
        ({ state, chain, commands }) => {
          // Find an enclosing column section, if any.
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === this.name) {
              const pos = $from.before(d);
              if (count <= 1) return commands.lift(this.name);
              return chain().command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { count });
                return true;
              }).run();
            }
          }
          if (count <= 1) return false;
          return commands.wrapIn(this.name, { count });
        },
    };
  },
});

const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,/i;

/**
 * Images are embedded as data URLs only. Remote URLs are rejected so a pasted
 * document can't make the browser fetch tracking pixels, and SVG is excluded
 * because it can carry script.
 */
export const SafeImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: { default: null, parseHTML: (el) => (DATA_IMAGE.test(el.getAttribute("src") ?? "") ? el.getAttribute("src") : null) },
      width: { default: null, parseHTML: (el) => Number(el.getAttribute("width")) || null },
      height: { default: null, parseHTML: (el) => Number(el.getAttribute("height")) || null },
    };
  },
  parseHTML() {
    return [{ tag: "img[src]", getAttrs: (el) => (DATA_IMAGE.test((el as HTMLElement).getAttribute("src") ?? "") ? null : false) }];
  },
}).configure({ allowBase64: true, inline: false });

export { DATA_IMAGE };
