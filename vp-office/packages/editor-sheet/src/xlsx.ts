import type ExcelJSNamespace from "exceljs";
import JSZip from "jszip";
import Papa from "papaparse";
import {
  cellStyle,
  emptySheet,
  emptyWorkbook,
  getResource,
  parseRange,
  rangeRef,
  RESOURCE,
  setResource,
  type BorderSide,
  type CellData,
  type Range,
  type SheetData,
  type StyleData,
  type WorkbookData,
} from "./snapshot";

type ExcelJS = typeof ExcelJSNamespace;
type Worksheet = ExcelJSNamespace.Worksheet;
type Cell = ExcelJSNamespace.Cell;

async function loadExcel(): Promise<ExcelJS> {
  const mod = (await import("exceljs")) as unknown as { default?: ExcelJS } & ExcelJS;
  return mod.default ?? mod;
}

export const EMBED_PATH = "octo/workbook.json";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash of the parts that hold workbook content, to detect edits by other programs. */
async function contentHash(zip: JSZip): Promise<string> {
  const names = Object.keys(zip.files)
    .filter((n) => /^xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(n))
    .sort();
  let all = "";
  for (const n of names) all += `${n}\n${await zip.file(n)!.async("string")}\n`;
  return sha256Hex(all);
}

export interface SheetImportResult {
  workbook: WorkbookData;
  warnings: string[];
  fromEmbedded: boolean;
}

// Univer border style numbers ↔ Excel border style names.
const BORDER_TO_EXCEL: Record<number, ExcelJSNamespace.BorderStyle> = {
  1: "thin",
  2: "hair",
  3: "dotted",
  4: "dashed",
  5: "dashDot",
  6: "dashDotDot",
  7: "double",
  8: "medium",
  9: "mediumDashed",
  10: "mediumDashDot",
  11: "mediumDashDotDot",
  12: "slantDashDot",
  13: "thick",
};
const BORDER_FROM_EXCEL = Object.fromEntries(Object.entries(BORDER_TO_EXCEL).map(([k, v]) => [v, Number(k)])) as Record<string, number>;

