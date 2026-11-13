# OctoGenie Research: architecture

```
apps/web (React, Vite, Tailwind)        packages/research (no React)
├─ projects/  projects home, case details    ├─ model/        types, pure edits, history, filters, reports
├─ project/   three-pane research view       ├─ search/       text index, search, quote matching, re-linking
│   ├─ Viewer.tsx    pdf.js pages, marks     ├─ documents/    import checks, DOCX/TXT/MD → PDF, OCR layer, extraction
│   ├─ Canvas.tsx    workspace canvas        ├─ export/       DOCX/PDF reports, annotated PDF, SVG, JSON
│   ├─ Sidebar.tsx   documents/search/marks  └─ persistence/  HTTP client, IndexedDB store, autosave
│   ├─ Popovers.tsx  selection bar, menus
│   ├─ Reports.tsx   compare, summary, export, history
│   └─ documents.ts  upload → convert → index → OCR pipeline
└─ lib/       pdf.js setup, OCR asset paths

apps/server (Fastify + MongoDB)
├─ app.ts       auth, files (+ derived copies), drafts, events, static apps
└─ projects.ts  /api/projects: CRUD, archive, duplicate, versioned workspace
```

The four concerns in brief section 2 are separate modules: rendering
(`Viewer.tsx`, pdf.js), workspace interactions (`Canvas.tsx` plus
`model/workspace.ts`), persistence (`persistence/`) and export (`export/`).
The model is plain data with pure functions, so every edit is testable
without a browser.

## Data model

A project has two parts:

1. **Metadata** in MongoDB `projects`: name, case name, reference, court,
   jurisdiction, description, archived, owner, organisation, revision.
2. **Workspace**: one JSON document per revision, stored in GridFS with a
   `project_revisions` record (the last 100 are kept).

```ts
ResearchWorkspace {
  kind: "octogenie-research", version: 1,
  documents: ResearchDocument[]       // id, fileId+revision (original), viewFileId+viewRevision (what's shown), textMode, status
  sources:   Record<id, SourceRef>    // documentId, viewFileId, viewRevision, page, rects (PDF space), quote, start/end offsets, status
  cards:     (Excerpt | Note | Group)[] // position, size, colour, tags, status; excerpt → sourceId; group → title, category
  connectors: { from, to, relation: supports|contradicts|references|related, label? }[]
  annotations: { kind: highlight|underline|comment, sourceId, color, note, tags, status }[]
  ink, tags, collapsed pages, view (pan/zoom)
}
```

**Source references are stored separately from what shows them.** An
excerpt card holds `sourceId` and its own editable `text`; the `SourceRef`
keeps the passage exactly as captured, with the file revision it refers to.
Editing, moving, resizing or duplicating a card never changes its source.
Annotations use the same `SourceRef` mechanism. None of it is written into
the document file.

**Documents stay unmodified.** Each import is stored as the user's file
(`files` + GridFS revisions). Two kinds of file are generated from an
original and linked to it with `derivedFrom`/`derivedRevision`/`derivedKind`.
They are hidden from file lists and deleted with their original:

- `converted`: DOCX, TXT and Markdown laid out as PDF pages with real text, so
  selection, coordinates, page citations and search work the same way for every format.
- `ocr`: a scanned PDF's original pages, unchanged, with recognised words
  added as invisible text (PDF text render mode 3) at their positions.

`textMode` (`native` | `ocr` | `converted` | `none`) is shown in the UI and
carried into exports, so OCR text is always marked as such.

## Source anchors

Every excerpt and annotation owns one `SourceRef` with:

- `documentId`;
- `sourceRevision`, the original file's revision;
- `viewFileId` and `viewRevision`, the exact PDF the coordinates refer to;
- `page` (0-based) and `quote`, the selected text;
- `start`/`end`, offsets in the page's extracted text;
- `rects`, one PDF-space rectangle per line;
- `owner` (`{ kind: "excerpt" | "annotation", id }`).

The workspace object stores its own position and size.

- **Capture.** The browser selection is matched against the page's text index
  (`anchorSelection`), ignoring whitespace differences between text runs. The
  stored quote, offsets and line rectangles come from the index, so they are
  exact and consistent with search.
- **Activation.** "Open source" first checks the anchor with
  `validateAnchor`, on its own page only.
  - **Valid:** the passage is highlighted.
  - **Relocated** (same text, same page, stale offsets): the offsets are corrected.
  - **Invalid:** nothing is highlighted and the source is marked broken.
  - An anchor is never redirected to text on another page without the user seeing a warning.
