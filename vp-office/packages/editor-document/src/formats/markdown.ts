import { generateHTML, generateJSON } from "@tiptap/html";
import DOMPurify from "dompurify";
import { marked } from "marked";
import TurndownService from "turndown";
import { documentExtensions } from "../extensions";
import { DEFAULT_PAGE, type OctoDocument } from "../model";

const extensions = () => documentExtensions();

/**
 * Markdown → editor document. Raw HTML in the Markdown is sanitised and then
 * mapped onto the editor schema, so scripts, event handlers and remote images
 * never reach the page.
 */
export function markdownToDocument(markdown: string): { doc: OctoDocument; warnings: string[] } {
  const warnings: string[] = [];
  const rawHtml = marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string;
  const clean = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "iframe", "object", "embed"], FORBID_ATTR: ["style"] });
  if (/<img\s[^>]*src=["']?https?:/i.test(clean)) warnings.push("Images linked from the web aren't loaded and were removed. Insert images from your computer instead.");
  if (/<(script|iframe|object|embed)/i.test(rawHtml)) warnings.push("Embedded HTML such as scripts or frames was removed.");
  const content = generateJSON(clean, extensions());
  return { doc: { version: 1, page: structuredClone(DEFAULT_PAGE), content }, warnings };
}

function turndown(): TurndownService {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", emDelimiter: "*", hr: "---" });
  td.addRule("strike", { filter: ["s", "del"] as never, replacement: (content) => `~~${content}~~` });
  td.addRule("footnote", { filter: (node) => node.nodeName === "SUP" && (node as HTMLElement).hasAttribute("data-footnote"), replacement: (_c, node) => ` (${(node as HTMLElement).getAttribute("data-text") ?? ""})` });
  td.addRule("pageBreak", { filter: (node) => (node as HTMLElement).hasAttribute?.("data-page-break"), replacement: () => "\n\n---\n\n" });
  td.addRule("math", {
    filter: (node) => (node as HTMLElement).hasAttribute?.("data-latex"),
    replacement: (_c, node) => {
      const latex = (node as HTMLElement).getAttribute("data-latex") ?? "";
      return (node as HTMLElement).getAttribute("data-type") === "block-math" ? `\n\n$$${latex}$$\n\n` : `$${latex}$`;
    },
  });
  td.addRule("table", {
    filter: "table",
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLTableElement).querySelectorAll("tr")).map((tr) => Array.from(tr.children).map((cell) => (cell.textContent ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim()));
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
      const [head, ...body] = rows;
      return `\n\n| ${pad(head!).join(" | ")} |\n| ${Array(width).fill("---").join(" | ")} |\n${body.map((r) => `| ${pad(r).join(" | ")} |`).join("\n")}\n\n`;
    },
  });
  td.remove(["div[data-toc]" as never]);
  return td;
}

/** Editor document → Markdown. Reports formatting Markdown can't hold. */
export function documentToMarkdown(doc: OctoDocument): { markdown: string; warnings: string[] } {
  const html = generateHTML(doc.content, extensions());
  const warnings = new Set<string>();
  const json = JSON.stringify(doc.content);
  if (/"textStyle"|"highlight"|"textAlign":"(center|right|justify)"|"shading"|"border"/.test(json)) warnings.add("Colours, fonts, highlighting, alignment, borders and shading aren't kept in Markdown.");
  if (/"type":"(shape|columnSection|footnote)"/.test(json)) warnings.add("Shapes, columns and footnotes are simplified in Markdown.");
  if (doc.page.header.text || doc.page.footer.text || doc.page.pageNumbers) warnings.add("Headers, footers and page numbers aren't kept in Markdown.");
  if (/"type":"image"/.test(json)) warnings.add("Images are embedded as data in the Markdown file, which some apps don't show.");
  const markdown = turndown().turndown(html).replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return { markdown, warnings: [...warnings] };
}
