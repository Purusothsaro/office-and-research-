import { TEMPLATES } from "@octo/core";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { cellStyle, getResource, RESOURCE, type WorkbookData } from "./snapshot";
import { exportCsv, exportXlsx, importCsv, importXlsx } from "./xlsx";

async function sampleXlsx(): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Fees", { properties: { tabColor: { argb: "FF1E3A5F" } }, views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  ws.columns = [{ width: 24 }, { width: 12 }, { width: 14 }];
  ws.getCell("A1").value = "Matter";
  ws.getCell("B1").value = "Hours";
  ws.getCell("C1").value = "Amount";
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  ws.getCell("A2").value = "Smith v Jones";
  ws.getCell("B2").value = 2.5;
  ws.getCell("C2").value = { formula: "B2*250", result: 625 };
  ws.getCell("C2").numFmt = "#,##0.00";
  ws.getCell("A3").value = new Date(Date.UTC(2026, 0, 15));
  ws.getCell("A3").numFmt = "yyyy-mm-dd";
  ws.getCell("A4").value = { text: "Docket", hyperlink: "https://example.com/docket" };
  ws.getCell("A5").value = "Merged heading";
  ws.mergeCells("A5:C5");
  ws.getCell("A5").alignment = { horizontal: "center", wrapText: true };
  ws.getCell("B2").border = { bottom: { style: "double", color: { argb: "FFFF0000" } } };
  ws.getCell("B6").dataValidation = { type: "list", allowBlank: true, formulae: ['"Open,Closed,Pending"'] };
  ws.getCell("B2").note = "Billed at partner rate";
  ws.autoFilter = "A1:C3";
  ws.getRow(2).height = 30;
  ws.getColumn(3).hidden = false;
  const second = book.addWorksheet("Notes");
  second.getCell("A1").value = true;
  return new Uint8Array(await book.xlsx.writeBuffer());
}

const sheetByName = (wb: WorkbookData, name: string) => Object.values(wb.sheets).find((s) => s.name === name)!;

async function stripEmbed(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  zip.remove("octo/workbook.json");
  return zip.generateAsync({ type: "uint8array" });
}

function checkWorkbook(wb: WorkbookData) {
  expect(wb.sheetOrder.map((id) => wb.sheets[id]!.name)).toEqual(["Fees", "Notes"]);
  const fees = sheetByName(wb, "Fees");
  expect(fees.tabColor).toBe("#1e3a5f");
  expect(fees.freeze).toMatchObject({ xSplit: 1, ySplit: 1 });
  expect(fees.cellData[0]![0]!.v).toBe("Matter");
  expect(cellStyle(wb, fees.cellData[0]![0]!)).toMatchObject({ bl: 1, cl: { rgb: "#ffffff" }, bg: { rgb: "#1e3a5f" } });
  expect(fees.cellData[1]![1]).toMatchObject({ v: 2.5, t: 2 });
  expect(fees.cellData[1]![2]).toMatchObject({ f: "=B2*250", v: 625 });
  expect(cellStyle(wb, fees.cellData[1]![2]!)?.n?.pattern).toBe("#,##0.00");
  expect(cellStyle(wb, fees.cellData[1]![1]!)?.bd?.b).toMatchObject({ s: 7, cl: { rgb: "#ff0000" } });
  // 2026-01-15 as an Excel serial date.
  expect(fees.cellData[2]![0]!.v).toBe(46037);
  expect(fees.cellData[3]![0]!.v).toBe("Docket");
  expect(JSON.stringify(fees.cellData[3]![0])).toContain("https://example.com/docket");
  expect(fees.mergeData).toContainEqual({ startRow: 4, endRow: 4, startColumn: 0, endColumn: 2 });
  expect(cellStyle(wb, fees.cellData[4]![0]!)).toMatchObject({ ht: 2, tb: 3 });
  expect(fees.columnData[0]!.w).toBe(180);
  expect(fees.rowData[1]!.h).toBe(40);
  const validation = getResource<Record<string, { type: string; formula1?: string; ranges: unknown[] }[]>>(wb, RESOURCE.validation)!;
  expect(validation[fees.id]).toEqual([expect.objectContaining({ type: "list", formula1: "Open,Closed,Pending", ranges: [{ startRow: 5, endRow: 5, startColumn: 1, endColumn: 1 }] })]);
  expect(getResource<Record<string, { ref: unknown }>>(wb, RESOURCE.filter)![fees.id]!.ref).toEqual({ startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 });
  const notes = getResource<Record<string, Record<number, Record<number, { note: string }>>>>(wb, RESOURCE.notes)!;
  expect(notes[fees.id]![1]![1]!.note).toBe("Billed at partner rate");
  expect(sheetByName(wb, "Notes").cellData[0]![0]).toMatchObject({ v: 1, t: 3 });
}

