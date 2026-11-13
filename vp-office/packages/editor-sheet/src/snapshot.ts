/**
 * The subset of Univer's workbook snapshot (IWorkbookData) this module reads
 * and writes. Kept local so XLSX conversion runs without loading Univer.
 */

export interface Range {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface BorderSide {
  s: number;
  cl?: { rgb: string };
}

export interface StyleData {
  ff?: string;
  fs?: number;
  it?: 0 | 1;
  bl?: 0 | 1;
  ul?: { s: 0 | 1 };
  st?: { s: 0 | 1 };
  cl?: { rgb: string };
  bg?: { rgb: string };
  /** 1 left, 2 center, 3 right, 4 justify */
  ht?: number;
  /** 1 top, 2 middle, 3 bottom */
  vt?: number;
  /** 3 = wrap */
  tb?: number;
  n?: { pattern: string };
  bd?: { t?: BorderSide; b?: BorderSide; l?: BorderSide; r?: BorderSide };
}

export interface CellData {
  v?: string | number | boolean | null;
  /** 1 string, 2 number, 3 boolean */
  t?: number;
  s?: string | StyleData | null;
  f?: string | null;
}

export interface SheetData {
  id: string;
  name: string;
  tabColor?: string;
  hidden?: 0 | 1;
  rowCount: number;
  columnCount: number;
  defaultColumnWidth?: number;
  defaultRowHeight?: number;
  freeze?: { xSplit: number; ySplit: number; startRow: number; startColumn: number };
  mergeData: Range[];
  cellData: Record<number, Record<number, CellData>>;
  rowData: Record<number, { h?: number; hd?: 0 | 1 }>;
  columnData: Record<number, { w?: number; hd?: 0 | 1 }>;
  showGridlines?: 0 | 1;
}

export interface WorkbookData {
  id: string;
  name: string;
  appVersion: string;
  locale: string;
  styles: Record<string, StyleData>;
  sheetOrder: string[];
  sheets: Record<string, SheetData>;
  resources?: { name: string; data: string }[];
}

/** Univer plugin resource names whose data we map to and from XLSX. */
export const RESOURCE = {
  validation: "SHEET_DATA_VALIDATION_PLUGIN",
  filter: "SHEET_FILTER_PLUGIN",
  notes: "SHEET_NOTE_PLUGIN",
  charts: "OCTO_CHARTS",
} as const;

export interface ChartSpec {
  id: string;
  sheetId: string;
  type: "bar" | "line" | "pie";
  title: string;
  range: Range;
  /** First row holds series names and first column holds category labels. */
  headers: boolean;
}

const newId = () => Math.random().toString(36).slice(2, 10);

export function emptyWorkbook(name = "Workbook"): WorkbookData {
  const id = newId();
  return {
    id: newId(),
    name,
    appVersion: "1.1.0",
    locale: "enUS",
    styles: {},
    sheetOrder: [id],
    sheets: { [id]: emptySheet(id, "Sheet1") },
    resources: [],
  };
}

export function emptySheet(id: string, name: string): SheetData {
  return { id, name, rowCount: 1000, columnCount: 26, mergeData: [], cellData: {}, rowData: {}, columnData: {}, defaultColumnWidth: 88, defaultRowHeight: 24 };
}

export function getResource<T>(wb: WorkbookData, name: string): T | undefined {
  const r = wb.resources?.find((x) => x.name === name);
  if (!r?.data) return undefined;
  try {
    return JSON.parse(r.data) as T;
  } catch {
    return undefined;
  }
}

export function setResource(wb: WorkbookData, name: string, data: unknown): void {
  wb.resources = [...(wb.resources ?? []).filter((r) => r.name !== name), { name, data: JSON.stringify(data) }];
}

/** Resolves a cell's style whether stored inline or by id. */
export function cellStyle(wb: WorkbookData, cell: CellData): StyleData | undefined {
  if (!cell.s) return undefined;
  return typeof cell.s === "string" ? wb.styles[cell.s] : cell.s;
}

export function columnLetter(index: number): string {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** "B3:D9" → zero-based range; single cells allowed. */
export function parseRange(ref: string): Range | null {
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(ref.trim());
  if (!m) return null;
  const sc = columnIndex(m[1]!);
  const sr = Number(m[2]) - 1;
  const ec = m[3] ? columnIndex(m[3]) : sc;
  const er = m[4] ? Number(m[4]) - 1 : sr;
  return { startRow: Math.min(sr, er), endRow: Math.max(sr, er), startColumn: Math.min(sc, ec), endColumn: Math.max(sc, ec) };
}

export function rangeRef(r: Range): string {
  const a = `${columnLetter(r.startColumn)}${r.startRow + 1}`;
  const b = `${columnLetter(r.endColumn)}${r.endRow + 1}`;
  return a === b ? a : `${a}:${b}`;
}

/** Display value of a cell (cached result for formulas). */
export function cellValue(cell: CellData | undefined): string | number | boolean | null {
  if (!cell) return null;
  return cell.v ?? null;
}
