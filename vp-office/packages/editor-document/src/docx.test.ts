import { TEMPLATES } from "@octo/core";
import { getSchema, type JSONContent } from "@tiptap/core";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { documentExtensions } from "./extensions";
import { findMatches } from "./extensions/search";
import { exportDocx, importDocx, layoutPages, emptyDocument, type OctoDocument } from "./index";

const schema = getSchema(documentExtensions());
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const text = (t: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const p = (content: JSONContent[] | string, attrs: Record<string, unknown> = {}): JSONContent => ({
  type: "paragraph",
  attrs,
  content: typeof content === "string" ? [text(content)] : content,
});

function richDocument(): OctoDocument {
  return {
    version: 1,
    page: {
      size: "legal",
      orientation: "landscape",
      margins: { top: 1080, right: 720, bottom: 1080, left: 720 },
      header: { text: "Privileged & Confidential", align: "center" },
      footer: { text: "Smith v. Jones", align: "center" },
      pageNumbers: true,
    },
    content: {
      type: "doc",
      content: [
        p("Settlement Agreement", { styleName: "title" }),
        { type: "heading", attrs: { level: 1 }, content: [text("Recitals")] },
        p(
          [
            text("Bold", [{ type: "bold" }]),
            text(" and "),
            text("italic red", [{ type: "italic" }, { type: "textStyle", attrs: { color: "#c00000", fontSize: "14pt", fontFamily: "Georgia" } }]),
            text(" "),
            text("highlighted", [{ type: "highlight", attrs: { color: "#ffff00" } }]),
            text(" x"),
            text("2", [{ type: "superscript" }]),
            text(" "),
            text("link", [{ type: "link", attrs: { href: "https://example.com/terms" } }]),
            { type: "footnote", attrs: { text: "See Exhibit A." } },
          ],
          { textAlign: "justify", indent: 720, firstLine: -360, spaceBefore: 120, spaceAfter: 240, lineHeight: 1.5, border: "box", shading: "#eeeeee" },
        ),
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [
            { type: "listItem", content: [p("First clause")] },
            {
              type: "listItem",
              content: [p("Second clause"), { type: "bulletList", content: [{ type: "listItem", content: [p("Nested point")] }] }],
            },
          ],
        },
        { type: "pageBreak" },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", attrs: { colspan: 2, rowspan: 1, colwidth: null }, content: [p("Party")] },
                { type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p("Amount")] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { colspan: 1, rowspan: 2, colwidth: null }, content: [p("Plaintiff")] },
                { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p("Smith")] },
                { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p("$10,000")] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p("Co-plaintiff")] },
                { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p("$5,000")] },
              ],
            },
          ],
        },
        { type: "image", attrs: { src: PNG, width: 120, height: 80, alt: "Seal" } },
        { type: "blockMath", attrs: { latex: "E = mc^2" } },
        { type: "columnSection", attrs: { count: 2 }, content: [p("Left column text"), p("More text")] },
        { type: "horizontalRule" },
        p("End."),
      ],
    },
  };
}

async function withoutEmbedded(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  zip.remove("octo/document.json");
  return zip.generateAsync({ type: "uint8array" });
}

function find(node: JSONContent, type: string): JSONContent[] {
  const out: JSONContent[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === type) out.push(n);
    n.content?.forEach(walk);
  };
  walk(node);
  return out;
}

const plain = (n: JSONContent): string => (n.text ?? "") + (n.content ?? []).map(plain).join("");

describe("DOCX export", () => {
  it("produces a valid package with the expected parts", async () => {
    const { bytes, warnings } = await exportDocx(richDocument());
    expect(warnings).toEqual([]);
    const zip = await JSZip.loadAsync(bytes);
    for (const part of ["word/document.xml", "word/footnotes.xml", "word/numbering.xml", "octo/document.json"]) expect(zip.file(part)).not.toBeNull();
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain('w:orient="landscape"');
    expect(xml).toContain("Settlement Agreement");
    expect(await zip.file("[Content_Types].xml")!.async("string")).toContain('Extension="json"');
  });

  it("exports an empty document", async () => {
    const { bytes } = await exportDocx(emptyDocument());
    expect((await importDocx(bytes)).doc.content.type).toBe("doc");
  });
});

