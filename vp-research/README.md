# OctoGenie Research

A legal research and annotation workspace: read documents, pull passages onto a
spatial workspace, connect and organise them, and turn them into cited
summaries. Inspired by the workflow of LiquidText. The code, design and
architecture are original (see [docs/liquidtext-interaction-study.md](docs/liquidtext-interaction-study.md)).

This is a standalone project with its own API server, MongoDB database and
accounts.

## Quick start

```bash
npm install
npm run dev     # API on :3040 (MongoDB database "octogenie_research") + app on http://localhost:1580
```

Needs Node.js 22.19+ and MongoDB running locally. See [SETUP.md](SETUP.md).

## What it does

- **Projects** per matter, with case name, reference, court, jurisdiction and
  description. Rename, duplicate, archive and delete.
- **Documents:** PDF, Word (.docx), text and Markdown.
  - Originals are never changed. Word, text and Markdown are shown as
    readable PDF copies.
  - OCR for scans runs in the browser, so files never leave the device.
- **Reader:**
  - tabs, page navigation, zoom, rotate, find;
  - side-by-side documents;
  - collapse pages or "Bring together" two places;
  - outline, thumbnails and bookmarks;
  - margin bars beside excerpted text.
- **Tools:**
  - select text (with selection handles);
  - pen and highlighter on pages;
  - eraser;
  - lasso to excerpt an area.
- **Excerpts:** each one keeps its exact source (document version, page, text
  offsets, rectangles). Click to return to the passage. Anchors are checked
  before highlighting, and broken links can be re-linked.
- **Workspace:**
  - cards and notes; merge cards by dropping one onto another;
  - groups by issue, argument, witness or evidence;
  - connections typed supports, contradicts, references or related;
  - tags, statuses and comments;
  - child workspaces;
  - one-tap relationships, and gather connected cards;
  - lines that join document passages to cards;
  - undo and redo.
- **Search** across all documents, and a "Together view" of results or marks
  with adjustable context.
- **Export:** cited summary (Word or PDF), annotated PDF, workspace image
  (SVG/PNG), project data (JSON).
- **Saving:** autosave with compare-and-set revisions, version history, offline
  and crash recovery, and live sync between tabs and devices.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API server and web app in development mode |
| `npm run build` | Type-check and build the web app to `apps/web/dist` |
| `npm start` | Build, then serve the app and API from one process (port 3040) |
| `npm test` | Unit and integration tests (Vitest; server tests use a throwaway database) |
| `npm run test:e2e` | End-to-end tests in Chrome (Playwright, database `octogenie_research_e2e`) |
| `npm run lint` / `npm run typecheck` | oxlint / TypeScript |

## Layout

```
apps/web                 React app (Vite, Tailwind): projects, reader, workspace
apps/server              API (Fastify, MongoDB, GridFS): accounts, files, projects, live events
packages/research        Model, source anchors, search, import/OCR, export, persistence (no UI)
packages/core            File formats and upload validation
packages/editor-document Word and Markdown conversion used for import and export
e2e                      Playwright tests
docs                     Plan, architecture, features, decisions, export format, test results, interaction study
```
