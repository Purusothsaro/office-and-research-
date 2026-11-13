import type { FileFormat, FileKind } from "./formats";

export interface GeneratedFile {
  name: string;
  format: FileFormat;
  bytes: Uint8Array;
}

export interface TemplateInfo {
  id: string;
  title: string;
  description: string;
  kind: FileKind;
  format: FileFormat;
  build: () => Promise<GeneratedFile>;
}

// Libraries are imported lazily so the home screen bundle stays small.

interface DocBlock {
  heading?: string;
  title?: string;
  paragraphs?: string[];
  bullets?: string[];
  numbered?: string[];
}

async function buildDocx(blocks: DocBlock[], title: string): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType, Footer, PageNumber } = await import("docx");
  const children: InstanceType<typeof Paragraph>[] = [];
  for (const block of blocks) {
    if (block.title) children.push(new Paragraph({ text: block.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
    if (block.heading) children.push(new Paragraph({ text: block.heading, heading: HeadingLevel.HEADING_1 }));
    for (const text of block.paragraphs ?? []) children.push(new Paragraph({ children: [new TextRun(text)], spacing: { after: 160 } }));
    for (const text of block.bullets ?? []) children.push(new Paragraph({ text, bullet: { level: 0 } }));
    for (const text of block.numbered ?? []) {
      children.push(new Paragraph({ text, numbering: { reference: "clauses", level: 0 } }));
    }
  }
  const doc = new Document({
    creator: "OctoGenie Office",
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: {
      config: [
        { reference: "clauses", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] },
      ],
    },
    sections: [
      {
        // US Letter with 1" margins (the docx library defaults to A4).
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        // Templates number their pages; blank documents start without a footer.
        footers: blocks.length === 0 ? {} : {
          default: new Footer({
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT] })] }),
            ],
          }),
        },
        children: children.length ? children : [new Paragraph("")],
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

interface SheetSpec {
  name: string;
  columns: { header: string; width: number; numFmt?: string }[];
  rows?: (string | number | { formula: string })[][];
  totalRow?: (string | { formula: string } | null)[];
}

