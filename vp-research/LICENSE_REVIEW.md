# Licence review

All dependencies allow commercial use. No LiquidText, PSPDFKit, Apryse or tldraw code is used.

| Component | Licence | Use |
| --- | --- | --- |
| react, react-dom, react-router-dom | MIT | UI, routing |
| vite, @vitejs/plugin-react, tailwindcss, typescript | MIT / Apache-2.0 | Build (dev only) |
| lucide-react | ISC | Icons |
| pdfjs-dist | Apache-2.0 | PDF rendering, text layer, search (a subset of its text-layer CSS is adapted, with attribution) |
| @cantoo/pdf-lib | MIT | Writing PDFs: converted copies, OCR text layer, annotated export, summaries |
| tesseract.js, tesseract.js-core | Apache-2.0 | In-browser OCR |
| @tesseract.js-data/eng | MIT (package), Apache-2.0 (model) | English OCR model |
| @tiptap/*, prosemirror-* | MIT | Document model for Word/Markdown conversion (no Tiptap Pro) |
| docx, jszip (MIT election), marked, turndown | MIT | Word and Markdown import/export |
| dompurify | MPL-2.0 or Apache-2.0 (Apache-2.0 elected) | Sanitising Markdown |
| katex | MIT | Equations in Word import |
| fastify, @fastify/* | MIT | API server |
| mongodb (driver) | Apache-2.0 | Database access, GridFS |
| MongoDB Server | SSPL-1.0 (Community) | Database, run as a separate service; have counsel confirm before offering this as a hosted service |
| vitest, @playwright/test, jsdom, fake-indexeddb, oxlint | MIT / Apache-2.0 | Tests and lint (dev only) |

Before release, generate `THIRD_PARTY_NOTICES.md` with `npx license-checker --production`.
