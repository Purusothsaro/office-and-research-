import { FORMATS, validateUpload } from "@octo/core";
import type { DocumentRepository, FileRecord } from "@octo/storage";

export function downloadBytes(bytes: Uint8Array, name: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadFile(repo: DocumentRepository, file: FileRecord): Promise<void> {
  downloadBytes(await repo.getContent(file.id), file.name, FORMATS[file.format].mime);
}

export type UploadOutcome = { name: string; ok: true; file: FileRecord } | { name: string; ok: false; reason: string };

async function readBytes(file: File): Promise<Uint8Array> {
  // Blob.arrayBuffer is missing in some test environments; FileReader is universal.
  if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export async function importFiles(repo: DocumentRepository, files: Iterable<File>): Promise<UploadOutcome[]> {
  const outcomes: UploadOutcome[] = [];
  for (const file of files) {
    try {
      const bytes = await readBytes(file);
      const result = validateUpload(file.name, bytes);
      if (!result.ok) {
        outcomes.push({ name: file.name, ok: false, reason: result.reason });
        continue;
      }
      outcomes.push({ name: file.name, ok: true, file: await repo.create({ name: file.name, format: result.format, bytes }) });
    } catch {
      outcomes.push({ name: file.name, ok: false, reason: "The file could not be read." });
    }
  }
  return outcomes;
}

/** Which editor module handles a format, and in which milestone it ships. */
export function editorFor(file: Pick<FileRecord, "format">): { available: true } | { available: false; milestone: number; module: string } {
  switch (file.format) {
    case "txt":
    case "md":
    case "csv":
    case "docx":
    case "rtf":
    case "pdf":
    case "xlsx":
    case "pptx":
    case "octows":
      return { available: true };




  }
}