async function buildXlsx(sheets: SheetSpec[]): Promise<Uint8Array> {
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OctoGenie Office";
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name, { views: [{ state: "frozen", ySplit: spec.columns.length ? 1 : 0 }] });
    if (spec.columns.length) {
      sheet.columns = spec.columns.map((c) => ({ header: c.header, width: c.width, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
      const header = sheet.getRow(1);
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    }
    for (const row of spec.rows ?? []) sheet.addRow(row);
    if (spec.totalRow) {
      const total = sheet.addRow(spec.totalRow);
      total.font = { bold: true };
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

interface SlideSpec {
  title: string;
  subtitle?: string;
  bullets?: string[];
}

async function buildPptx(slides: SlideSpec[]): Promise<Uint8Array> {
  const mod = await import("pptxgenjs");
  const PptxGenJS = (mod as unknown as { default: typeof mod.default }).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "OctoGenie Office";
  slides.forEach((spec, index) => {
    const slide = pptx.addSlide();
    if (index === 0) {
      slide.background = { color: "1F3A5F" };
      slide.addText(spec.title, { x: 0.8, y: 2.4, w: 11.7, h: 1.2, fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Calibri" });
      if (spec.subtitle) slide.addText(spec.subtitle, { x: 0.8, y: 3.7, w: 11.7, h: 0.8, fontSize: 20, color: "C9D6E8", fontFace: "Calibri" });
      return;
    }
    slide.addText(spec.title, { x: 0.6, y: 0.4, w: 12, h: 0.9, fontSize: 30, bold: true, color: "1F3A5F", fontFace: "Calibri" });
    if (spec.bullets?.length) {
      slide.addText(
        spec.bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
        { x: 0.8, y: 1.5, w: 11.5, h: 5, fontSize: 20, color: "333333", fontFace: "Calibri", valign: "top" },
      );
    }
  });
  const out = await pptx.write({ outputType: "uint8array" });
  return out as Uint8Array;
}

export async function createBlankFile(kind: Exclude<FileKind, "pdf" | "workspace">): Promise<GeneratedFile> {
  switch (kind) {
    case "document":
      return { name: "Untitled document.docx", format: "docx", bytes: await buildDocx([], "Untitled document") };
    case "spreadsheet":
      return { name: "Untitled spreadsheet.xlsx", format: "xlsx", bytes: await buildXlsx([{ name: "Sheet1", columns: [] }]) };
    case "presentation":
      return { name: "Untitled presentation.pptx", format: "pptx", bytes: await buildPptx([{ title: "Click to add title", subtitle: "Click to add subtitle" }]) };
  }
}

/** An empty case workspace (documents, excerpts and notes are added in the editor). */
export function createBlankWorkspace(): GeneratedFile {
  const data = { kind: "octogenie-workspace", version: 1, documents: [], items: [], links: [], view: { x: 0, y: 0, zoom: 1 } };
  return { name: "Untitled workspace.octows", format: "octows", bytes: new TextEncoder().encode(JSON.stringify(data)) };
}

/** Plain-text blank used by the TXT editor. */
export function createBlankText(): GeneratedFile {
  return { name: "Untitled note.txt", format: "txt", bytes: new Uint8Array() };
}

// Template text is original, generic and contains bracketed placeholders.
// It is a drafting aid, not legal advice.

export const TEMPLATES: readonly TemplateInfo[] = [
  {
    id: "engagement-letter",
    title: "Engagement letter",
    description: "Scope of services, fees and terms for a new client matter.",
    kind: "document",
    format: "docx",
    build: async () => ({
      name: "Engagement letter.docx",
      format: "docx",
      bytes: await buildDocx(
        [
          { title: "Letter of Engagement" },
          { paragraphs: ["[Date]", "[Client name]", "[Client address]", "Re: [Matter description]", "Dear [Client name],"] },
          { paragraphs: ["Thank you for choosing [Firm name]. This letter confirms the terms on which we will act for you."] },
          { heading: "Scope of services", paragraphs: ["We will [describe the services]. Work outside this scope requires a separate written agreement."] },
          { heading: "Fees and billing", paragraphs: ["Our fees are charged at the hourly rates set out in Schedule 1. We bill monthly; invoices are payable within [30] days."] },
          { heading: "Responsibilities", bullets: ["Provide complete and accurate instructions.", "Tell us promptly about changes that affect the matter.", "Keep us informed of deadlines you are aware of."] },
          { heading: "Termination", paragraphs: ["Either party may end this engagement by written notice. Fees incurred up to that date remain payable."] },
          { paragraphs: ["Please sign and return a copy of this letter to confirm your agreement.", "Yours sincerely,", "[Responsible attorney]"] },
        ],
        "Engagement letter",
      ),
    }),
  },
  {
    id: "nda",
    title: "Mutual NDA",
    description: "Two-way confidentiality agreement with standard clauses.",
    kind: "document",
    format: "docx",
    build: async () => ({
      name: "Mutual non-disclosure agreement.docx",
      format: "docx",
      bytes: await buildDocx(
        [
          { title: "Mutual Non-Disclosure Agreement" },
          { paragraphs: ["This Agreement is made on [Date] between [Party A] and [Party B] (each a \"Party\")."] },
          {
            heading: "Terms",
            numbered: [
              "Confidential Information means non-public information disclosed by one Party to the other, in any form.",
              "The receiving Party will use Confidential Information only to evaluate [the proposed transaction].",
              "The receiving Party will protect Confidential Information with at least reasonable care.",
              "These obligations do not apply to information that is public, already known, or independently developed.",
              "This Agreement continues for [two] years from the date above.",
              "This Agreement is governed by the laws of [jurisdiction].",
            ],
          },
          { paragraphs: ["Signed for [Party A]: ____________________", "Signed for [Party B]: ____________________"] },
        ],
        "Mutual NDA",
      ),
    }),
  },
  {
    id: "legal-memo",
    title: "Legal memorandum",
    description: "Question presented, short answer, facts, discussion, conclusion.",
    kind: "document",
    format: "docx",
    build: async () => ({
      name: "Legal memorandum.docx",
      format: "docx",
      bytes: await buildDocx(
        [
          { title: "Memorandum" },
          { paragraphs: ["To: [Recipient]", "From: [Author]", "Date: [Date]", "Re: [Subject]"] },
          { heading: "Question presented", paragraphs: ["[State the legal question.]"] },
          { heading: "Short answer", paragraphs: ["[Answer in two or three sentences.]"] },
          { heading: "Facts", paragraphs: ["[Summarise the relevant facts.]"] },
          { heading: "Discussion", paragraphs: ["[Analyse the applicable law and apply it to the facts.]"] },
          { heading: "Conclusion", paragraphs: ["[Restate the answer and recommended next steps.]"] },
        ],
        "Legal memorandum",
      ),
    }),
  },
  {
    id: "time-sheet",
    title: "Billable time sheet",
    description: "Track time entries per matter with totals.",
    kind: "spreadsheet",
    format: "xlsx",
    build: async () => ({
      name: "Billable time sheet.xlsx",
      format: "xlsx",
      bytes: await buildXlsx([
        {
          name: "Time entries",
          columns: [
            { header: "Date", width: 12, numFmt: "yyyy-mm-dd" },
            { header: "Matter", width: 24 },
            { header: "Task", width: 40 },
            { header: "Hours", width: 10, numFmt: "0.00" },
            { header: "Rate", width: 12, numFmt: "#,##0.00" },
            { header: "Amount", width: 14, numFmt: "#,##0.00" },
          ],
          rows: [
            ["", "[Matter]", "[Task description]", 1.5, 250, { formula: "D2*E2" }],
            ["", "[Matter]", "[Task description]", 0.75, 250, { formula: "D3*E3" }],
          ],
          totalRow: ["Total", null, null, { formula: "SUM(D2:D3)" }, null, { formula: "SUM(F2:F3)" }],
        },
      ]),
    }),
  },
  {
    id: "matter-tracker",
    title: "Matter tracker",
    description: "Open matters, owners, status and next deadlines.",
    kind: "spreadsheet",
    format: "xlsx",
    build: async () => ({
      name: "Matter tracker.xlsx",
      format: "xlsx",
      bytes: await buildXlsx([
        {
          name: "Matters",
          columns: [
            { header: "Matter no.", width: 14 },
            { header: "Client", width: 24 },
            { header: "Matter", width: 32 },
            { header: "Responsible attorney", width: 22 },
            { header: "Status", width: 14 },
            { header: "Next deadline", width: 16, numFmt: "yyyy-mm-dd" },
          ],
          rows: [["[0001]", "[Client]", "[Matter description]", "[Attorney]", "Open", ""]],
        },
      ]),
    }),
  },
  {
    id: "client-briefing",
    title: "Client briefing",
    description: "Case overview deck: background, issues, strategy, next steps.",
    kind: "presentation",
    format: "pptx",
    build: async () => ({
      name: "Client briefing.pptx",
      format: "pptx",
      bytes: await buildPptx([
        { title: "[Matter name]", subtitle: "Client briefing · [Date]" },
        { title: "Background", bullets: ["[Key facts]", "[Parties involved]", "[Timeline to date]"] },
        { title: "Key issues", bullets: ["[Issue 1]", "[Issue 2]", "[Issue 3]"] },
        { title: "Strategy and options", bullets: ["[Option A: benefits and risks]", "[Option B: benefits and risks]"] },
        { title: "Next steps", bullets: ["[Action, owner, date]", "[Action, owner, date]"] },
      ]),
    }),
  },
];
