/** A rectangle on a PDF page in PDF user space: [x1, y1, x2, y2], y growing upwards. */
export type PdfRect = [number, number, number, number];

export type SourceFormat = "pdf" | "docx" | "txt" | "md";

/**
 * Where a document's searchable text came from:
 * - native: text embedded in the original PDF
 * - ocr: recognised from page images (may contain errors)
 * - converted: a DOCX/TXT/Markdown file laid out as PDF pages
 * - none: no text found yet (a scan that hasn't been OCR'd)
 */
export type TextMode = "native" | "ocr" | "converted" | "none";

export type DocumentStatus = "processing" | "ready" | "needs-ocr" | "error";

export interface ResearchDocument {
  /** Project-local id; sources point at this, not at file ids. */
  id: string;
  /** The original upload in the user's files. It is never modified. */
  fileId: string;
  /** Revision of the original that was processed. */
  revision: number;
  name: string;
  /** Short label for citations, e.g. "Smith Dep." */
  short?: string;
  format: SourceFormat;
  /** The PDF shown in the viewer: the original PDF, or a generated searchable/converted copy. */
  viewFileId: string;
  viewRevision: number;
  textMode: TextMode;
  pageCount: number;
  status: DocumentStatus;
  error?: string;
  /** Things the reader should know, e.g. characters that couldn't be shown. */
  warnings?: string[];
  addedAt: number;
}

/** Health of a source reference after its document was replaced. */
export type SourceStatus = "ok" | "moved" | "broken";

/**
 * A passage in a document. Stored separately from the cards and annotations
 * that use it, so editing a card never changes where it came from.
 */
export interface SourceRef {
  id: string;
  documentId: string;
  /** Revision of the original uploaded file when the passage was captured. */
  sourceRevision?: number;
  /** The excerpt card or annotation this anchor belongs to. */
  owner?: { kind: "excerpt" | "annotation"; id: string };
  /** The exact file and revision the coordinates refer to. */
  viewFileId: string;
  viewRevision: number;
  /** 0-based page index. */
  page: number;
  rects: PdfRect[];
  /** The passage text as selected. */
  quote: string;
  /** Character offsets of the passage within the page's extracted text, when found. */
  start?: number;
  end?: number;
  status?: SourceStatus;
  /** Why a source is "moved" or "broken". */
  note?: string;
  /** Captured as a region of the page (lasso) rather than a text selection. */
  area?: boolean;
}

export type CardType = "excerpt" | "note" | "group";

/** What a group frame organizes. */
export type GroupCategory = "issue" | "argument" | "witness" | "document" | "evidence" | "other";

export const GROUP_CATEGORIES: { id: GroupCategory; label: string }[] = [
  { id: "issue", label: "Legal issue" },
  { id: "argument", label: "Argument" },
  { id: "witness", label: "Witness" },
  { id: "document", label: "Document" },
  { id: "evidence", label: "Evidence category" },
  { id: "other", label: "Other" },
];

/** Review labels. They describe the user's workflow, never legal conclusions. */
export type ReviewStatus = "to-review" | "reviewed" | "key" | "disputed" | "follow-up";

export const REVIEW_STATUSES: { id: ReviewStatus; label: string; color: string }[] = [
  { id: "to-review", label: "To review", color: "#64748b" },
  { id: "reviewed", label: "Reviewed", color: "#0f766e" },
  { id: "key", label: "Key", color: "#7c3aed" },
  { id: "disputed", label: "Disputed", color: "#b91c1c" },
  { id: "follow-up", label: "Follow up", color: "#b45309" },
];

interface CardBase {
  id: string;
  /** Position and size on the canvas, in canvas units (px at zoom 1). */
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  tags: string[];
  status?: ReviewStatus;
  /**
   * Cards merged together share a stack id: they sit edge to edge in one
   * column and move as one. Each keeps its own source link.
   */
  stack?: string;
  /** The workspace (sheet) the card is on; absent means the main workspace. */
  sheet?: string;
  /** A comment attached to the card (shown as a speech note). */
  comment?: string;
  /** Text size in px (default 13). */
  fontSize?: number;
  createdAt: number;
  updatedAt: number;
}

