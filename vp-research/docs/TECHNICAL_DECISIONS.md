# OctoGenie Research: technical decisions

## Deviations from the brief's suggested stack

| Brief | Chosen | Why |
| --- | --- | --- |
| Node.js + **Express** | Node.js + **Fastify** (existing OctoGenie server) | The OctoGenie server already provides sessions, CSRF header checks, rate limiting, upload validation, file revisions, audit and SSE, all tested. A second Express server would duplicate the auth and security code and split user data. Research adds one route module (`apps/server/src/projects.ts`). |
| **PostgreSQL + Prisma** "if needed" | **MongoDB** (existing) | Not needed: you asked for MongoDB for all application data in this repo. Projects, revisions and audit fit the existing collections and GridFS. If PostgreSQL becomes a requirement, the change is confined to `projects.ts`/`db.ts`, because the client only sees the HTTP API. |
| IndexedDB "for local workspace persistence" | IndexedDB for the **device copy** (crash and offline recovery) and text-index cache; the server is the source of truth | Keeps work safe when the tab closes or the network drops, while still giving server-side authorisation, version history and sync across devices (brief section 11). |
| Private object storage in production | GridFS now; S3 or Azure Blob is an open decision | Blob access sits behind `putBlob`/`getBlob`, so it can be swapped without UI changes. Needs approval and infrastructure. |

## Library evaluation

| Need | Options considered | Chosen | Reason |
| --- | --- | --- | --- |
| PDF rendering and text selection | pdf.js, PDFium (EmbedPDF), PSPDFKit/Apryse (commercial) | **pdf.js 6.4** (Apache-2.0) | Mature, already in the repo; TextLayer gives native selection; on-demand page rendering. Commercial SDKs excluded on licence and cost. |
| PDF writing (annotations, OCR layer, reports) | pdf-lib, @cantoo/pdf-lib, PDFKit | **@cantoo/pdf-lib 2.11** (MIT) | The maintained pdf-lib fork, already in the repo. Writes standard Highlight/Underline/Text annotations with appearance streams and supports invisible-text operators for the OCR layer. |
| Canvas and connectors | React Flow (MIT), Konva, tldraw (licence restrictions), custom DOM + SVG | **Custom DOM + SVG** | Cards are rich, accessible HTML (textareas, buttons, screen-reader labels); connectors are SVG lines between edge points; viewport culling handles hundreds of cards. tldraw's licence needs a commercial key in production; React Flow would work but adds abstractions we'd override. |
| OCR | tesseract.js (Apache-2.0), cloud OCR (Azure, Google, AWS) | **tesseract.js 7 + tesseract.js-core 7 + English LSTM model** | Runs in the browser in WebAssembly, so **documents never leave the device**. Cloud OCR would send confidential files to a third party, which the brief forbids without authorisation. Engine and model are served from the app's own origin by a Vite plugin; no CDN is used. |
| DOCX reading | Own importer (`@octo/editor-document`), mammoth | **Own importer** | Already tested, with no HTML step. Output is laid out as a PDF copy for consistent coordinates and page citations. |
| DOCX writing | docx (MIT) via `exportDocx` | **docx** | Already used by the Office app and verified by reopening. |
| Markdown | marked + DOMPurify (existing sanitising importer) | Same | Embedded HTML and scripts are removed before layout (tested). |
| Lint | ESLint + typescript-eslint, oxlint | **oxlint 1.90** (MIT) | typescript-eslint needs the TypeScript JS API, which TypeScript 7 (native) doesn't provide; oxlint works without it. Correctness rules plus React hooks rules. |
| Tests | Vitest, Playwright | Same as the repo | Unit/integration tests in Node and jsdom; end-to-end tests in installed Chrome against the real server and MongoDB. |

## Commercial-use licence review (new dependencies)

| Package | Version | Licence | Notes |
| --- | --- | --- | --- |
| tesseract.js | 7.0.0 | Apache-2.0 | Ship its NOTICE/licence |
| tesseract.js-core | 7.0.0 | Apache-2.0 | WASM build of Tesseract (Apache-2.0) |
| @tesseract.js-data/eng | 1.0.0 | MIT (package); Tesseract `tessdata` model Apache-2.0 | `4.0.0_best_int` English model |
| oxlint | 1.90.0 | MIT | Dev only |

Everything else (pdf.js, pdf-lib fork, docx, marked, DOMPurify, React,
Tailwind, lucide) was already reviewed in `LICENSE_REVIEW.md`. No
LiquidText, PSPDFKit, Apryse or tldraw code is used.

## Other decisions

- **Converted copies instead of a second viewer.** DOCX, TXT and MD are laid
  out as PDF (Times, US Letter) so excerpts, coordinates, page numbers,
  annotations and search work the same way as for PDFs. The trade-off is
  that the layout differs from Word's; the UI and summaries say so.
  Characters outside WinAnsi are replaced and reported.
- **Annotations live in the workspace, not the file.** That meets brief section 9 ("source never accidentally modified"). An annotated PDF is an explicit export of a copy.
- **No generated legal content.** Summaries are assembled only from the
  user's cards. Citations are document name and page only, never case-law
  citations. Every export carries a disclaimer, and OCR text is labelled.
- **Review statuses** describe workflow (To review, Reviewed, Key, Disputed,
  Follow up), never findings such as "verified" or "proven".
