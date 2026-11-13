# OctoGenie Office — Architecture

Status: milestones 1–2 and the PDF editor (part of milestone 3) are implemented.
Later sections describe the target design; each is marked with the milestone that
delivers it.

## Goals and non-goals

OctoGenie Office is a private, self-hosted office suite for OctoGenie Legal:
documents, spreadsheets, presentations and PDFs, with an ONLYOFFICE-like
experience (home screen, ribbon editors, Office formats, review workflows).

It is **original code**. ONLYOFFICE Docs is used only as a UX reference
(public screenshots and documented behaviour). No ONLYOFFICE source, assets,
fonts, icons, branding or private APIs are used. ONLYOFFICE Docs Community is
AGPL-3.0, which is incompatible with a closed commercial product unless a
commercial licence is bought (see LICENSE_REVIEW.md).

REA (`rea-agents`) is an investigation aid for understanding how reference
applications behave. It provides no editing engine and nothing from REA ships
in this product.

## Stack decision

| Concern | Choice | Licence | Why |
| --- | --- | --- | --- |
| App shell | React 19, TypeScript, Vite 8, Tailwind 4 | MIT / Apache-2.0 | Requested stack; fast dev loop |
| Word processor | ProseMirror via Tiptap 3 **open-source** packages + our own pagination, comments and track-changes extensions | MIT | Proven editing model, Yjs binding, schema control. Tiptap Pro/Cloud extensions are **not** used (proprietary) |
| DOCX import | Our OOXML → ProseMirror mapper over JSZip, with mammoth as a fallback for unsupported constructs | MIT / BSD-2 | mammoth alone drops layout; a custom mapper preserves sections, styles, numbering |
| DOCX export | `docx` | MIT | Mature writer with sections, headers/footers, footnotes, numbering, tables |
| Spreadsheet | Univer open-source (sheets, formula engine, sort/filter, validation, conditional formatting) | Apache-2.0 | Maintained canvas grid with a real formula engine. Avoids GPL HyperFormula |
| XLSX I/O | ExcelJS mapped to/from the Univer workbook model | MIT | Univer's own XLSX exchange is a paid Pro feature |
| CSV | PapaParse | MIT | Streaming, RFC 4180 |
| Charts (sheets) | ECharts overlays bound to ranges | Apache-2.0 | Univer charts are Pro; XLSX chart export is a known gap |
| Presentations | Our own slide model + Konva canvas editor | MIT | No mature OSS browser PPTX editor exists |
| PPTX I/O | PptxGenJS (export) + our own DrawingML subset importer | MIT | Import fidelity is limited and documented |
| PDF view/annotate | PDF.js (chosen over EmbedPDF for maturity) | Apache-2.0 | Rendering, text layer, search |
| PDF write | `@cantoo/pdf-lib` (maintained pdf-lib fork) | MIT | Page rotate/reorder, annotations, form fill, flatten |
| OCR (opt-in) | Tesseract.js, local only | Apache-2.0 | Off by default; never sends files out |
| High-fidelity conversion | LibreOffice headless in an isolated container (DOCX/PPTX → PDF, RTF) | MPL-2.0 | Best free layout engine for PDF export and RTF |
| Backend | Fastify 5 + official MongoDB driver | MIT / Apache-2.0 | All data in MongoDB (chosen by the product owner) |
| File contents | MongoDB GridFS (`blobs` bucket) | — | Revisions and drafts of any size, backed up with the database |
| Collaboration | Yjs + y-prosemirror + Hocuspocus | MIT | Real CRDT sync with auth hooks, no fake presence |
| Sanitising | DOMPurify (Apache-2.0 option) | MPL-2.0 / Apache-2.0 | All imported HTML |

Known limitations of this stack are listed in FEATURE_MATRIX.md and must be
shown to users in the UI where a conversion is lossy.

## Repository layout

```
octogenie-office/
  apps/
    web/                 React SPA (home screen, editor shells)       [M1]
    server/              Fastify API, auth, storage, audit             [M7]
    collab/              Hocuspocus collaboration server               [M8]
    converter/           LibreOffice container + job worker            [M3]
  packages/
    core/                File kinds, format registry, upload
                         validation (magic bytes), blank files and
                         templates                                     [M1]
    storage/             DocumentRepository interface, IndexedDB
                         implementation, drafts and recovery           [M1]
    editor-document/     ProseMirror schema, extensions, pagination,
                         DOCX import/export, ribbon UI                 [M2 done]
    editor-sheet/        Univer integration, ExcelJS/CSV mappers       [M4]
    editor-slides/       Slide model, Konva editor, PPTX mappers       [M5]
    editor-pdf/          Viewer, annotations, forms, page operations   [M3 done]
```

Workspace packages export TypeScript source; Vite compiles them. Each editor
is lazy-loaded so the home screen bundle stays small.

## Data model

A file is an immutable original plus a chain of revisions:

```
FileRecord   id, ownerId, name, kind, format, size, revision,
             createdAt, updatedAt, deletedAt?, templateId?
Revision     fileId, revision, blobKey, size, sha256, authorId, createdAt,
             note
Draft        fileId, baseRevision, payload, updatedAt   (client-side only)
```

- `kind` is one of `document | spreadsheet | presentation | pdf`.
- `format` is the on-disk format (`docx`, `xlsx`, `pptx`, `pdf`, `txt`,
  `md`, `rtf`, `csv`). Editing never rewrites the original upload; exports
  create new revisions so a lossy round trip can be undone.