describe("DOCX import from XML (round trip without the embedded source)", () => {
  it("preserves structure, formatting and page setup", async () => {
    const { bytes } = await exportDocx(richDocument());
    const { doc, warnings, fromEmbedded } = await importDocx(await withoutEmbedded(bytes));
    expect(fromEmbedded).toBe(false);
    expect(warnings).toEqual([]);
    // The result must be valid for the editor schema.
    expect(() => schema.nodeFromJSON(doc.content).check()).not.toThrow();

    expect(doc.page).toEqual(richDocument().page);

    const blocks = doc.content.content!;
    expect(blocks[0]).toMatchObject({ type: "paragraph", attrs: { styleName: "title" } });
    expect(blocks[1]).toMatchObject({ type: "heading", attrs: { level: 1 } });

    const para = blocks[2]!;
    expect(para.attrs).toMatchObject({ textAlign: "justify", indent: 720, firstLine: -360, spaceBefore: 120, spaceAfter: 240, lineHeight: 1.5, border: "box", shading: "#eeeeee" });
    const runs = para.content!;
    expect(runs.find((r) => r.text === "Bold")?.marks).toEqual([{ type: "bold" }]);
    expect(runs.find((r) => r.text === "italic red")?.marks).toEqual(
      expect.arrayContaining([{ type: "italic" }, { type: "textStyle", attrs: { color: "#c00000", fontSize: "14pt", fontFamily: "Georgia" } }]),
    );
    expect(runs.find((r) => r.text === "highlighted")?.marks).toEqual([{ type: "highlight", attrs: { color: "#ffff00" } }]);
    expect(runs.find((r) => r.text === "2")?.marks).toEqual([{ type: "superscript" }]);
    expect(runs.find((r) => r.text === "link")?.marks).toEqual(expect.arrayContaining([{ type: "link", attrs: { href: "https://example.com/terms" } }]));
    expect(runs.find((r) => r.type === "footnote")).toEqual({ type: "footnote", attrs: { text: "See Exhibit A." } });

    const ordered = find(doc.content, "orderedList")[0]!;
    expect(ordered.content).toHaveLength(2);
    expect(plain(ordered.content![0]!)).toBe("First clause");
    const nested = find(ordered, "bulletList")[0]!;
    expect(plain(nested)).toBe("Nested point");

    expect(find(doc.content, "pageBreak")).toHaveLength(1);

    const table = find(doc.content, "table")[0]!;
    const [header, row1, row2] = table.content!;
    expect(header!.content!.map((c) => [c.type, c.attrs?.colspan, plain(c)])).toEqual([
      ["tableHeader", 2, "Party"],
      ["tableHeader", 1, "Amount"],
    ]);
    expect(row1!.content![0]!.attrs).toMatchObject({ rowspan: 2 });
    expect(row2!.content!.map(plain)).toEqual(["Co-plaintiff", "$5,000"]);

    const image = find(doc.content, "image")[0]!;
    expect(image.attrs).toMatchObject({ width: 120, height: 80, alt: "Seal" });
    expect(String(image.attrs!.src)).toMatch(/^data:image\/png;base64,/);

    expect(find(doc.content, "blockMath")[0]!.attrs).toEqual({ latex: "E = mc^2" });
    const columns = find(doc.content, "columnSection")[0]!;
    expect(columns.attrs).toEqual({ count: 2 });
    expect(columns.content!.map(plain)).toEqual(["Left column text", "More text"]);
    expect(find(doc.content, "horizontalRule")).toHaveLength(1);
    expect(plain(blocks[blocks.length - 1]!)).toBe("End.");
  });

  it("reads the generated templates", async () => {
    const letter = await TEMPLATES.find((t) => t.id === "engagement-letter")!.build();
    const { doc } = await importDocx(letter.bytes);
    expect(() => schema.nodeFromJSON(doc.content).check()).not.toThrow();
    expect(find(doc.content, "heading").map(plain)).toEqual(["Scope of services", "Fees and billing", "Responsibilities", "Termination"]);
    expect(find(doc.content, "bulletList")[0]!.content).toHaveLength(3);
    expect(doc.page.footer.text).toBe("Page {PAGE}");

    const nda = await TEMPLATES.find((t) => t.id === "nda")!.build();
    const ndaDoc = (await importDocx(nda.bytes)).doc;
    expect(find(ndaDoc.content, "orderedList")[0]!.content).toHaveLength(6);
  });
});

