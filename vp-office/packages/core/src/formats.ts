export type FileKind = "document" | "spreadsheet" | "presentation" | "pdf" | "workspace";

export type FileFormat = "docx" | "txt" | "md" | "rtf" | "xlsx" | "csv" | "pptx" | "pdf" | "octows";

export interface FormatInfo {
  format: FileFormat;
  kind: FileKind;
  label: string;
  extensions: readonly string[];
  mime: string;
  /** Text formats are validated as UTF-8 instead of by magic bytes. */
  text: boolean;
}

export const FORMATS: Record<FileFormat, FormatInfo> = {
  docx: {
    format: "docx",
    kind: "document",
    label: "Word document",
    extensions: ["docx"],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    text: false,
  },
  txt: { format: "txt", kind: "document", label: "Plain text", extensions: ["txt"], mime: "text/plain", text: true },
  md: {
    format: "md",
    kind: "document",
    label: "Markdown",
    extensions: ["md", "markdown"],
    mime: "text/markdown",
    text: true,
  },
  rtf: { format: "rtf", kind: "document", label: "Rich Text", extensions: ["rtf"], mime: "application/rtf", text: false },
  xlsx: {
    format: "xlsx",
    kind: "spreadsheet",
    label: "Excel workbook",
    extensions: ["xlsx"],
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    text: false,
  },
  csv: { format: "csv", kind: "spreadsheet", label: "CSV", extensions: ["csv"], mime: "text/csv", text: true },
  pptx: {
    format: "pptx",
    kind: "presentation",
    label: "PowerPoint presentation",
    extensions: ["pptx"],
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    text: false,
  },
  pdf: { format: "pdf", kind: "pdf", label: "PDF", extensions: ["pdf"], mime: "application/pdf", text: false },
  octows: {
    format: "octows",
    kind: "workspace",
    label: "Case workspace",
    extensions: ["octows"],
    mime: "application/vnd.octogenie.workspace+json",
    text: true,
  },
};

export const KIND_LABELS: Record<FileKind, { singular: string; plural: string }> = {
  document: { singular: "Document", plural: "Documents" },
  spreadsheet: { singular: "Spreadsheet", plural: "Spreadsheets" },
  presentation: { singular: "Presentation", plural: "Presentations" },
  pdf: { singular: "PDF", plural: "PDFs" },
  workspace: { singular: "Case workspace", plural: "Workspaces" },
};

/** Accept attribute for file inputs. */
export const ACCEPT_ATTRIBUTE = Object.values(FORMATS)
  .flatMap((f) => f.extensions.map((e) => `.${e}`))
  .join(",");

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function formatFromName(name: string): FileFormat | null {
  const ext = extensionOf(name);
  for (const info of Object.values(FORMATS)) {
    if (info.extensions.includes(ext)) return info.format;
  }
  return null;
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

const FORBIDDEN_NAME_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
export const MAX_NAME_LENGTH = 200;

/**
 * Normalises a user-supplied base name and attaches the canonical extension
 * for the format, so renaming can never change a file's type.
 */
export function makeFileName(base: string, format: FileFormat): string {
  const ext = FORMATS[format].extensions[0];
  let clean = base.replace(FORBIDDEN_NAME_CHARS, "").replace(/\s+/g, " ").trim();
  // Strip a trailing copy of the extension the user may have typed.
  if (clean.toLowerCase().endsWith(`.${ext}`)) clean = clean.slice(0, -(ext!.length + 1)).trim();
  clean = clean.replace(/^\.+/, "").slice(0, MAX_NAME_LENGTH - ext!.length - 1).trim();
  if (!clean) clean = "Untitled";
  return `${clean}.${ext}`;
}
