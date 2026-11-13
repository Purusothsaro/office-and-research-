import { validateUpload } from "@octo/core";
import type { SourceFormat } from "../model/types";
import { blocksToPdf, editorJsonToBlocks, textToBlocks, type ConvertResult } from "./convert";

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
export const ACCEPT_ATTRIBUTE = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

/**
 * Validates a file by its contents (not just its name) and returns its research
 * format, or a reason it can't be imported.
 */
export function checkImport(name: string, bytes: Uint8Array): { ok: true; format: SourceFormat } | { ok: false; reason: string } {
  const result = validateUpload(name, bytes);
  if (!result.ok) return { ok: false, reason: result.reason };
  if (result.format === "pdf" || result.format === "docx" || result.format === "txt" || result.format === "md") return { ok: true, format: result.format };
  return { ok: false, reason: "Research projects accept PDF, Word (.docx), text (.txt) and Markdown (.md) files." };
}

/** Lays out a non-PDF document as PDF pages for reading, selection and page citations. */
export async function convertToPdf(format: Exclude<SourceFormat, "pdf">, bytes: Uint8Array, title: string): Promise<ConvertResult> {
  if (format === "txt") return blocksToPdf(textToBlocks(new TextDecoder().decode(bytes)), title);
  const { importDocx, markdownToDocument } = await import("@octo/editor-document");
  if (format === "md") {
    // Markdown goes through the sanitizing importer; raw HTML never reaches the page.
    const { doc, warnings } = markdownToDocument(new TextDecoder().decode(bytes));
    const out = await blocksToPdf(editorJsonToBlocks(doc.content), title);
    return { ...out, warnings: [...warnings, ...out.warnings] };
  }
  const { doc, warnings } = await importDocx(bytes);
  const out = await blocksToPdf(editorJsonToBlocks(doc.content), title);
  return { ...out, warnings: [...warnings.slice(0, 5), ...out.warnings, "Shown as a readable copy: layout, images and some formatting differ from the original Word file."] };
}