- `revision` is a monotonically increasing integer used for optimistic
  concurrency. A save carries `baseRevision`; the server rejects it with
  `409 Conflict` when `baseRevision !== current revision`, and the client
  offers "save as copy" or "review differences". Nothing silently
  overwrites a newer version.

### Milestone 1 storage

The home screen talks to a `DocumentRepository` interface
(`packages/storage`). M1 ships an IndexedDB implementation so the app is
fully usable offline and testable without a server. M7 adds an HTTP
implementation with the same interface; the IndexedDB store is then kept
only for drafts and offline recovery.

### Autosave and recovery

1. Editors write a **draft** to IndexedDB on every change (debounced
   ~800 ms). Drafts survive tab crashes and reloads.
2. The autosave loop commits drafts as a new revision (debounced ~2 s and
   on blur/close). Status: `Saved`, `Saving…`, `Unsaved changes`, `Offline
   — saved locally`, `Conflict`.
3. On start-up the home screen lists drafts whose content was never
   committed and offers **Restore** or **Discard**.

## Word processor internals (M2)

- **Pagination.** A ProseMirror plugin measures each top-level block after
  layout and computes page breaks (`layout.ts`, a pure function with unit
  tests). Page chrome (bottom margin, footnotes, footer, gap, next header) is
  drawn as non-editable widget decorations between blocks, so the document stays
  one continuous editable flow. Blocks are not split across pages; that is the
  main fidelity gap versus Word and is listed in FEATURE_MATRIX.md.
- **DOCX import** maps WordprocessingML to the editor schema (styles, numbering,
  tables with merges, images, links, footnotes, equations, sections, headers and
  footers) and collects warnings for anything dropped.
- **DOCX export** uses the `docx` library and embeds the editor JSON plus a hash
  of `word/document.xml`, giving lossless reopening of files saved here.
- **Drafts** hold editor JSON (cheap to write on every change); commits convert
  to DOCX through the autosave hook's `encode` option.

## PDF editor internals (M3)

- `preparePdf` (pdf-lib) lifts annotations created here back into editable state
  using a private `/OctoData` key, reads form fields, and returns the document
  without them for pdf.js to render. Annotations are drawn as an HTML/SVG layer.
- `buildPdf` writes annotations as standard PDF annotations with appearance
  streams, fills forms, applies rotations and rebuilds the page tree in the new
  order, deleting removed pages' objects and content streams.
- The base document never changes during a session, so every save is a pure
  function of (base, state), which keeps autosave, undo and restore simple.

## Server and storage (implemented, MongoDB)

`apps/server` (Fastify) is the only component that talks to MongoDB. The web app
uses `HttpRepository`, which implements the same `DocumentRepository` interface
the editors already used, so no editor code depends on where data lives.

- Collections: `users`, `sessions`, `files`, `revisions`, `drafts`, `audit`, plus
  the GridFS bucket `blobs` for contents. See SETUP.md for what each holds.
- Every file route loads the file with `{ _id, ownerId: currentUser }`; anything
  else is a 404, so other users' files are invisible, not just forbidden.
- Saves: content is written to GridFS first, then a compare-and-set
  `findOneAndUpdate({ _id, revision: base }, { $inc: { revision: 1 } })`. A stale
  base matches nothing, the uploaded content is deleted and the client gets 409.
  This works on a standalone MongoDB (no transactions needed).
- Live updates: server-sent events per user (`/api/events`) tell open tabs to
  refresh lists. One server instance; multiple instances would need a shared
  pub/sub (e.g. MongoDB change streams on a replica set).

## Server design (original M7 plan)

- Fastify with schema-validated routes; every route resolves the caller and
  checks a permission (`owner | editor | commenter | viewer`) on the file
  before touching metadata or blobs. Authorisation lives in one module with
  unit tests for each role × action.
- Sessions: HTTP-only, `SameSite=Lax`, secure cookies; Argon2id password
  hashes; optional OIDC for OctoGenie Legal SSO.
- Uploads: streamed, size-limited, magic-byte checked against the declared
  extension, ZIP-bomb guarded (entry count, total uncompressed size, ratio)
  before any parser sees them.
- Blobs stored under random keys, never under user-supplied names. Downloads
  use `Content-Disposition: attachment` and `X-Content-Type-Options:
  nosniff`.
- Audit events (`file.created`, `file.viewed`, `file.downloaded`,
  `file.shared`, `revision.restored`, …) in an append-only table. Audit
  rows never include document content.
- Rate limiting per user and per IP; request logs exclude bodies and file
  names are hashed at `info` level.
- Integration API for OctoGenie Legal: documented REST endpoints plus signed
  webhooks (`file.saved`, `file.shared`), described in an OpenAPI file.

## Collaboration (M8)

Staged as requested: reliable single-user saves → comments and review →
version history → presence and co-editing → conflict handling and access
control. Co-editing uses Yjs documents per file served by Hocuspocus, which
authenticates with the API session and checks edit permission on connect.
The server persists Yjs updates and periodically snapshots them into a
normal revision. Presence shows only real connected users from the awareness
protocol.

## Security boundaries

- No document content is sent to external services. OCR runs locally and
  is opt-in. Any future AI feature requires explicit per-file authorisation.
- Imported HTML/Markdown/RTF is converted to the editor schema and passed
  through DOMPurify; no raw HTML is rendered.
- The converter container runs LibreOffice with no network, a read-only
  root, a per-job temp dir, CPU/memory/time limits, and macros disabled.
- Content-Security-Policy forbids inline scripts and remote origins.