describe("XLSX import", () => {
  it("maps values, formulas, styles, layout, validation, filters, links and notes", async () => {
    const { workbook, warnings, fromEmbedded } = await importXlsx(await sampleXlsx());
    expect(fromEmbedded).toBe(false);
    expect(warnings).toEqual([]);
    checkWorkbook(workbook);
  });

  it("reads the generated spreadsheet templates with their formulas", async () => {
    const sheet = await TEMPLATES.find((t) => t.id === "time-sheet")!.build();
    const { workbook } = await importXlsx(sheet.bytes);
    const s = workbook.sheets[workbook.sheetOrder[0]!]!;
    expect(s.name).toBe("Time entries");
    expect(s.cellData[3]![5]!.f).toBe("=SUM(F2:F3)");
    expect(s.freeze?.ySplit).toBe(1);
  });
});

describe("XLSX export", () => {
  it("round-trips through Excel's format without the embedded snapshot", async () => {
    const { workbook } = await importXlsx(await sampleXlsx());
    const { bytes } = await exportXlsx(workbook);
    const again = await importXlsx(await stripEmbed(bytes));
    expect(again.fromEmbedded).toBe(false);
    checkWorkbook(again.workbook);
  });

  it("reopens workbooks saved here losslessly, including features Excel doesn't get", async () => {
    const { workbook } = await importXlsx(await sampleXlsx());
    workbook.resources = [...(workbook.resources ?? []), { name: "SHEET_CONDITIONAL_FORMATTING_PLUGIN", data: '{"x":1}' }];
    const { bytes, warnings } = await exportXlsx(workbook);
    expect(warnings).toEqual(["Conditional formatting is kept for this app but isn't written for Excel yet."]);
    const again = await importXlsx(bytes);
    expect(again.fromEmbedded).toBe(true);
    expect(again.workbook).toEqual(workbook);
  });

  it("ignores the snapshot when Excel changed the file", async () => {
    const { workbook } = await importXlsx(await sampleXlsx());
    const { bytes } = await exportXlsx(workbook);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as ArrayBuffer);
    book.getWorksheet("Fees")!.getCell("A2").value = "Changed in Excel";
    const edited = new Uint8Array(await book.xlsx.writeBuffer());
    const zip = await JSZip.loadAsync(edited);
    // Simulate Excel keeping our unknown part.
    zip.file("octo/workbook.json", await (await JSZip.loadAsync(bytes)).file("octo/workbook.json")!.async("string"));
    const again = await importXlsx(await zip.generateAsync({ type: "uint8array" }));
    expect(again.fromEmbedded).toBe(false);
    expect(sheetByName(again.workbook, "Fees").cellData[1]![0]!.v).toBe("Changed in Excel");
  });

  it("reports macros, charts and images in uploaded workbooks", async () => {
    const zip = await JSZip.loadAsync(await sampleXlsx());
    zip.file("xl/vbaProject.bin", "x");
    zip.file("xl/charts/chart1.xml", "<c/>");
    const { warnings } = await importXlsx(await zip.generateAsync({ type: "uint8array" }));
    expect(warnings).toEqual(expect.arrayContaining(["Charts from Excel aren't supported yet and were removed.", "Macros are never run and are removed when the workbook is saved here."]));
  });
});

describe("CSV", () => {
  it("imports numbers as numbers and keeps leading zeros as text", () => {
    const wb = importCsv('name,amount,zip\n"Doe, Jane",1250.5,02134\n', "clients");
    const s = wb.sheets[wb.sheetOrder[0]!]!;
    expect(s.cellData[1]![0]).toEqual({ v: "Doe, Jane", t: 1 });
    expect(s.cellData[1]![1]).toEqual({ v: 1250.5, t: 2 });
    expect(s.cellData[1]![2]).toEqual({ v: "02134", t: 1 });
  });

  it("exports values and neutralises formula injection", () => {
    const wb = importCsv("a,b\n=HYPERLINK(\"x\"),-5\n");
    const csv = exportCsv(wb);
    // The value is prefixed with ' so spreadsheet apps treat it as text; quoting follows RFC 4180.
    expect(csv).toBe(`a,b\r\n"'=HYPERLINK(""x"")",-5`);
  });
});