- **Recovery.** A broken source keeps pointing at the revision it was captured
  in, so it can still be viewed there. "Fix link" lets the user select the
  passage again (`relinkSource`): the source id, card and annotation links are
  kept. Moved passages can be accepted. Documents whose file was deleted are
  flagged, and their excerpts say "Source unavailable" while keeping the
  captured text.
- **Marks don't capture the pointer.** Clicks and hover on excerpt, highlight
  and comment marks are hit-tested on the page, so text under a mark can still
  be selected. Hovering a mark highlights its card on the workspace, and
  hovering or selecting a card highlights its mark in the document.

## Reading state

`workspace.reader` stores the open document tabs, the active tab and the page
shown in each document. It is saved with the workspace (not undoable), so a
reload reopens the same document at the same page with the same workspace
viewport.

## Source re-linking

Replacing a document stores a new revision of the original file. The app
re-indexes it and runs `remapSources`. Each passage is looked up again,
preferring the same page and nearest offset:

- found on the same page: `ok`, with coordinates updated;
- found elsewhere: `moved`, with a note such as "Moved from p. 3 to p. 5";
- not found: `broken`. The source keeps pointing to the **old revision**, so
  "Open source" shows the passage in the earlier version with a banner.

Cards and summaries show a warning for `moved` and `broken` sources.

## Search

`search/text-index.ts` builds a page index from pdf.js text content: runs
with PDF-space boxes, joined text, and a map from character to run. Matching
is case-insensitive and whitespace- and typographic-quote-insensitive.
Results give the document, page, offsets and snippet, and `rectsFor` turns
offsets into highlight rectangles. Indexes are keyed by
`viewFileId@viewRevision`, so a replaced or OCR'd document is never searched
with stale text. They are cached in memory and in IndexedDB on the device.

## Persistence and sync

```
edit → update(fn) → History.record → state → (300 ms) serialize
     → WorkspaceSync.change → IndexedDB "pending" (immediately)
                             → PUT /api/projects/:id/workspace?baseRevision=n (after 1 s)
```

- **Compare-and-set:** the server only accepts a save based on the current
  revision. A stale save gets `409`, autosave stops, and the user chooses
  between loading the latest version and keeping theirs.
- **Offline:** network or 5xx errors set the status to "Offline — kept on
  this device" and saving retries every 5 s.
- **Recovery:** on open, a pending device copy is compared with the server.
  - If it matches, it is discarded.
  - If it is based on the current revision, it is restored and saved.
  - If it is based on an older revision, the user chooses which version to keep.
- **Live sync:** the server publishes `project-saved` over the existing SSE
  stream. An open project with no unsaved edits reloads quietly, keeping its view.
- **Undo/redo** covers card, connector, annotation, ink and tag edits, merging
  drags and typing into one step. The document list and the view aren't part
  of undo.

## Rendering and performance

- Pages render only within about 900 px of the viewport, and far-away pages
  release their canvas bitmaps. Page sizes are read first, so scrolling and
  page jumps are exact.
- Canvas cards outside the visible world rectangle (plus a margin) aren't
  mounted. Connectors are SVG lines between edge points computed from the
  current card boxes, so they follow moves and resizes.
- Search input is debounced by 250 ms, workspace serialisation by 300 ms, and
  saves by 1 s.
- Long document lists use a fixed-row virtual list.

## Server API (new)

| Route | Purpose |
| --- | --- |
| `GET /api/projects?archived=0\|1\|all` | List the caller's projects in their organisation |
| `POST /api/projects` | Create (case fields validated and length-limited) |
| `GET/PATCH/DELETE /api/projects/:id` | Read, edit or archive, delete (also deletes workspace revisions) |
| `POST /api/projects/:id/duplicate` | Copy metadata and the current workspace |
| `GET /api/projects/:id/workspace[?revision=n]` | Workspace JSON, with `X-Revision` |
| `PUT /api/projects/:id/workspace?baseRevision=n` | Compare-and-set save (validated, at most 10 MB, rate-limited) |
| `GET /api/projects/:id/revisions` | Version history |
| `POST /api/files?derivedFrom=&derivedKind=&derivedRevision=` | Store a generated copy linked to an owned original |
| `GET /api/files/:id/derived` | List generated copies |

Every route needs a session. Projects are looked up by `ownerId` **and**
`orgId`, and anything else gets a `404`, so existence isn't leaked.

## Responsive layout

- **Wide (≥ 1180 px):** documents panel, viewer and workspace, with draggable splitters.
- **Medium (760–1179 px, tablets):** viewer and workspace, with the documents panel as a drawer.
- **Narrow (< 760 px):** one pane at a time (Documents / Reader / Workspace tabs).
