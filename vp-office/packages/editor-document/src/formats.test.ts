import { getSchema, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { documentExtensions } from "./extensions";
import { documentToMarkdown, documentToRtf, markdownToDocument, rtfToDocument, type OctoDocument } from "./index";
import { DEFAULT_PAGE } from "./model";

const schema = getSchema(documentExtensions());
const plain = (n: JSONContent): string => (n.text ?? "") + (n.content ?? []).map(plain).join(n.type === "doc" ? "\n" : "");
const find = (n: JSONContent, type: string): JSONContent[] => [...(n.type === type ? [n] : []), ...(n.content ?? []).flatMap((c) => find(c, type))];
const text = (t: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text: t, ...(marks ? { marks } : {}) });

function sample(): OctoDocument {
  return {
    version: 1,
    page: { ...structuredClone(DEFAULT_PAGE), size: "legal", orientation: "landscape", header: { text: "Confidential", align: "center" }, pageNumbers: true },
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [text("Terms of Settlement")] },
        { type: "paragraph", attrs: { textAlign: "justify" }, content: [text("The "), text("Payer", [{ type: "bold" }]), text(" shall pay "), text("€10,000", [{ type: "italic" }, { type: "textStyle", attrs: { color: "#c00000" } }]), text(" — promptly.")] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("First point")] }] }, { type: "listItem", content: [{ type: "paragraph", content: [text("Second point")] }] }] },
        { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("Step one")] }] }] },
        {
          type: "table",
          content: [
            { type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: "paragraph", content: [text("Party")] }] }, { type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: "paragraph", content: [text("Amount")] }] }] },
            { type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: "paragraph", content: [text("Acme")] }] }, { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: "paragraph", content: [text("100")] }] }] },
          ],
        },
        { type: "paragraph", content: [text("See "), text("the docket", [{ type: "link", attrs: { href: "https://example.com/d" } }]), text(".")] },
      ],
    },
  };
}

