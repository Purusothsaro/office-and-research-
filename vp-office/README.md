# OctoGenie Office

A private office suite for OctoGenie Legal: documents, spreadsheets,
presentations and PDFs, with an original UI inspired by the workflow of
ONLYOFFICE Docs.

**Status:** every supported format can be edited: DOCX, Markdown and RTF in the
word processor, XLSX and CSV in the spreadsheet editor, PPTX in the presentation
editor, PDF (including its existing text) in the PDF editor, and TXT in the
plain-text editor. All data (accounts, files, every revision, drafts and the
audit log) is stored in **MongoDB** through the app's API server. Sharing and
real-time collaboration are not built yet. See [PROJECT_PLAN.md](PROJECT_PLAN.md) and
[FEATURE_MATRIX.md](FEATURE_MATRIX.md).

OctoGenie Research (the LiquidText-style research workspace) is a separate
project in `../octogenie-research`.

## What works today

- Home screen: recent files, type filters, search, sort, grid/list views,
  drag-and-drop and button upload, rename, duplicate, download, delete.
- New blank DOCX, XLSX and PPTX files, plus six original legal templates.
  These are real OOXML files generated in the browser and checked
  structurally by the tests. Opening them in Microsoft Office hasn't been
  tested automatically yet.
- Upload validation by extension **and** content (magic bytes, OOXML part
  check, ZIP-bomb guard, UTF-8 check, 100 MB limit).
- Plain-text editor for TXT, Markdown and CSV with autosave, a save-status
  indicator, Ctrl+S, crash recovery, and conflict detection between tabs.
- **Word processor (DOCX):** ribbon with File, Home, Insert, Layout, References,
  Review and View; paged print layout with headers, footers, page numbers and
  footnotes; styles, lists, tables, images, shapes, links, equations, table of
  contents, columns, find and replace, version history. DOCX import reports
  anything it can't keep.
- **PDF editor:** thumbnails, search, zoom; highlights, sticky-note comments,
  drawing, text boxes, drawn signatures; form filling; rotate, reorder and delete
  pages. Annotations are saved as standard PDF annotations. Existing PDF text
  can't be edited.
- **Case workspace (LiquidText-style):** read PDFs beside an infinite canvas, pull
  excerpts out by dragging selected text, link each excerpt back to its page,
  organise excerpts and notes into issue groups with connections, search all
  documents, and export an issue outline with citations to Word.
- Every save is kept as a revision; the original upload is never overwritten.
- Keyboard navigation throughout (press `?` on the home screen), and a
  responsive layout down to phone width.

Files are stored in the browser's IndexedDB in this milestone. Server
storage, accounts and sharing arrive in milestone 7.

## Quick start

```bash
npm install
npm run dev          # API (MongoDB) on :3030 + app on http://localhost:1570
```

See [SETUP.md](SETUP.md) for prerequisites and details.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API server and the web app in development mode |
| `npm run lint` | oxlint (server) |
| `npm run build` | Typecheck everything and build the production bundle to `apps/web/dist` |
| `npm run preview` | Serve the production build on port 4173 |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests in the installed Chrome (Playwright) |
| `npm run typecheck` | TypeScript only |

## Repository layout

```
apps/web                 React app (home screen, editor pages)
apps/server              API server (Fastify, MongoDB): auth, files, projects
packages/core            Formats, upload validation, blank files, templates
packages/storage         DocumentRepository interface + IndexedDB implementation
packages/editor-document Word processor: Tiptap extensions, pagination, DOCX import/export, ribbon UI
packages/editor-pdf      PDF editor: pdf.js viewer, annotations, forms, page operations, pdf-lib save pipeline
e2e                 Playwright tests
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): stack decision, data model, autosave design, server and collaboration plans
- [PROJECT_PLAN.md](PROJECT_PLAN.md): environment, milestones, exit criteria, open approvals
- [FEATURE_MATRIX.md](FEATURE_MATRIX.md): what is implemented, tested and planned, plus format compatibility
- [LICENSE_REVIEW.md](LICENSE_REVIEW.md): every dependency's licence and the excluded options
- [SECURITY.md](SECURITY.md): security model and the controls implemented so far

## Known limitations

- XLSX, PPTX and RTF files can be created, uploaded, stored and downloaded, but
  not edited yet.
- Document pagination breaks between paragraphs and tables, never inside one.
  Printing uses the browser's print dialog.
- PDF signatures are drawn images, not certificate-based digital signatures.
- Comments and track changes in documents, and collaboration, come later.
- Files are private to each account; sharing between accounts is not built yet.
- Real-time co-editing is not built yet.