const argbToHex = (argb?: string) => (argb && /^[0-9a-f]{8}$/i.test(argb) ? `#${argb.slice(2).toLowerCase()}` : argb && /^[0-9a-f]{6}$/i.test(argb) ? `#${argb.toLowerCase()}` : undefined);
const hexToArgb = (hex?: string) => (hex && /^#[0-9a-f]{6}$/i.test(hex) ? `FF${hex.slice(1).toUpperCase()}` : undefined);

/** Excel stores dates as days since 1899-12-30. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const dateToSerial = (d: Date) => (d.getTime() - EXCEL_EPOCH) / 86_400_000;

function styleFromExcel(cell: Cell): StyleData | undefined {
  const s: StyleData = {};
  const f = cell.font;
  if (f) {
    if (f.name) s.ff = f.name;
    if (f.size) s.fs = f.size;
    if (f.bold) s.bl = 1;
    if (f.italic) s.it = 1;
    if (f.underline) s.ul = { s: 1 };
    if (f.strike) s.st = { s: 1 };
    const c = argbToHex(f.color?.argb);
    if (c && c !== "#000000") s.cl = { rgb: c };
  }
  const fill = cell.fill as ExcelJSNamespace.FillPattern | undefined;
  if (fill?.type === "pattern" && fill.pattern === "solid") {
    const bg = argbToHex(fill.fgColor?.argb);
    if (bg) s.bg = { rgb: bg };
  }
  const a = cell.alignment;
  if (a) {
    const ht = { left: 1, center: 2, right: 3, justify: 4 }[a.horizontal as string];
    const vt = { top: 1, middle: 2, bottom: 3 }[a.vertical as string];
    if (ht) s.ht = ht;
    if (vt) s.vt = vt;
    if (a.wrapText) s.tb = 3;
  }
  if (cell.numFmt && cell.numFmt !== "General") s.n = { pattern: cell.numFmt };
  const b = cell.border;
  if (b) {
    const side = (x?: Partial<ExcelJSNamespace.Border>): BorderSide | undefined =>
      x?.style ? { s: BORDER_FROM_EXCEL[x.style] ?? 1, ...(argbToHex(x.color?.argb) ? { cl: { rgb: argbToHex(x.color?.argb)! } } : {}) } : undefined;
    const bd = { t: side(b.top), b: side(b.bottom), l: side(b.left), r: side(b.right) };
    if (bd.t || bd.b || bd.l || bd.r) s.bd = Object.fromEntries(Object.entries(bd).filter(([, v]) => v)) as StyleData["bd"];
  }
  return Object.keys(s).length ? s : undefined;
}

function applyStyleToExcel(cell: Cell, s: StyleData | undefined): void {
  if (!s) return;
  const font: Partial<ExcelJSNamespace.Font> = {};
  if (s.ff) font.name = s.ff;
  if (s.fs) font.size = s.fs;
  if (s.bl) font.bold = true;
  if (s.it) font.italic = true;
  if (s.ul?.s) font.underline = true;
  if (s.st?.s) font.strike = true;
  if (hexToArgb(s.cl?.rgb)) font.color = { argb: hexToArgb(s.cl?.rgb)! };
  if (Object.keys(font).length) cell.font = font;
  if (hexToArgb(s.bg?.rgb)) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hexToArgb(s.bg?.rgb)! } };
  const alignment: Partial<ExcelJSNamespace.Alignment> = {};
  const ht = ({ 1: "left", 2: "center", 3: "right", 4: "justify" } as const)[s.ht as 1 | 2 | 3 | 4];
  const vt = ({ 1: "top", 2: "middle", 3: "bottom" } as const)[s.vt as 1 | 2 | 3];
  if (ht) alignment.horizontal = ht;
  if (vt) alignment.vertical = vt;
  if (s.tb === 3) alignment.wrapText = true;
  if (Object.keys(alignment).length) cell.alignment = alignment;
  if (s.n?.pattern) cell.numFmt = s.n.pattern;
  if (s.bd) {
    const side = (x?: BorderSide) => (x && BORDER_TO_EXCEL[x.s] ? { style: BORDER_TO_EXCEL[x.s]!, ...(hexToArgb(x.cl?.rgb) ? { color: { argb: hexToArgb(x.cl?.rgb)! } } : {}) } : undefined);
    const border: Partial<ExcelJSNamespace.Borders> = {};
    if (side(s.bd.t)) border.top = side(s.bd.t);
    if (side(s.bd.b)) border.bottom = side(s.bd.b);
    if (side(s.bd.l)) border.left = side(s.bd.l);
    if (side(s.bd.r)) border.right = side(s.bd.r);
    if (Object.keys(border).length) cell.border = border;
  }
}

interface ValidationRule {
  uid: string;
  type: string;
  ranges: Range[];
  formula1?: string;
  formula2?: string;
  operator?: string;
  allowBlank?: boolean;
  showErrorMessage?: boolean;
  error?: string;
  showInputMessage?: boolean;
  prompt?: string;
}

/** Univer cell notes: sheetId → row → col → note. */
type NotesData = Record<string, Record<number, Record<number, { id: string; row: number; col: number; width: number; height: number; note: string; show?: boolean }>>>;

/** Univer keeps links inside the cell's rich text as a hyperlink custom range (type 0). */
function linkCell(text: string, url: string): CellData {
  const id = Math.random().toString(36).slice(2, 10);
  return {
    v: text,
    t: 1,
    p: {
      id,
      documentStyle: {},
      body: { dataStream: `${text}\r\n`, customRanges: [{ startIndex: 0, endIndex: Math.max(0, text.length - 1), rangeId: id, rangeType: 0, properties: { url } }] },
    },
  } as CellData;
}

function cellLink(cell: CellData): string | null {
  const ranges = (cell as { p?: { body?: { customRanges?: { rangeType: number; properties?: { url?: string } }[] } } }).p?.body?.customRanges ?? [];
  return ranges.find((r) => r.rangeType === 0 && r.properties?.url)?.properties?.url ?? null;
}

function cellText(cell: CellData): string | undefined {
  const stream = (cell as { p?: { body?: { dataStream?: string } } }).p?.body?.dataStream;
  return stream ? stream.replace(/\r\n$/, "") : undefined;
}

const isSafeLink = (url: string) => /^(https?:|mailto:)/i.test(url.trim()) || /^#/.test(url.trim());

function importSheet(ws: Worksheet, sheet: SheetData, wb: WorkbookData, warnings: Set<string>, validation: ValidationRule[], notes: NotesData[string]): void {
  const styleIds = new Map<string, string>();
  const styleId = (s: StyleData) => {
    const key = JSON.stringify(s);
    let id = styleIds.get(key);
    if (!id) {
      id = `s${Object.keys(wb.styles).length + 1}_${sheet.id}`;
      wb.styles[id] = s;
      styleIds.set(key, id);
    }
    return id;
  };
  let maxRow = 0;
  let maxCol = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (row.height && Math.abs(row.height - 15) > 0.1) sheet.rowData[r - 1] = { ...sheet.rowData[r - 1], h: Math.round(row.height * (4 / 3)) };
    if (row.hidden) sheet.rowData[r - 1] = { ...sheet.rowData[r - 1], hd: 1 };
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      const data: CellData = {};
      const value = cell.value as ExcelJSNamespace.CellValue;
      if (value === null || value === undefined) {
        // style-only cell
      } else if (typeof value === "number") Object.assign(data, { v: value, t: 2 });
      else if (typeof value === "string") Object.assign(data, { v: value, t: 1 });
      else if (typeof value === "boolean") Object.assign(data, { v: value ? 1 : 0, t: 3 });
      else if (value instanceof Date) Object.assign(data, { v: dateToSerial(value), t: 2 });
      else if (typeof value === "object") {
        if ("formula" in value || "sharedFormula" in value) {
          const formula = cell.formula;
          if (formula) data.f = `=${formula}`;
          const result = (value as { result?: unknown }).result;
          if (typeof result === "number") Object.assign(data, { v: result, t: 2 });
          else if (typeof result === "string") Object.assign(data, { v: result, t: 1 });
          else if (typeof result === "boolean") Object.assign(data, { v: result ? 1 : 0, t: 3 });
          else if (result instanceof Date) Object.assign(data, { v: dateToSerial(result), t: 2 });
        } else if ("richText" in value) {
          data.v = value.richText.map((p) => p.text).join("");
          data.t = 1;
          warnings.add("Mixed formatting inside single cells was simplified to the cell's main format.");
        } else if ("hyperlink" in value) {
          const text = typeof value.text === "string" ? value.text : String(value.hyperlink);
          Object.assign(data, isSafeLink(value.hyperlink) ? linkCell(text, value.hyperlink) : { v: text, t: 1 });
        } else if ("error" in value) {
          Object.assign(data, { v: value.error, t: 1 });
        }
      }
      const style = styleFromExcel(cell);
      if (style) data.s = styleId(style);
      if (Object.keys(data).length) {
        (sheet.cellData[r - 1] ??= {})[c - 1] = data;
        maxRow = Math.max(maxRow, r);
        maxCol = Math.max(maxCol, c);
      }
      if (cell.note) {
        const note = typeof cell.note === "string" ? cell.note : (cell.note.texts ?? []).map((t) => t.text).join("");
        (notes[r - 1] ??= {})[c - 1] = { id: `n${r}_${c}`, row: r - 1, col: c - 1, width: 216, height: 92, note };
      }
    });
  });
  // Validation rules live on the sheet, including on cells that have no value.
  const dvModel = (ws as unknown as { dataValidations?: { model?: Record<string, ExcelJSNamespace.DataValidation> } }).dataValidations?.model ?? {};
  for (const [address, dv] of Object.entries(dvModel)) {
    if (!dv?.type) continue;
    const ranges = address.split(/\s+/).map(parseRange).filter((x): x is Range => !!x);
    if (!ranges.length) continue;
    const formulae = dv.formulae ?? [];
    const listValues = dv.type === "list" && typeof formulae[0] === "string" && /^".*"$/.test(formulae[0]) ? formulae[0].slice(1, -1) : undefined;
    validation.push({
      uid: `dv${validation.length + 1}`,
      type: dv.type,
      ranges,
      ...(listValues !== undefined ? { formula1: listValues } : formulae[0] !== undefined ? { formula1: dv.type === "list" ? `=${formulae[0]}` : String(formulae[0]) } : {}),
      ...(formulae[1] !== undefined ? { formula2: String(formulae[1]) } : {}),
      ...(dv.operator ? { operator: dv.operator } : {}),
      allowBlank: dv.allowBlank ?? true,
      showErrorMessage: dv.showErrorMessage ?? false,
      ...(dv.error ? { error: dv.error } : {}),
    });
  }
  ws.columns?.forEach((col, i) => {
    if (col.width && Math.abs(col.width - 9.140625) > 0.01) sheet.columnData[i] = { ...sheet.columnData[i], w: Math.round(col.width * 7.5) };
    if (col.hidden) sheet.columnData[i] = { ...sheet.columnData[i], hd: 1 };
  });
  for (const ref of Object.keys((ws as unknown as { _merges?: Record<string, unknown> })._merges ?? {})) {
    const merge = (ws as unknown as { _merges: Record<string, { model?: { top: number; left: number; bottom: number; right: number } }> })._merges[ref]!.model;
    if (merge) sheet.mergeData.push({ startRow: merge.top - 1, endRow: merge.bottom - 1, startColumn: merge.left - 1, endColumn: merge.right - 1 });
  }
  const view = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number; showGridLines?: boolean } | undefined;
  if (view?.state === "frozen" && (view.xSplit || view.ySplit)) {
    sheet.freeze = { xSplit: view.xSplit ?? 0, ySplit: view.ySplit ?? 0, startRow: view.ySplit ?? 0, startColumn: view.xSplit ?? 0 };
  }
  if (view?.showGridLines === false) sheet.showGridlines = 0;
  const tab = argbToHex(ws.properties?.tabColor?.argb);
  if (tab) sheet.tabColor = tab;
  if (ws.state === "hidden" || ws.state === "veryHidden") sheet.hidden = 1;
  sheet.rowCount = Math.max(1000, maxRow + 100);
  sheet.columnCount = Math.max(26, maxCol + 5);
}

