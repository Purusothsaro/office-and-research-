# OctoGenie Research: project plan

OctoGenie Research is a standalone document research and annotation app for
legal work: read, annotate, compare and connect material across the documents
in a matter. It is inspired by the workflow of LiquidText (liquidtext.net) but
its code, visual design and architecture are original. No LiquidText code,
assets, branding, text or private APIs are used.

App: `apps/web` (dev port **1580**).
Logic: `packages/research`. Backend: the existing OctoGenie server
(`apps/server`, port **3040**, MongoDB database `octogenie_research`).

## 1. Investigation

| Step | Outcome |
| --- | --- |
| REA documentation and setup | REA (`rea-agents@6.7.0`, github.com/morluto/rea) is configured as an MCP server for **Cursor** (`~/.cursor/mcp.json`) and Claude Code, using Ghidra 12.1.4 and JDK 21 in `C:\tools`. |
| Authorised LiquidText access | **None.** No licence or authorisation to inspect the LiquidText application exists, so REA was **not** run against LiquidText binaries, and nothing was decompiled, traced or intercepted. REA remains available for authorised investigations only. |
| Public behaviour | Feature research used only LiquidText's public descriptions of observable behaviour: excerpts linked to source, an infinite workspace, collapsing pages to compare passages, multi-document search, highlights and comments, ink, and export to PDF/DOCX. Each is mapped to an original implementation in [FEATURE_MATRIX.md](FEATURE_MATRIX.md). |
| Library evaluation | See [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md), covering rendering, annotation, canvas, OCR, export, persistence and licences. |
| Environment | Windows 11, Node 22.19, MongoDB 8.2 on localhost, Chrome for Playwright. The OctoGenie Office monorepo (React 19, Vite 8, Tailwind 4, TS 7) was already in place, so Research reuses its server, auth and storage. |

## 2. Delivery stages

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Working UI, project creation, PDF viewing | **Done, tested.** Projects home (create, rename/edit case details, duplicate, archive, delete), three-pane project view, pdf.js viewer with page navigation, zoom and rotation. |
| 2 | Text selection, excerpts, source navigation | **Done, tested.** Selection chip; add excerpt or drag it onto the workspace; source reference (document, file revision, page, PDF rectangles, text offsets) stored separately from card text; "Open source" scrolls to and flashes the passage. |
| 3 | Workspace: draggable cards, connectors, grouping | **Done, tested.** Pan/zoom canvas; move and resize; edge-attached connectors with supports / contradicts / references / related and editable labels; groups by issue, argument, witness, document or evidence category; multi-select, marquee, align and distribute; context menus; undo/redo. |
| 4 | Notes, annotations, search, persistence | **Done, tested.** Highlights, underlines and comments (margin pins); annotation list with filters; tags and review statuses; full-text search across documents; MongoDB persistence with revisions; IndexedDB device copy for crash recovery; live sync between tabs and devices. |
| 5 | DOCX/TXT/Markdown, OCR, export | **Done, tested.** DOCX/TXT/MD are laid out as readable PDF copies (originals kept). Optional OCR runs in the browser (Tesseract WASM, local assets) and produces a searchable copy. Exports: summary to DOCX and PDF, annotated PDF, workspace snapshot (SVG/PNG), project data (JSON). |
| 6 | Legal research features, security, performance | **Done, tested.** Case name, reference, court, jurisdiction and description; summaries organised by issue, argument, witness, evidence, document, tag or status; disclaimers; per-user and per-organisation project isolation; audit without content; 300-page document and 400-card workspace tests. |
| 7 | Cloud sync and OctoGenie Legal integration | **Partly done.** Projects already sync through the OctoGenie server (MongoDB) with live updates, and documents live in the user's OctoGenie files. **Not built:** sharing projects between users, organisation administration, object storage (S3/Azure) for production, and integration with other OctoGenie Legal systems. Deploying needs approval. |

## 3. Acceptance tests

All items in brief section 13 are covered by automated tests; see
[TEST_RESULTS.md](TEST_RESULTS.md) for commands and the latest results.

## 4. Open decisions that need approval

- Production object storage (S3 or Azure Blob with server-side encryption) instead of GridFS.
- Organisation model: today every user has a personal organisation, and a
  `users.orgId` field scopes projects. Admin tooling to create
  organisations and share projects within them is not built.
- Deployment target, TLS, backups and retention policy.
- A Unicode font for converted DOCX/TXT/MD copies, to show non-Latin text that the standard PDF fonts can't encode.
