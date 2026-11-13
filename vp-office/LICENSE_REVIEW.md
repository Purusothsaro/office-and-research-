# Licence review

Reviewed 2026-10-22 against the npm registry and upstream repositories. This
is an engineering review, not legal advice. Have counsel confirm before
commercial release.

Policy: permissive licences (MIT, BSD, ISC, Apache-2.0) are allowed. Weak
copyleft (MPL-2.0, LGPL) is allowed when unmodified and kept as separate files
or processes. Strong copyleft (GPL, AGPL) and source-available or commercial
licences are excluded unless a commercial licence is bought and recorded here.

## Selected components

| Component | Version | Licence | Use | Obligations |
| --- | --- | --- | --- | --- |
| react, react-dom | 19.3.1 | MIT | UI | Keep notice |
| react-router-dom | 7.18.4 | MIT | Routing | Keep notice |
| vite, @vitejs/plugin-react | 8.3.5 / 6.1.2 | MIT | Build (dev only) | None shipped |
| tailwindcss | 4.3.3 | MIT | Styles | Keep notice |
| lucide-react | 1.61.0 | ISC | Icons | Keep notice |
| typescript | 7.0.2 | Apache-2.0 | Build (dev only) | None shipped |
| idb | 8.0.4 | ISC | IndexedDB wrapper | Keep notice |
| docx | 9.13.0 | MIT | DOCX writing | Keep notice |
| exceljs | 4.4.0 | MIT | XLSX read/write | Keep notice. Last release 2023: maintenance risk, see below |
| pptxgenjs | 4.0.1 | MIT | PPTX writing | Keep notice |
| jszip | 3.10.2 | MIT **or** GPL-3.0 | ZIP/OOXML | We elect MIT |
| @tiptap/core, react, pm, starter-kit, extensions, extension-text-style, -text-align, -highlight, -table, -image, -subscript, -superscript, -mathematics | 3.32.0 | MIT | Word processor | Keep notice. Do **not** add Tiptap Pro / Cloud packages |
| katex | 0.18.11 | MIT | Equation rendering | Keep notice; bundled KaTeX fonts are MIT/OFL (ship their licence files) |
| prosemirror-* | 1.x | MIT | Editor model (via Tiptap) | Keep notice |
| @univerjs/presets, preset-sheets-core, -sort, -filter, -data-validation, -conditional-formatting, -find-replace, -hyper-link, -note | 1.1.0 | Apache-2.0 | Spreadsheet editor | NOTICE file. `preset-sheets-advanced` and `-collaboration` are **not** used: they depend on commercial `@univerjs-pro` packages |
| papaparse | 5.7.0 | MIT | CSV | Keep notice |
| echarts | 6.1.0 | Apache-2.0 | Spreadsheet charts | NOTICE file |
| marked / turndown / @tiptap/html | 18.1.1 / 7.2.4 / 3.32.0 | MIT | Markdown ↔ document | Keep notice |
| dompurify | 3.4.17 | MPL-2.0 or Apache-2.0 | Sanitising Markdown HTML | We elect Apache-2.0 |
| mammoth | 1.13.0 | BSD-2-Clause | Not used (own DOCX importer) | — |
| @univerjs/* (OSS) | 1.1.0 | Apache-2.0 | Spreadsheet (M4) | NOTICE file; do not use `@univerjs-pro/*` without a licence |
| echarts | 6.1.0 | Apache-2.0 | Charts (M4) | NOTICE file |
| papaparse | 5.7.0 | MIT | CSV (M4) | Keep notice |
| konva, react-konva | 10.9.0 / 19.3.2 | MIT | Slide canvas (M5) | Keep notice |
| pdfjs-dist | 6.4.299 | Apache-2.0 | PDF rendering, text layer, search | NOTICE file. A subset of its text-layer CSS is copied into `editor-pdf` with attribution |
| @cantoo/pdf-lib | 2.11.1 | MIT | PDF save pipeline (annotations, forms, pages) | Keep notice |
| @embedpdf/* | 2.15.1 | MIT (PDFium: BSD-3 / Apache-2.0) | Evaluated, not used | pdf.js chosen for maturity |
| tesseract.js | 7.0.0 | Apache-2.0 | Optional local OCR (M6) | NOTICE; traineddata files are Apache-2.0 |
| oxlint | 1.90.0 | MIT | Lint (dev only) | None shipped |
| dompurify | 3.4.17 | MPL-2.0 **or** Apache-2.0 | Sanitising | We elect Apache-2.0 |
| marked / turndown | 18.1.1 / 7.2.4 | MIT | Markdown (M6) | Keep notice |
| yjs, y-prosemirror, @hocuspocus/server | 13.6 / 1.3 / 4.7 | MIT | Collaboration (M8) | Keep notice |
| fastify, @fastify/cookie, @fastify/rate-limit, @fastify/static | 5.12.7 / 11.x / 11.x / 10.x | MIT | API server | Keep notice |
| mongodb (Node.js driver) | 7.7.0 | Apache-2.0 | Database access, GridFS | NOTICE file |
| tsx | 4.x | MIT | Runs the TypeScript server | Keep notice |
| MongoDB Server | 8.2 (installed separately) | SSPL-1.0 (Community) | Database | Not bundled or modified; runs as a separate service. SSPL obligations apply only if MongoDB itself is offered as a service. **Have counsel confirm** before offering OctoGenie Office as a hosted service; MongoDB Atlas or Enterprise avoids the question |
| LibreOffice (headless) | 25.x | MPL-2.0 | Conversion container (M3) | Ship unmodified in a separate container; provide source offer for MPL files; no linking |

Test-only (not shipped): vitest, jsdom, fake-indexeddb (Apache-2.0),
@testing-library/* (MIT), @playwright/test (Apache-2.0).

## Excluded or conditional

| Component | Licence | Decision |
| --- | --- | --- |
| ONLYOFFICE Docs Community | AGPL-3.0 | Excluded. UX reference only. Developer Edition is the commercial route if ever needed |
| SuperDoc | AGPL-3.0 / commercial | Excluded by default. Strongest DOCX fidelity option; reconsider with a commercial licence if our mapper misses fidelity targets |
| HyperFormula | GPL-3.0 / commercial | Excluded; Univer's Apache-2.0 formula engine is used |
| Tiptap Pro (pagination, comments, DOCX conversion, AI) | Proprietary | Excluded; we build equivalents on open ProseMirror |
| Univer Pro (`@univerjs-pro/*`: XLSX exchange, charts, pivot, print, collaboration) | Commercial | Excluded; ExcelJS and ECharts fill the gaps |
| CKEditor 5 premium features | GPL-2.0+ / commercial | Excluded |
| SheetJS Pro | Commercial | Excluded. SheetJS CE on npm (0.18.5) is stale; current CE builds only come from cdn.sheetjs.com |
| MinIO | AGPL-3.0 | Not shipped. Use cloud S3/Azure Blob or SeaweedFS (Apache-2.0) |
| Pandoc | GPL-2.0+ | Not used. If added later, only as a separate process in its own container after legal review |
| Collabora Online / CODE | MPL-2.0 | Viable alternative engine (WOPI iframe) with its own UI and branding. Not chosen because the brief asks for an original editor UI |

## Risks

- **ExcelJS maintenance.** No release since 2023. Mitigation: wrap it
  behind `editor-sheet` mapper interfaces so it can be replaced (for
  example by a licensed SheetJS Pro or Univer Pro) without touching the UI.
- **pdf-lib upstream is unmaintained**, so we use the maintained
  `@cantoo/pdf-lib` fork.
- **Fonts.** Do not bundle Microsoft fonts. Use metric-compatible open fonts
  (Liberation, Carlito, Caladea; SIL OFL / Apache-2.0) for layout and PDF
  export, and record each font's licence here when it is added.

## Attribution

Before release, generate `THIRD_PARTY_NOTICES.md` from the production
dependency tree (`npx license-checker --production`) and ship it with the
app's About dialog.
