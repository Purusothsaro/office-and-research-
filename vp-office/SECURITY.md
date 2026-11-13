# Security

OctoGenie Office handles confidential legal documents. This file records the
security model and which controls exist today. Report vulnerabilities to the
OctoGenie security contact; do not open public issues for them.

## Principles

1. Documents never leave the user's control without explicit action. There
   are no analytics, telemetry or third-party requests, and no external AI
   services. Any future AI feature needs explicit per-file authorisation.
2. Untrusted input is validated before parsing and is never executed.
3. Every server operation checks authorisation (from milestone 7).
4. Logs never contain document content, file names at info level, or
   secrets.
5. Nothing silently overwrites a newer version.

## Implemented in milestone 1

| Control | Where | Test |
| --- | --- | --- |
| Allow-list of formats by extension | `packages/core/src/validate.ts` | `core.test.ts` |
| Content must match the extension (magic bytes; OOXML main part; PDF header; RTF header; UTF-8 for text) | same | `core.test.ts`, `e2e/home.spec.ts` |
| Legacy/encrypted Office containers rejected with guidance | same | `core.test.ts` |
| ZIP-bomb guard: reads the central directory only; limits entry count, total size (1 GB) and per-entry ratio (200:1 above 1 MB) | `packages/core/src/zip.ts`, `validate.ts` | `core.test.ts` |
| 100 MB upload limit | `validate.ts` | `core.test.ts` |
| File names sanitised; extension can't be changed by rename | `formats.ts` `makeFileName` | `core.test.ts`, `repository.test.ts` |
| Atomic writes: a failed save aborts the whole transaction | `packages/storage/src/indexeddb.ts` | `repository.test.ts`, e2e recovery test |
| Optimistic concurrency (stale revision → conflict, no overwrite) | same | `repository.test.ts`, `app.test.tsx` |
| No HTML rendering of file content (plain-text editor uses a textarea) | `apps/web` | — |
| Downloads are blob URLs with `download` names, revoked after use | `apps/web/src/lib/files.ts` | e2e download test |
| Document links limited to https and mailto | `editor-document/src/extensions/index.ts` | e2e dialog test (`javascript:` refused) |
| Images in documents must be embedded PNG/JPEG/GIF/WebP data URLs; remote URLs and SVG are dropped on paste and import, so documents can't trigger network requests or carry script | `editor-document/src/extensions/nodes.ts` | DOCX import tests |
| Imported DOCX is mapped node by node into the editor schema; no raw HTML is rendered. Shape SVG is built only from validated numbers and hex colours | `editor-document/src/docx/import.ts`, `nodes.ts` | `docx.test.ts` |
| KaTeX runs with `trust: false` (no href, url or HTML extensions) | `editor-document` | e2e equation test |
| PDFs render without a scripting sandbox and with XFA disabled; embedded JavaScript is never run and is reported | `editor-pdf/src/ui/pdfjs.ts`, `pdf-io.ts` | n/a |
| Deleted PDF pages are removed from the saved file (page objects and content streams), not just hidden | `editor-pdf/src/pdf-io.ts` | `pdf-io.test.ts` |
| Signatures are clearly labelled as visible images, not digital signatures | `editor-pdf` | n/a |
| PDF text edits remove the original text-drawing operators from the page content; where that's impossible the text is covered and the user is warned it may remain extractable | `editor-pdf/src/content-stream.ts`, `pdf-io.ts` | `text-edit.test.ts`, e2e |
| Markdown is converted with raw HTML sanitised by DOMPurify, then mapped onto the editor schema; scripts, handlers, remote images and `javascript:` links are dropped | `editor-document/src/formats/markdown.ts` | `formats.test.ts` |
| CSV export prefixes cells starting with `=`, `+`, `-`, `@` (non-numeric) so spreadsheet apps don't run them as formulas | `editor-sheet/src/xlsx.ts` | `xlsx.test.ts` |
| Spreadsheet and presentation links limited to http(s), mailto and in-workbook anchors; Excel macros are never run and are dropped on save | `editor-sheet`, `editor-slides` | `xlsx.test.ts` |

**Dependency advisories (2026-10-22):** `npm audit` reports `image-size`
(via pptxgenjs; denial of service on JXL/HEIF/ICNS parsing) and `uuid`
(via exceljs; buffer bounds with a caller-supplied buffer). Neither code path
handles untrusted input here: pptxgenjs only sizes our own template images, and
exceljs only calls `uuid` without a buffer. Re-check when M4/M5 start parsing
user files with these libraries.

**Server and MongoDB (implemented):**

| Control | Where | Test |
| --- | --- | --- |
| Accounts with scrypt password hashes (N=2^15); login timing doesn't reveal which emails exist | `apps/server/src/auth.ts` | `server.test.ts` |
| Sessions: random 256-bit token in an HTTP-only, SameSite=Strict cookie (Secure in production); only its SHA-256 is stored; MongoDB TTL index expires them | `auth.ts`, `db.ts` | `server.test.ts` |
| Every state-changing API call requires the `X-Octo-Client` header, which other sites can't send (no CORS is granted) | `app.ts` | `server.test.ts` |
| Rate limit on sign-in and registration (10/min/IP by default) | `app.ts` | `server.test.ts` |
| Owner check on every file, revision and draft route; other users' files return 404 | `app.ts` | cross-user isolation test |
| Server-side upload validation (same rules as the browser) and size limit | `app.ts` | `server.test.ts` |
| Deleting a file deletes all its revisions, drafts and GridFS contents | `app.ts` | `server.test.ts` |
| Audit log of security events without document contents or file names | `app.ts` | `server.test.ts` |
| Request logs redact cookies; bodies are never logged | `app.ts` | n/a |

**Production requirements for MongoDB:** the local development server accepts
connections without authentication. In production, enable MongoDB
authentication and TLS, bind it to a private network, give the app a user with
access to its own database only, and enable encryption at rest (MongoDB
Enterprise/Atlas, or disk encryption). Serve the app over HTTPS with
`COOKIE_SECURE=true`.

## Planned controls

| Milestone | Control |
| --- | --- |
| 3 | Converter container: no network, read-only root, per-job temp dir, CPU/memory/time limits, macros disabled |
| 6 | DOMPurify on every imported HTML/Markdown/RTF path; hostile-input test corpus |
| 7 | Argon2id passwords, HTTP-only secure cookies, CSRF protection, per-route authorisation tests, rate limiting, private blob keys, encryption at rest, audit log without content |
| 8 | Collaboration server authenticates every socket and re-checks permission on each document |
| 9 | CSP and headers below, dependency audit in CI, backup/restore runbook, penetration test |

## Recommended response headers

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

`style-src 'unsafe-inline'` is needed for editor libraries that set inline
styles. Revisit it once the editor engines are chosen.
