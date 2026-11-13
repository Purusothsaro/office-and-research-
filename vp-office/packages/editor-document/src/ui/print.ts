import type { Editor } from "@tiptap/react";
import { PAPER_SIZES, TWIPS_PER_INCH, type PageSetup } from "../model";

const cssString = (text: string) => `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;

/** Builds CSS margin-box content, turning {PAGE}/{PAGES} into counters. */
function marginBoxContent(text: string, pageNumbers: boolean): string {
  const parts: string[] = [];
  for (const piece of text.split(/(\{PAGE\}|\{PAGES\})/)) {
    if (piece === "{PAGE}") parts.push("counter(page)");
    else if (piece === "{PAGES}") parts.push("counter(pages)");
    else if (piece) parts.push(cssString(piece));
  }
  if (pageNumbers) parts.push(cssString(parts.length ? "    Page " : "Page "), "counter(page)", cssString(" of "), "counter(pages)");
  return parts.join(" ");
}

export function printCss(page: PageSetup): string {
  const paper = PAPER_SIZES[page.size];
  const [w, h] = page.orientation === "portrait" ? [paper.width, paper.height] : [paper.height, paper.width];
  const inch = (t: number) => `${t / TWIPS_PER_INCH}in`;
  const box = (where: string, align: string, content: string) => (content ? `@${where}-${align === "left" ? "left" : align === "right" ? "right" : "center"} { content: ${content}; font: 10pt Calibri, Arial, sans-serif; color: #555; }` : "");
  return `@page {
  size: ${inch(w)} ${inch(h)};
  margin: ${inch(page.margins.top)} ${inch(page.margins.right)} ${inch(page.margins.bottom)} ${inch(page.margins.left)};
  ${box("top", page.header.align, marginBoxContent(page.header.text, false))}
  ${box("bottom", page.footer.align, marginBoxContent(page.footer.text, page.pageNumbers))}
}`;
}

/**
 * Prints using the browser's own pagination. Page chrome drawn by the editor
 * is hidden; headers, footers and page numbers come from CSS margin boxes,
 * and footnotes are listed at the end.
 */
export function printDocument(editor: Editor, page: PageSetup): void {
  const style = document.createElement("style");
  style.setAttribute("data-octo-print", "");
  style.textContent = printCss(page);
  document.head.append(style);

  const notes: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "footnote") notes.push(node.attrs.text as string);
  });
  let list: HTMLElement | null = null;
  if (notes.length) {
    list = document.createElement("ol");
    list.className = "doc-print-footnotes";
    for (const note of notes) {
      const li = document.createElement("li");
      li.textContent = note;
      list.append(li);
    }
    editor.view.dom.parentElement?.append(list);
  }
  document.body.classList.add("doc-printing");
  const cleanup = () => {
    style.remove();
    list?.remove();
    document.body.classList.remove("doc-printing");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Some browsers don't fire afterprint; clean up on the next tick as well.
  setTimeout(() => {
    if (!window.matchMedia?.("print").matches) cleanup();
  }, 1000);
}