/** Imports XLSX bytes. Workbooks saved here reopen from their embedded snapshot. */
export async function importXlsx(bytes: Uint8Array, name = "Workbook"): Promise<SheetImportResult> {
  const zip = await JSZip.loadAsync(bytes);
  const embedded = zip.file(EMBED_PATH);
  if (embedded) {
    try {
      const parsed = JSON.parse(await embedded.async("string")) as { hash?: string; workbook?: WorkbookData };
      if (parsed.workbook && parsed.hash === (await contentHash(zip))) return { workbook: parsed.workbook, warnings: [], fromEmbedded: true };
    } catch {
      // Fall back to the spreadsheet XML.
    }
  }
  const warnings = new Set<string>();
  const names = Object.keys(zip.files);
  if (names.some((n) => n.startsWith("xl/charts/"))) warnings.add("Charts from Excel aren't supported yet and were removed.");
  if (names.some((n) => n.startsWith("xl/pivotTables/"))) warnings.add("Pivot tables were converted to their current values.");
  if (names.some((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n))) warnings.add("Images and shapes in sheets aren't supported yet and were removed.");
  if (names.includes("xl/vbaProject.bin")) warnings.add("Macros are never run and are removed when the workbook is saved here.");

  const ExcelJS = await loadExcel();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as ArrayBuffer);
  const wb = emptyWorkbook(name);
  wb.sheetOrder = [];
  wb.sheets = {};
  const validation: Record<string, ValidationRule[]> = {};
  const filters: Record<string, { ref: Range }> = {};
  const notes: NotesData = {};
  let hasConditional = false;
  book.eachSheet((ws, i) => {
    const id = `sheet${i}`;
    const sheet = emptySheet(id, ws.name);
    validation[id] = [];
    notes[id] = {};
    importSheet(ws, sheet, wb, warnings, validation[id]!, notes[id]!);
    const af = ws.autoFilter as string | { from: string | { row: number; column: number }; to: string | { row: number; column: number } } | undefined;
    if (af) {
      const ref = typeof af === "string" ? af : typeof af.from === "string" && typeof af.to === "string" ? `${af.from}:${af.to}` : null;
      const range = ref ? parseRange(ref) : null;
      if (range) filters[id] = { ref: range };
    }
    if ((ws as unknown as { conditionalFormattings?: unknown[] }).conditionalFormattings?.length) hasConditional = true;
    wb.sheetOrder.push(id);
    wb.sheets[id] = sheet;
  });
  if (hasConditional) warnings.add("Conditional formatting from Excel isn't imported yet; you can add rules again here.");
  if (wb.sheetOrder.length === 0) return { workbook: emptyWorkbook(name), warnings: [...warnings], fromEmbedded: false };
  setResource(wb, RESOURCE.validation, validation);
  if (Object.keys(filters).length) setResource(wb, RESOURCE.filter, filters);
  if (Object.values(notes).some((n) => Object.keys(n).length)) setResource(wb, RESOURCE.notes, notes);
  return { workbook: wb, warnings: [...warnings], fromEmbedded: false };
}