/** Text pulled out of a document. `text` is editable; the source stays as captured. */
export interface ExcerptCard extends CardBase {
  type: "excerpt";
  sourceId: string;
  text: string;
}

export interface NoteCard extends CardBase {
  type: "note";
  text: string;
}

/** A titled frame; cards whose centre lies inside belong to it. */
export interface GroupCard extends CardBase {
  type: "group";
  title: string;
  category: GroupCategory;
}

export type Card = ExcerptCard | NoteCard | GroupCard;

export type Relation = "supports" | "contradicts" | "references" | "related";

export const RELATIONS: { id: Relation; label: string; color: string; dash?: string }[] = [
  { id: "supports", label: "Supports", color: "#15803d" },
  { id: "contradicts", label: "Contradicts", color: "#b91c1c", dash: "8 5" },
  { id: "references", label: "References", color: "#1d4ed8", dash: "2 4" },
  { id: "related", label: "Related", color: "#64748b" },
];

export interface Connector {
  id: string;
  from: string;
  to: string;
  relation: Relation;
  label?: string;
}

export type AnnotationKind = "highlight" | "underline" | "comment";

/** A mark on a document passage. Kept in the workspace; the source file is never changed. */
export interface Annotation {
  id: string;
  kind: AnnotationKind;
  sourceId: string;
  color: string;
  /** Comment or margin note text. */
  note?: string;
  tags: string[];
  status?: ReviewStatus;
  createdAt: number;
  updatedAt: number;
}

/** A freehand pen stroke on the canvas, in canvas units. */
export interface InkStroke {
  id: string;
  points: [number, number][];
  color: string;
  width: number;
  /** Workspace (sheet) the stroke is on; absent means the main workspace. */
  sheet?: string;
}

/** Pen or highlighter ink drawn on a document page, in PDF user space. Never written into the file. */
export interface DocInk {
  id: string;
  documentId: string;
  viewFileId: string;
  viewRevision: number;
  page: number;
  points: [number, number][];
  color: string;
  /** Stroke width in PDF points. */
  width: number;
  tool: "pen" | "highlighter";
  createdAt: number;
}

export interface Bookmark {
  id: string;
  documentId: string;
  page: number;
  label: string;
  createdAt: number;
}

/** A workspace (canvas) in the project. Child workspaces have a parent. */
export interface Sheet {
  id: string;
  name: string;
  parentId: string | null;
  /** Saved pan/zoom while another workspace is shown. */
  view?: { x: number; y: number; zoom: number };
}

export const MAIN_SHEET = "main";

export interface TagDef {
  name: string;
  color: string;
}

/**
 * A connection drawn between a passage in a document (an annotation) and a
 * card on the workspace. Shown as a line across the reader and the workspace.
 */
export interface PassageLink {
  id: string;
  annotationId: string;
  cardId: string;
  relation: Relation;
  label?: string;
}

export interface ResearchWorkspace {
  kind: "octogenie-research";
  version: 1;
  documents: ResearchDocument[];
  sources: Record<string, SourceRef>;
  cards: Card[];
  connectors: Connector[];
  /** Links between document passages and workspace cards. */
  passageLinks: PassageLink[];
  annotations: Annotation[];
  ink: InkStroke[];
  /** Ink on document pages. */
  docInk: DocInk[];
  bookmarks: Bookmark[];
  /** Workspaces in the project (the main one plus any child workspaces). */
  sheets: Sheet[];
  tags: TagDef[];
  /** Collapsed page indexes per document id. */
  collapsed?: Record<string, number[]>;
  /** Workspace viewport (pan in screen px, zoom factor). */
  view: { x: number; y: number; zoom: number };
  /** Reading state restored on reopen: open documents and the page shown in each. */
  reader?: ReaderState;
}

export interface ReaderState {
  open: string[];
  active: string | null;
  pages: Record<string, number>;
  /** The workspace shown on the canvas. */
  sheet?: string;
}

/** Case details kept on the server with the project. */
export interface ProjectMeta {
  id: string;
  name: string;
  caseName: string;
  reference: string;
  court: string;
  jurisdiction: string;
  description: string;
  archived: boolean;
  revision: number;
  size: number;
  createdAt: number;
  updatedAt: number;
}
