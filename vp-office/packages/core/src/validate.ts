import { FORMATS, formatFromName, type FileFormat } from "./formats";
import { readZipEntries, ZipFormatError } from "./zip";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const ZIP_LIMITS = {
  maxEntries: 10_000,
  maxUncompressedBytes: 1024 * 1024 * 1024,
  maxCompressionRatio: 200,
};

export type ValidationResult = { ok: true; format: FileFormat } | { ok: false; reason: string };

/** The part each OOXML package must contain for its declared type. */
const OOXML_MAIN_PART: Partial<Record<FileFormat, string>> = {
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
  pptx: "ppt/presentation.xml",
};

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const RTF_MAGIC = [0x7b, 0x5c, 0x72, 0x74, 0x66]; // {\rtf

function containsPdfHeader(bytes: Uint8Array): boolean {
  // The spec allows leading junk; readers accept the header in the first 1 KB.
  const limit = Math.min(bytes.length - PDF_MAGIC.length, 1024);
  for (let i = 0; i <= limit; i++) if (startsWith(bytes, PDF_MAGIC, i)) return true;
  return false;
}

function validateOoxml(bytes: Uint8Array, format: FileFormat): ValidationResult {
  const label = FORMATS[format].label;
  if (startsWith(bytes, CFB_MAGIC)) {
    return { ok: false, reason: `This ${label} is password-protected or in a legacy Office format. Remove the password or save it as .${format}, then upload again.` };
  }
  if (!startsWith(bytes, ZIP_MAGIC)) return { ok: false, reason: `This file is not a valid ${label}.` };

  let entries;
  try {
    entries = readZipEntries(bytes);
  } catch (error) {
    const detail = error instanceof ZipFormatError ? error.message : "unreadable archive";
    return { ok: false, reason: `This file is not a valid ${label} (${detail}).` };
  }
  if (entries.length > ZIP_LIMITS.maxEntries) return { ok: false, reason: "This file contains too many parts to open safely." };
  let total = 0;
  for (const entry of entries) {
    total += entry.uncompressedSize;
    const ratio = entry.compressedSize === 0 ? (entry.uncompressedSize === 0 ? 0 : Infinity) : entry.uncompressedSize / entry.compressedSize;
    if (entry.uncompressedSize > 1024 * 1024 && ratio > ZIP_LIMITS.maxCompressionRatio) {
      return { ok: false, reason: "This file is compressed suspiciously and cannot be opened safely." };
    }
  }
  if (total > ZIP_LIMITS.maxUncompressedBytes) return { ok: false, reason: "This file expands to more than 1 GB and cannot be opened safely." };

  const names = new Set(entries.map((e) => e.name));
  if (!names.has("[Content_Types].xml")) return { ok: false, reason: `This file is not a valid ${label} (missing content types).` };
  const main = OOXML_MAIN_PART[format]!;
  if (!names.has(main)) {
    const actual = (Object.entries(OOXML_MAIN_PART) as [FileFormat, string][]).find(([, part]) => names.has(part));
    return {
      ok: false,
      reason: actual
        ? `This file is a ${FORMATS[actual[0]].label} saved with a .${format} extension. Rename it to .${actual[0]}.`
        : `This file is not a valid ${label}.`,
    };
  }
  return { ok: true, format };
}

function validateText(bytes: Uint8Array, format: FileFormat): ValidationResult {
  if (bytes.includes(0)) return { ok: false, reason: `This ${FORMATS[format].label} file contains binary data.` };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: `This ${FORMATS[format].label} file is not UTF-8 encoded. Re-save it as UTF-8 and upload again.` };
  }
  return { ok: true, format };
}

/**
 * Validates an upload by extension and content. The extension decides which
 * format is expected; the content must match it.
 */
export function validateUpload(name: string, bytes: Uint8Array): ValidationResult {
  const format = formatFromName(name);
  if (!format) {
    return { ok: false, reason: "Unsupported file type. Upload DOCX, XLSX, PPTX, PDF, TXT, Markdown, RTF, CSV or case workspace files." };
  }
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "Files larger than 100 MB cannot be uploaded." };

  switch (format) {
    case "docx":
    case "xlsx":
    case "pptx":
      return validateOoxml(bytes, format);
    case "pdf":
      return containsPdfHeader(bytes) ? { ok: true, format } : { ok: false, reason: "This file is not a valid PDF." };
    case "rtf":
      return startsWith(bytes, RTF_MAGIC) ? { ok: true, format } : { ok: false, reason: "This file is not a valid RTF document." };
    case "txt":
    case "md":
    case "csv":
      return validateText(bytes, format);
    case "octows": {
      const text = validateText(bytes, format);
      if (!text.ok) return text;
      try {
        const data = JSON.parse(new TextDecoder().decode(bytes)) as { kind?: string; version?: number };
        if (data.kind === "octogenie-workspace" && data.version === 1) return { ok: true, format };
      } catch {
        // Fall through.
      }
      return { ok: false, reason: "This file is not a valid case workspace." };
    }
  }
}
