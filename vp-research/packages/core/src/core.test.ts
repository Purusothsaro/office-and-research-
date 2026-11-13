import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatFromName,
  formatRelativeTime,
  makeFileName,
  MAX_UPLOAD_BYTES,
  readZipEntries,
  validateUpload,
} from "./index";

const text = (s: string) => new TextEncoder().encode(s);

async function zipOf(files: Record<string, string | Uint8Array>, compression: "STORE" | "DEFLATE" = "DEFLATE") {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "uint8array", compression });
}

describe("file names", () => {
  it("maps extensions to formats case-insensitively", () => {
    expect(formatFromName("Brief.DOCX")).toBe("docx");
    expect(formatFromName("notes.markdown")).toBe("md");
    expect(formatFromName("archive.zip")).toBeNull();
    expect(formatFromName("docx")).toBeNull();
  });

  it("keeps the canonical extension and strips unsafe characters", () => {
    expect(makeFileName("  Draft: v2/final  ", "docx")).toBe("Draft v2final.docx");
    expect(makeFileName("Report.xlsx", "xlsx")).toBe("Report.xlsx");
    expect(makeFileName("Report.docx", "pdf")).toBe("Report.docx.pdf");
    expect(makeFileName("   ", "txt")).toBe("Untitled.txt");
    expect(makeFileName("...hidden", "txt")).toBe("hidden.txt");
    expect(makeFileName("x".repeat(500), "pptx")).toHaveLength(200);
  });
});

describe("validateUpload", () => {
  it("rejects unknown extensions and oversized files", () => {
    expect(validateUpload("a.exe", text("MZ"))).toMatchObject({ ok: false });
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    expect(validateUpload("a.txt", big)).toMatchObject({ ok: false, reason: expect.stringContaining("100 MB") });
  });

  it("accepts UTF-8 text and rejects binary or non-UTF-8 text", () => {
    expect(validateUpload("a.txt", text("héllo"))).toEqual({ ok: true, format: "txt" });
    expect(validateUpload("a.csv", text("a,b\n1,2"))).toEqual({ ok: true, format: "csv" });
    expect(validateUpload("a.md", new Uint8Array([0x61, 0x00]))).toMatchObject({ ok: false });
    expect(validateUpload("a.txt", new Uint8Array([0xff, 0xfe, 0x41]))).toMatchObject({ ok: false, reason: expect.stringContaining("UTF-8") });
  });

  it("checks PDF and RTF signatures", () => {
    expect(validateUpload("a.pdf", text("%PDF-1.7\n..."))).toEqual({ ok: true, format: "pdf" });
    expect(validateUpload("a.pdf", text("<html>"))).toMatchObject({ ok: false });
    expect(validateUpload("a.rtf", text("{\\rtf1\\ansi hi}"))).toEqual({ ok: true, format: "rtf" });
    expect(validateUpload("a.rtf", text("hello"))).toMatchObject({ ok: false });
  });

  it("rejects legacy or encrypted Office containers with a clear message", () => {
    const cfb = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(validateUpload("a.docx", cfb)).toMatchObject({ ok: false, reason: expect.stringContaining("password-protected") });
  });

  it("requires the OOXML main part and detects mislabelled packages", async () => {
    const notOffice = await zipOf({ "readme.txt": "hi" });
    expect(validateUpload("a.docx", notOffice)).toMatchObject({ ok: false });
    const sheet = await zipOf({ "[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<workbook/>" });
    expect(validateUpload("a.docx", sheet)).toMatchObject({ ok: false, reason: expect.stringContaining("Rename it to .xlsx") });
    expect(validateUpload("a.xlsx", sheet)).toEqual({ ok: true, format: "xlsx" });
  });

  it("rejects highly compressed (bomb-like) entries without inflating them", async () => {
    const bomb = await zipOf({
      "[Content_Types].xml": "<Types/>",
      "word/document.xml": "<w/>",
      "word/media/pad.bin": new Uint8Array(4 * 1024 * 1024),
    });
    expect(validateUpload("a.docx", bomb)).toMatchObject({ ok: false, reason: expect.stringContaining("compressed suspiciously") });
  });

  it("rejects truncated ZIP archives", async () => {
    const good = await zipOf({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w/>" });
    expect(validateUpload("a.docx", good.subarray(0, good.length - 30))).toMatchObject({ ok: false });
  });
});

describe("readZipEntries", () => {
  it("lists entry names and sizes", async () => {
    const zip = await zipOf({ "a.txt": "hello", "dir/b.txt": "world!" }, "STORE");
    expect(readZipEntries(zip)).toEqual([
      { name: "a.txt", compressedSize: 5, uncompressedSize: 5 },
      { name: "dir/", compressedSize: 0, uncompressedSize: 0 },
      { name: "dir/b.txt", compressedSize: 6, uncompressedSize: 6 },
    ]);
  });
});

describe("display helpers", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });

  it("formats relative times", () => {
    const now = Date.UTC(2026, 9, 22, 12);
    expect(formatRelativeTime(now - 10_000, now)).toBe("just now");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatRelativeTime(now - 3 * 3600_000, now)).toBe("3 h ago");
    expect(formatRelativeTime(now - 26 * 3600_000, now)).toBe("yesterday");
  });
});
