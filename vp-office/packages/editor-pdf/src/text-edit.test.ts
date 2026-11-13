import { PDFDocument, PDFName, StandardFonts } from "@cantoo/pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { buildPdf, preparePdf, type BuildReport, type TextEdit } from "./index";

interface Item {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

async function items(bytes: Uint8Array, pageNo = 1): Promise<Item[]> {
  const task = getDocument({ data: bytes.slice(), useWorkerFetch: false, verbosity: 0 } as never);
  const doc = await task.promise;
  const page = await doc.getPage(pageNo);
  const content = await page.getTextContent();
  const out = content.items.filter((i) => "str" in i && (i as Item).str.trim()) as Item[];
  await task.destroy();
  return out;
}

const text = async (bytes: Uint8Array) => (await items(bytes)).map((i) => i.str).join("|");

function editFor(item: Item, newText: string): TextEdit {
  const [a, b, c, d, x, y] = item.transform as [number, number, number, number, number, number];
  return {
    id: crypto.randomUUID(),
    page: 0,
    transform: [a, b, c, d, x, y],
    width: item.width,
    size: Math.hypot(c, d),
    original: item.str,
    text: newText,
    font: { family: "sans", bold: false, italic: false },
    color: null,
  };
}

async function twoLinePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("The Seller shall pay 10,000 USD.", { x: 72, y: 700, size: 12, font });
  page.drawText("Governing law: England and Wales.", { x: 72, y: 680, size: 12, font });
  return doc.save();
}

/** Raw content with chained show operators and T* line movement in one text object. */
async function chainedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const key = page.node.newFontDictionary("F1", font.ref);
  const content = doc.context.stream(`BT ${key.asString()} 12 Tf 14 TL 72 700 Td (Hello ) Tj (World) Tj T* (Second line stays put) Tj ET`);
  page.node.set(PDFName.of("Contents"), doc.context.register(content));
  return doc.save();
}

describe("editing existing PDF text", () => {
  it("replaces a line: the old text is removed from the content, not covered", async () => {
    const src = await twoLinePdf();
    const prepared = await preparePdf(src);
    const [first] = await items(prepared.base);
    const report: BuildReport = { coveredPages: [] };
    const out = await buildPdf(prepared.base, { ...prepared.state, textEdits: [editFor(first!, "The Seller shall pay 12,500 USD.")] }, report);
    const result = await text(out);
    expect(result).toContain("12,500 USD");
    expect(result).not.toContain("10,000");
    expect(result).toContain("Governing law: England and Wales.");
    expect(report.coveredPages).toEqual([]);
    // The replacement sits where the original was.
    const replaced = (await items(out)).find((i) => i.str.includes("12,500"))!;
    expect(replaced.transform[4]).toBeCloseTo(72, 0);
    expect(replaced.transform[5]).toBeCloseTo(700, 0);
  });

  it("deletes text when the replacement is empty", async () => {
    const prepared = await preparePdf(await twoLinePdf());
    const [, second] = await items(prepared.base);
    const out = await buildPdf(prepared.base, { ...prepared.state, textEdits: [editFor(second!, "")] });
    expect(await text(out)).toBe("The Seller shall pay 10,000 USD.");
  });

  it("handles chained operators without moving the following line", async () => {
    const prepared = await preparePdf(await chainedPdf());
    const before = await items(prepared.base);
    const hello = before.find((i) => i.str.startsWith("Hello"))!;
    const second = before.find((i) => i.str.startsWith("Second"))!;
    const out = await buildPdf(prepared.base, { ...prepared.state, textEdits: [editFor(hello, "Goodbye")] });
    const after = await items(out);
    expect(after.map((i) => i.str).join("|")).not.toMatch(/Hello|World/);
    expect(after.some((i) => i.str === "Goodbye")).toBe(true);
    const moved = after.find((i) => i.str.startsWith("Second"))!;
    expect(moved.transform[4]).toBeCloseTo(second.transform[4]!, 1);
    expect(moved.transform[5]).toBeCloseTo(second.transform[5]!, 1);
  });

  it("re-edits text that was edited before", async () => {
    const prepared = await preparePdf(await twoLinePdf());
    const [first] = await items(prepared.base);
    const once = await buildPdf(prepared.base, { ...prepared.state, textEdits: [editFor(first!, "First revision")] });
    const again = await preparePdf(once);
    const edited = (await items(again.base)).find((i) => i.str === "First revision")!;
    const twice = await buildPdf(again.base, { ...again.state, textEdits: [editFor(edited, "Second revision")] });
    const result = await text(twice);
    expect(result).toContain("Second revision");
    expect(result).not.toContain("First revision");
  });

  it("covers and reports text it can't remove (inside a form XObject)", async () => {
    const inner = await PDFDocument.load(await twoLinePdf());
    const doc = await PDFDocument.create();
    const [embedded] = await doc.embedPdf(await inner.save());
    doc.addPage([612, 792]).drawPage(embedded!);
    const prepared = await preparePdf(await doc.save());
    const [first] = await items(prepared.base);
    const report: BuildReport = { coveredPages: [] };
    await buildPdf(prepared.base, { ...prepared.state, textEdits: [editFor(first!, "Replaced")] }, report);
    expect(report.coveredPages).toEqual([1]);
  });
});