const OPERATORS = new Set(["between", "notBetween", "equal", "notEqual", "greaterThan", "lessThan", "greaterThanOrEqual", "lessThanOrEqual"]);

/** Exports a workbook snapshot to XLSX bytes, embedding the snapshot. */
export async function exportXlsx(wb: WorkbookData): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const ExcelJS = await loadExcel();
  const book = new ExcelJS.Workbook();
  book.creator = "OctoGenie Office";
  const warnings = new Set<string>();
  const validation = getResource<Record<string, ValidationRule[]>>(wb, RESOURCE.validation) ?? {};
  const filters = getResource<Record<string, { ref: Range }>>(wb, RESOURCE.filter) ?? {};
  const notes = getResource<NotesData>(wb, RESOURCE.notes) ?? {};
  if (getResource(wb, "SHEET_CONDITIONAL_FORMATTING_PLUGIN")) warnings.add("Conditional formatting is kept for this app but isn't written for Excel yet.");
  if ((getResource<unknown[]>(wb, RESOURCE.charts) ?? []).length) warnings.add("Charts are kept for this app but aren't written for Excel yet.");

  for (const sheetId of wb.sheetOrder) {
    const sheet = wb.sheets[sheetId];
    if (!sheet) continue;
    const ws = book.addWorksheet(sheet.name.slice(0, 31) || "Sheet", {
      properties: { ...(hexToArgb(sheet.tabColor) ? { tabColor: { argb: hexToArgb(sheet.tabColor)! } } : {}) },
      views: [
        {
          ...(sheet.freeze && (sheet.freeze.xSplit || sheet.freeze.ySplit) ? { state: "frozen", xSplit: sheet.freeze.xSplit, ySplit: sheet.freeze.ySplit } : { state: "normal" }),
          showGridLines: sheet.showGridlines !== 0,
        },
      ],
      state: sheet.hidden ? "hidden" : "visible",
    });
    for (const [c, col] of Object.entries(sheet.columnData ?? {})) {
      const column = ws.getColumn(Number(c) + 1);
      if (col.w) column.width = Math.round((col.w / 7.5) * 100) / 100;
      if (col.hd) column.hidden = true;
    }
    for (const [r, row] of Object.entries(sheet.rowData ?? {})) {
      const excelRow = ws.getRow(Number(r) + 1);
      if (row.h) excelRow.height = Math.round(row.h * 0.75 * 100) / 100;
      if (row.hd) excelRow.hidden = true;
    }
    for (const [r, cols] of Object.entries(sheet.cellData ?? {})) {
      for (const [c, data] of Object.entries(cols ?? {})) {
        if (!data) continue;
        const cell = ws.getCell(Number(r) + 1, Number(c) + 1);
        const link = cellLink(data);
        if (link && isSafeLink(link)) {
          cell.value = { text: cellText(data) ?? String(data.v ?? link), hyperlink: link };
        } else if (data.f) {
          const result = data.v ?? undefined;
          cell.value = { formula: data.f.replace(/^=/, ""), ...(result !== undefined && result !== null ? { result: data.t === 3 ? Boolean(result) : result } : {}) } as ExcelJSNamespace.CellFormulaValue;
        } else if ((data.v === undefined || data.v === null) && cellText(data)) {
          cell.value = cellText(data)!;
        } else if (data.v !== undefined && data.v !== null && data.v !== "") {
          cell.value = data.t === 3 ? Boolean(data.v) : data.t === 2 || typeof data.v === "number" ? Number(data.v) : String(data.v);
        }
        applyStyleToExcel(cell, cellStyle(wb, data));
      }
    }
    for (const m of sheet.mergeData ?? []) {
      if (m.endRow > m.startRow || m.endColumn > m.startColumn) ws.mergeCells(m.startRow + 1, m.startColumn + 1, m.endRow + 1, m.endColumn + 1);
    }
    for (const rule of validation[sheetId] ?? []) {
      const type = rule.type === "listMultiple" ? "list" : rule.type;
      if (!["list", "whole", "decimal", "date", "textLength", "custom"].includes(type)) continue;
      const formulae =
        type === "list"
          ? [rule.formula1?.startsWith("=") ? rule.formula1.slice(1) : `"${(rule.formula1 ?? "").replace(/"/g, "")}"`]
          : [rule.formula1, rule.formula2].filter((f): f is string => !!f).map((f) => f.replace(/^=/, ""));
      for (const range of rule.ranges) {
        for (let r = range.startRow; r <= range.endRow; r++) {
          for (let c = range.startColumn; c <= range.endColumn; c++) {
            ws.getCell(r + 1, c + 1).dataValidation = {
              type: type as ExcelJSNamespace.DataValidation["type"],
              allowBlank: rule.allowBlank ?? true,
              formulae,
              ...(rule.operator && OPERATORS.has(rule.operator) ? { operator: rule.operator as ExcelJSNamespace.DataValidationOperator } : {}),
              ...(rule.showErrorMessage ? { showErrorMessage: true, error: rule.error ?? "" } : {}),
            };
          }
        }
      }
    }
    if (filters[sheetId]?.ref) ws.autoFilter = rangeRef(filters[sheetId]!.ref);
    for (const [r, cols] of Object.entries(notes[sheetId] ?? {})) {
      for (const [c, note] of Object.entries(cols)) if (note?.note) ws.getCell(Number(r) + 1, Number(c) + 1).note = note.note;
    }
  }
  if (book.worksheets.length === 0) book.addWorksheet("Sheet1");
  const raw = new Uint8Array(await book.xlsx.writeBuffer());
  const zip = await JSZip.loadAsync(raw);
  zip.file(EMBED_PATH, JSON.stringify({ hash: await contentHash(zip), workbook: wb }));
  const types = await zip.file("[Content_Types].xml")!.async("string");
  if (!types.includes('Extension="json"')) zip.file("[Content_Types].xml", types.replace(/(<Types[^>]*>)/, '$1<Default Extension="json" ContentType="application/json"/>'));
  return { bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), warnings: [...warnings] };
}