describe("RTF", () => {
  it("round-trips structure, formatting and page setup", () => {
    const { rtf, warnings } = documentToRtf(sample());
    expect(warnings).toEqual([]);
    expect(rtf.startsWith("{\\rtf1")).toBe(true);
    const { doc } = rtfToDocument(rtf);
    expect(() => schema.nodeFromJSON(doc.content).check()).not.toThrow();
    expect(doc.page).toMatchObject({ size: "legal", orientation: "landscape", header: { text: "Confidential" }, pageNumbers: true });
    const heading = find(doc.content, "heading")[0]!;
    expect(heading.attrs).toMatchObject({ level: 1 });
    expect(plain(heading)).toBe("Terms of Settlement");
    const para = doc.content.content!.find((b) => plain(b).startsWith("The Payer"))!;
    expect(para.attrs).toMatchObject({ textAlign: "justify" });
    expect(plain(para)).toBe("The Payer shall pay €10,000 — promptly.");
    expect(para.content!.find((r) => r.text === "Payer")!.marks).toEqual([{ type: "bold" }]);
    expect(para.content!.find((r) => r.text === "€10,000")!.marks).toEqual(expect.arrayContaining([{ type: "italic" }, { type: "textStyle", attrs: { color: "#c00000" } }]));
    expect(find(doc.content, "bulletList")[0]!.content!.map(plain)).toEqual(["First point", "Second point"]);
    expect(find(doc.content, "orderedList")[0]!.content!.map(plain)).toEqual(["Step one"]);
    const rows = find(doc.content, "tableRow").map((r) => r.content!.map(plain));
    expect(rows).toEqual([
      ["Party", "Amount"],
      ["Acme", "100"],
    ]);
    expect(plain(doc.content)).toContain("the docket");
  });

  it("reads typical WordPad/Word RTF: unicode, code page, lists, tables, headers", () => {
    // Kept out of String.raw: the test transformer would otherwise turn the RTF \u escape into a character.
    const EURO = "\\u8364?";
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\fswiss Arial;}{\f1\froman Times New Roman;}}{\colortbl ;\red0\green0\blue255;}
\paperw12240\paperh15840\margl1800\margr1800
{\header\pard\qc Draft {\field{\*\fldinst PAGE}{\fldrslt 1}}\par}
\pard\outlinelevel0\b\fs32 Notice\b0\fs24\par
\pard\qc Caf\'e9 ${EURO} price \cf1 blue\cf0\par
{\listtext\'b7\tab}\pard\fi-360\li720 Bullet one\par
{\listtext 1.\tab}\pard\fi-360\li720 Numbered\par
\trowd\cellx3000\cellx6000\pard\intbl A1\cell B1\cell\row
\pard End {\*\unknowndest secret}\par}`;
    const { doc } = rtfToDocument(rtf);
    expect(() => schema.nodeFromJSON(doc.content).check()).not.toThrow();
    expect(doc.page.header.text).toBe("Draft {PAGE}");
    expect(doc.page.margins.left).toBe(1800);
    expect(find(doc.content, "heading").map(plain)).toEqual(["Notice"]);
    const centered = doc.content.content!.find((b) => plain(b).startsWith("Café"))!;
    expect(plain(centered)).toBe("Café € price blue");
    expect(centered.attrs).toMatchObject({ textAlign: "center" });
    expect(centered.content!.find((r) => r.text === "blue")!.marks).toEqual([{ type: "textStyle", attrs: { color: "#0000ff" } }]);
    expect(find(doc.content, "bulletList").map(plain)).toEqual(["Bullet one"]);
    expect(find(doc.content, "orderedList").map(plain)).toEqual(["Numbered"]);
    expect(find(doc.content, "tableRow").map((r) => r.content!.map(plain))).toEqual([["A1", "B1"]]);
    expect(plain(doc.content)).toContain("End");
    expect(plain(doc.content)).not.toContain("secret");
  });

  it("rejects non-RTF input", () => {
    expect(() => rtfToDocument("hello")).toThrow();
  });
});

describe("Markdown", () => {
  it("round-trips headings, emphasis, lists, tables and links", () => {
    const { markdown } = documentToMarkdown(sample());
    expect(markdown).toContain("# Terms of Settlement");
    expect(markdown).toContain("**Payer**");
    expect(markdown).toContain("| Party | Amount |");
    expect(markdown).toContain("[the docket](https://example.com/d)");
    const { doc } = markdownToDocument(markdown);
    expect(() => schema.nodeFromJSON(doc.content).check()).not.toThrow();
    expect(find(doc.content, "heading").map(plain)).toEqual(["Terms of Settlement"]);
    expect(find(doc.content, "bulletList")[0]!.content!.map(plain)).toEqual(["First point", "Second point"]);
    expect(find(doc.content, "tableRow").map((r) => r.content!.map(plain))).toEqual([
      ["Party", "Amount"],
      ["Acme", "100"],
    ]);
    expect(JSON.stringify(doc.content)).toContain("https://example.com/d");
  });

  it("warns about formatting Markdown can't keep", () => {
    const { warnings } = documentToMarkdown(sample());
    expect(warnings).toEqual(expect.arrayContaining(["Colours, fonts, highlighting, alignment, borders and shading aren't kept in Markdown.", "Headers, footers and page numbers aren't kept in Markdown."]));
  });

  it("sanitises hostile Markdown", () => {
    const md = `# Hi\n\n<script>alert(1)</script>\n\n<img src="https://tracker.example/p.png" onerror="alert(2)">\n\n[click](javascript:alert(3))\n\n<a href="https://ok.example" onclick="alert(4)">ok</a>\n`;
    const { doc, warnings } = markdownToDocument(md);
    const json = JSON.stringify(doc.content);
    expect(json).not.toMatch(/alert|script|onerror|onclick|tracker\.example|javascript:/i);
    expect(json).toContain("https://ok.example");
    expect(warnings).toEqual(expect.arrayContaining(["Embedded HTML such as scripts or frames was removed."]));
  });
});
