// Model: pure data and edits (no I/O, no UI).
export * from "./model/types";
export * from "./model/workspace";
export * from "./model/report";
export { History } from "./model/history";

// Search and source tracking.
export * from "./search/text-index";
export { remapSources, acknowledgeSource, type RemapReport } from "./search/remap";

// Document import and processing.
export { checkImport, convertToPdf, ACCEPTED_EXTENSIONS, ACCEPT_ATTRIBUTE } from "./documents/import";
export { blocksToPdf, textToBlocks, editorJsonToBlocks, type Block, type Run, type ConvertResult } from "./documents/convert";
export { buildSearchablePdf, type OcrPage, type OcrWord } from "./documents/ocr";
export { indexPdf, recognizePdf, type OcrAssets } from "./documents/extract";

// Export.
export { reportDocument, reportToDocx, reportToPdf } from "./export/report";
export { exportAnnotatedPdf, type AnnotatedPdfResult } from "./export/annotated-pdf";
export { workspaceSvg, exportProjectData, PROJECT_EXPORT_FORMAT } from "./export/snapshot";

// Persistence.
export * from "./persistence/api";
export { LocalStore, type PendingWorkspace } from "./persistence/local";
export { WorkspaceSync, type SaveStatus, type SyncOptions } from "./persistence/autosave";
