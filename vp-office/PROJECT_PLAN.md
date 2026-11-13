# Project plan

## Environment (inspected 2026-10-22)

| Item | Found |
| --- | --- |
| OS | Windows 11 x64, 13 GB RAM |
| Node / npm / pnpm | 22.19.0 / 10.9.3 / installed |
| Git | installed |
| PostgreSQL | 17, running as a Windows service (`postgresql-x64-17`) |
| Docker Desktop | installed (daemon must be started for the converter container) |
| LibreOffice | not installed. Needed in M3 (container preferred) |
| Browsers | Chrome, Edge (Playwright runs on the installed Chrome) |
| Editors | Cursor, VS Code |
| REA | `rea-agents@6.7.0` registered for Claude Code and Cursor, Ghidra 12.1.4 + Temurin JDK 21 provider healthy |

## Milestones

Each milestone ends with: typecheck, unit + integration tests, e2e tests, a
production build, updated FEATURE_MATRIX.md, and no known regressions.

| # | Milestone | Deliverable | Exit criteria |
| --- | --- | --- | --- |
| 1 | Foundation + home screen | Monorepo, format registry, upload validation, IndexedDB repository, drafts/recovery, home screen, TXT editor harness | ✅ Done. See README for test commands |
| 2 | Word processor | `editor-document`: schema, ribbon, pagination, styles, tables, images, headers/footers, footnotes, find/replace, DOCX import/export | ✅ Done. Round-trip and editor tests; about 13 ms per keystroke in dev mode on a 3-page document |
| 3 | DOCX + PDF | PDF editor ✅ (annotations, forms, pages, save/reopen). Remaining: LibreOffice converter container for server-side DOCX→PDF and a larger real-world DOCX corpus | Round-trip corpus (≥30 DOCX files) with structural diff thresholds |
| 4 | Spreadsheet | Univer integration, ExcelJS and CSV mappers, charts | Formula corpus vs. known results; XLSX round-trip corpus |
| 5 | Presentation | Slide model, Konva editor, PPTX import/export, slideshow, PDF export | Object geometry round-trip tests; PPTX opens in PowerPoint and LibreOffice |
| 6 | TXT, Markdown, RTF (+ OCR) | Rich Markdown/RTF in the document editor, optional local OCR | Round-trip tests; sanitiser tests with hostile input |
| 7 | Storage, auth, versions | ✅ `apps/server`: Fastify + **MongoDB** (GridFS for contents), accounts, sessions, revisions with 409 conflicts, drafts, audit. Sharing still to do | Cross-user isolation tests for every route; conflict tests (passing) |
| 8 | Collaboration + review | Comments, track changes, Yjs co-editing via Hocuspocus, presence | Two-client sync tests, offline-merge tests, permission tests |
| 9 | Hardening + deployment | CSP, rate limits, ZIP-bomb guards, Docker Compose, backup/restore, deployment guide | Security test suite, load test, documented runbook |

## Approvals needed before later milestones

- Creating a database and running migrations against the local PostgreSQL
  (M7): needs a database name and credentials from you.
- Pulling the LibreOffice container image (M3) and starting Docker Desktop.
- Any deployment.

## Using REA in this project

REA helps answer "how does the reference product do X?" from behaviour you
are authorised to inspect: the public ONLYOFFICE web demo's network traffic
and page structure (`browser` tools), saved HAR captures, and public client
bundles. Findings feed UX and behaviour notes in `docs/research/`. No code,
assets or private API shapes are copied into this repository.