describe("embedded source", () => {
  it("reopens documents saved here losslessly", async () => {
    const original = richDocument();
    const { bytes } = await exportDocx(original);
    const result = await importDocx(bytes);
    expect(result.fromEmbedded).toBe(true);
    expect(result.doc).toEqual(original);
  });

  it("ignores the embedded source when another program changed the document", async () => {
    const { bytes } = await exportDocx(richDocument());
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    zip.file("word/document.xml", xml.replace("Settlement Agreement", "Amended Agreement"));
    const result = await importDocx(await zip.generateAsync({ type: "uint8array" }));
    expect(result.fromEmbedded).toBe(false);
    expect(plain(result.doc.content)).toContain("Amended Agreement");
  });
});

describe("lossy features are reported", () => {
  it("warns about tracked changes, comments, text boxes and fields", async () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    const body = `<w:document ${W}><w:body>
      <w:p><w:r><w:t xml:space="preserve">Kept </w:t></w:r><w:ins w:id="1" w:author="A"><w:r><w:t>inserted</w:t></w:r></w:ins><w:del w:id="2" w:author="A"><w:r><w:delText>deleted</w:delText></w:r></w:del></w:p>
      <w:p><w:commentRangeStart w:id="0"/><w:r><w:t>commented</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p>
      <w:p><w:r><w:drawing><wp:anchor><wp:extent cx="100" cy="100"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>box</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>
      <w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>DATE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1 May 2026</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
      <w:sectPr/></w:body></w:document>`;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/document.xml", body);
    const { doc, warnings } = await importDocx(await zip.generateAsync({ type: "uint8array" }));
    expect(plain(doc.content)).toContain("Kept inserted");
    expect(plain(doc.content)).not.toContain("deleted");
    expect(plain(doc.content)).not.toContain("DATE");
    expect(plain(doc.content)).toContain("1 May 2026");
    expect(warnings).toEqual(
      expect.arrayContaining([
        "Tracked changes were accepted.",
        "Comments aren't supported yet and were removed.",
        "Text boxes aren't supported; their text was removed.",
        "Fields (such as dates or cross-references) were converted to plain text.",
      ]),
    );
  });

  it("rejects malformed packages", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document><unclosed>");
    await expect(importDocx(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow();
  });
});

describe("page layout", () => {
  const block = (height: number, extra: Partial<{ footnoteHeights: number[]; pageBreak: boolean }> = {}) => ({ height, footnoteHeights: [], pageBreak: false, ...extra });

  it("fills pages and breaks before blocks that don't fit", () => {
    const layout = layoutPages([block(400), block(400), block(400)], 1000);
    expect(layout.pageStarts).toEqual([0, 2]);
    expect(layout.slack).toEqual([200, 600]);
  });

  it("honours manual page breaks", () => {
    expect(layoutPages([block(100), block(0, { pageBreak: true }), block(100)], 1000).pageStarts).toEqual([0, 2]);
  });

  it("reserves room for footnotes", () => {
    const layout = layoutPages([block(500), block(400, { footnoteHeights: [120] })], 1000);
    expect(layout.pageStarts).toEqual([0, 1]);
    expect(layout.footnoteArea[1]).toBe(134);
  });

  it("keeps an oversized block on its own page", () => {
    const layout = layoutPages([block(100), block(2500), block(100)], 1000);
    expect(layout.pageStarts).toEqual([0, 1, 2]);
    expect(layout.slack[1]).toBe(0);
  });
});

describe("search", () => {
  it("finds case-insensitive matches across marks", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [p([text("The "), text("Lessee", [{ type: "bold" }]), text(" and the lessee")])],
    });
    expect(findMatches(doc, "lessee", false)).toHaveLength(2);
    expect(findMatches(doc, "Lessee", true)).toHaveLength(1);
    expect(findMatches(doc, "e Le", false)).toHaveLength(2);
    expect(findMatches(doc, "e Le", true)).toHaveLength(1);
  });
});