/** Parses CSV into a one-sheet workbook. Numbers become numbers; everything else stays text. */
export function importCsv(text: string, name = "Sheet1"): WorkbookData {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false });
  const wb = emptyWorkbook(name);
  const sheet = wb.sheets[wb.sheetOrder[0]!]!;
  sheet.name = name.slice(0, 31) || "Sheet1";
  let maxCols = 0;
  parsed.data.forEach((row, r) => {
    if (row.length === 1 && row[0] === "" && r === parsed.data.length - 1) return;
    row.forEach((value, c) => {
      if (value === "") return;
      const numeric = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value.trim()) && !/^0\d/.test(value.trim());
      (sheet.cellData[r] ??= {})[c] = numeric ? { v: Number(value), t: 2 } : { v: value, t: 1 };
    });
    maxCols = Math.max(maxCols, row.length);
  });
  sheet.rowCount = Math.max(1000, parsed.data.length + 100);
  sheet.columnCount = Math.max(26, maxCols + 5);
  return wb;
}

/** Writes the first visible sheet's values (formula results, not formulas) as CSV. */
export function exportCsv(wb: WorkbookData): string {
  const sheet = wb.sheetOrder.map((id) => wb.sheets[id]).find((s) => s && !s.hidden) ?? wb.sheets[wb.sheetOrder[0]!];
  if (!sheet) return "";
  const rows = Object.keys(sheet.cellData).map(Number);
  const maxRow = rows.length ? Math.max(...rows) : -1;
  let maxCol = -1;
  for (const r of rows) for (const c of Object.keys(sheet.cellData[r] ?? {})) maxCol = Math.max(maxCol, Number(c));
  const out: string[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const line: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const v = sheet.cellData[r]?.[c]?.v;
      line.push(v === undefined || v === null ? "" : String(v));
    }
    out.push(line);
  }
  // Guard against CSV formula injection when the file is opened in Excel.
  const safe = out.map((line) => line.map((v) => (/^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v) ? `'${v}` : v)));
  return Papa.unparse(safe, { newline: "\r\n" });
}
