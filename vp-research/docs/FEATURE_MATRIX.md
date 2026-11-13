# OctoGenie Research: feature matrix

✅ built and covered by automated tests · 🟡 built, partly tested or limited · ❌ not built

"Unit" means Vitest (`packages/research`, `apps/server`) and "E2E" means
Playwright in Chrome against the real server (`e2e/research.spec.ts`).

## Inspiration mapping (public LiquidText behaviour → original implementation)

| Public behaviour | OctoGenie Research | Status |
| --- | --- | --- |
| Pull excerpts out of documents, each linked to its source | Selection chip "Add excerpt" or drag onto the workspace; card citation opens and flashes the passage | ✅ E2E |
| Large flexible workspace | Pan/zoom canvas with notes, excerpts, groups, ink | ✅ E2E |
| Connect ideas across documents | Connectors with relationship types and labels | ✅ Unit + E2E |
| Collapse pages to see distant passages together | "Collapse page" in the viewer; "Pages X–Y collapsed · Expand" bar | 🟡 built; not covered by the research E2E (the same feature in the Case workspace is tested) |
| Search across all documents | Search panel with document/page results and highlighting | ✅ E2E |
| Highlights, comments, ink | Highlight, underline, comment (margin pins), pen on the workspace | ✅ E2E (pen: unit-level data only) |
| Export | Summary DOCX/PDF, annotated PDF, SVG/PNG snapshot, JSON | ✅ E2E |
| Compare passages | Compare dialog: selected excerpts side by side with crops of their source pages | 🟡 built; checked manually, no automated test |
| Pinch to collapse, iPad gestures | Not replicated; Collapse buttons and side-by-side viewers instead | ❌ |

## Core reading workflow (second brief)

| Requirement | Status |
| --- | --- |
| Select → excerpt (button or drag) with exact text, page, offsets, rectangles, version and owner ids | ✅ E2E (`core-workflow.spec.ts`) |
| Selection handles | ✅ built; mouse E2E checks they appear; dragging them with touch not device-tested |
| Move and resize with saved positions; connectors stay attached | ✅ E2E |
| Excerpt → source (validated anchor) and source mark → excerpt; hover and active states both ways | ✅ E2E |
| Document tabs, collapsible panel, reading position restored | ✅ E2E |
| Invalid anchors not highlighted; Fix link recovery; unavailable files flagged | ✅ E2E + unit |
| Two-finger pinch zoom on the workspace | 🟡 built; not device-tested |
| One tap on an excerpt opens its original context (source passage) in the reader; one tap on any card highlights its connected cards and lines; "Connections (n)" lists each relationship with one-click source links; "Gather connected cards here" lines them up beside the card | ✅ Unit + E2E |
| Document and workspace together: drag a passage onto a card (or Connect: card → passage, passage → card, or the Link button) to link them; curved lines join each linked passage to its card across both panes; the selected excerpt shows a dashed line to its source; off-screen passages show a "↑/↓ p. N" stub that opens them | ✅ Unit + E2E |
| Bring together: click two places (or pinch with two fingers on touch) and the pages between collapse; spread or click the bar to reopen | ✅ E2E (click); touch pinch built, not device-tested |
| Together view: search results or highlights/excerpts from every document as page strips; context adjustable with − / +, Ctrl+scroll or trackpad/touch pinch; strips open their place or drag onto the workspace | ✅ E2E (buttons and Ctrl+scroll) |
| Project toolbar: Home, Back/Forward through reading places, Undo/Redo, tools (Select text, Pen, Highlighter, Eraser, Lasso), Share, Search, Help, More | ✅ E2E |
| Pen and highlighter ink on document pages (kept per document version, never written into the file); eraser for ink and marks | ✅ Unit + E2E |
| Lasso: drag a box on a page to excerpt that area (text inside plus an image of the region) | ✅ E2E |
| Card action bar: Comment, Edit, Copy (with citation), Cut, Copy Link (opens the card), To Child Workspace, Delete, Tags, colours (fill), text size, plus status, align, group, connect, compare, connections, separate, duplicate | ✅ E2E |
| Multiple and child workspaces: breadcrumb switcher, new/rename/delete, moving cards between them; each keeps its own view | ✅ Unit + E2E |
| Reader rail: outline, annotations, page thumbnails, add document, bookmarks | ✅ E2E (thumbnails, bookmarks); outline shown when the PDF has one |
| Workspace rail: add text box, zoom out to fit, add workspace | ✅ E2E (text box) |
| Margin bars beside excerpted passages; "P n" page labels | ✅ E2E |
| Liquid joints between merged cards | ✅ E2E |
| Divider handle: document only / workspace only / both | ✅ E2E |
| Merge: drop an excerpt or note onto another to join them (they move as one, each keeps its own source); Separate or Alt+drag to pull apart; kept after reload | ✅ Unit + E2E |

## Brief requirements

### 3. Layout

| Requirement | Status |
| --- | --- |
| Left panel: documents with names, page counts, processing status; import; switch; search and filter by type | ✅ E2E |
| Centre viewer: page navigation, zoom, rotate, text selection, highlight, comments, excerpt by drag or button, show source page | ✅ E2E (rotation: built, not asserted) |
| Several documents at once | 🟡 "Open side by side" shows two viewers; not in E2E |
| Right workspace: pan/zoom, movable and resizable cards, excerpt cards, notes, connectors, groups, undo/redo, search/filter | ✅ E2E |
| Resizable panels | ✅ splitters (pointer and arrow keys); not asserted in E2E |
| Keyboard shortcuts | ✅ listed in the `?` dialog; Undo/Redo E2E via buttons |
| Desktop and tablet layouts | ✅ E2E (1600, 900 and 390 px wide) |

### 4. Import and processing

| Requirement | Status |
| --- | --- |
| PDF upload, validation (by content), rendering, text extraction | ✅ Unit + E2E |
| DOCX import and readable rendering | ✅ Unit (headings, bold, lists) + E2E (via the converted copy). Layout differs from Word; images become "[Image]" placeholders |
| TXT and Markdown | ✅ Unit + E2E; Markdown HTML/scripts are stripped (unit) |
| Metadata and page references | ✅ |
| Optional OCR for scanned PDFs | ✅ E2E: an image-only PDF is recognised in Chrome and then searchable and excerptable. English only |
| Native text vs OCR clearly distinguished | ✅ "Native text" / "OCR text" / "Converted" badges; OCR flag on cards and in exports |
| Progress indicators and clear errors | ✅ per-document status line (upload, convert, read page n of N, OCR page n of N) and error toasts |
| Original files preserved | ✅ originals are never modified; conversions and OCR are separate linked files |

### 5. Excerpts and source tracking

| Requirement | Status |
| --- | --- |
| Capture text, document id, page, coordinates and offsets | ✅ Unit + E2E |
| Linked excerpt card; move, resize, tag, group | ✅ E2E |
| Open exact source passage from the card | ✅ E2E |
| Source intact when card is edited | ✅ Unit ("edited" marker shows the captured text) |
| Warn about broken mappings when a document is replaced | ✅ Unit + E2E (ok, moved and broken; broken sources open the old revision) |
| Sources stored separately from card content | ✅ `sources` map |

### 6. Connections and visual analysis

| Requirement | Status |
| --- | --- |
| Connectors between notes, excerpts and groups | ✅ |
| Editable labels; relationship types supports, contradicts, references, related | ✅ E2E |
| Tags, colours, grouping by category | ✅ E2E (tags, groups); colours unit |
| Multi-selection (Shift+click, Shift+drag marquee) and align/distribute | ✅ Shift+click E2E; align/distribute unit; marquee built, not in E2E |
| Context menus and keyboard commands | 🟡 built; context menus not in E2E |
| Exact arrangement saved and restored | ✅ E2E (reload) |
| Connectors stay attached when cards move or resize | ✅ Unit (edge geometry) + E2E (move) |

### 7. Legal research

| Requirement | Status |
| --- | --- |
| Case name, reference, court, jurisdiction, description | ✅ E2E |
| Issues, arguments, witnesses, evidence categories (group categories); tags; review statuses | ✅ Unit |
| Supporting and contradicting evidence (connector relationships), listed in summaries | ✅ Unit |
| Citations and page references | ✅ document + page only |
| Research summary from selected notes, organised by issue, argument, witness, evidence, document, tag or status | ✅ Unit + E2E |
| No invented citations, nothing presented as verified conclusions | ✅ summaries contain only user content; disclaimer in every report (tested) |

### 8. Search and comparison

| Requirement | Status |
| --- | --- |
| Full-text search across documents with document and page | ✅ Unit + E2E |
| Keyword highlighting | ✅ viewer marks and overview strip (E2E) |
| Search within the current document | ✅ "Current document" scope and the viewer's Find bar |
| Filter by tags and document | ✅ workspace filter (unit); search scope by document (unit) |
| Compare excerpts from different pages or documents | 🟡 Compare dialog, manual check only |
| Indexes tied to document versions | ✅ keyed by `viewFileId@viewRevision` |

### 9. Notes, annotations and review

| Requirement | Status |
| --- | --- |
| Highlights, underlines, comments, margin notes | ✅ E2E (highlight, comment); underline unit + export |
| Sticky notes and free-form notes | ✅ |
| Drawing layer | 🟡 pen on the workspace; no drawing on document pages |
| Tags and status labels | ✅ |
| Annotation list with filters | ✅ E2E |
| Edit and delete annotations | ✅ popover (manual + unit) |
| Undo/redo | ✅ E2E |
| Annotations stored separately from the file | ✅ |

### 10. Export

| Requirement | Status |
| --- | --- |
| Notes and excerpts to DOCX | ✅ reopened in tests (Unit: `importDocx`; E2E: XML check) |
| Summary to PDF | ✅ reopened with pdf.js / pdf-lib |
| Annotated PDF | ✅ Highlight, Underline and Text annotations with appearance streams; comment text read back by pdf.js |
| Workspace snapshot | ✅ SVG (escaped, tested); PNG rendered from the SVG in the browser |
| Project data in a documented format | ✅ JSON, see [EXPORT_FORMAT.md](EXPORT_FORMAT.md) |
| Names, pages and references in reports | ✅ |
| Warnings when relationships or annotations can't be kept | ✅ "Keeps / Doesn't keep" for each export; annotated PDF reports what it left out |
| Verified by reopening in supported viewers | 🟡 reopened programmatically (pdf.js, pdf-lib, the DOCX importer); not yet opened in Word or Acrobat by hand |

### 11. Persistence and security

| Requirement | Status |
| --- | --- |
| Create, rename, duplicate, archive, delete projects | ✅ Unit + E2E |
| Autosave of positions and content | ✅ |
| Recovery from interrupted sessions | ✅ E2E (offline edit, tab closed, reopened, restored) |
| Document and annotation version tracking | ✅ file revisions and workspace revisions (last 100) with restore |
| Secure uploads and downloads | ✅ content validation, 100 MB file limit, 10 MB workspace limit, `no-store` |
| Server-side authorisation; user and organisation isolation | ✅ Unit (every route as another user returns 404; organisation scope) + E2E |
| Safe rendering | ✅ all text rendered as text; Markdown sanitised; PDFs without scripting/XFA; SVG export escaped |
| Audit without document text | ✅ Unit |

### 12. Performance

| Requirement | Status |
| --- | --- |
| Pages rendered on demand | ✅ E2E: a 300-page PDF has fewer than 20 rendered canvases at page 250 |
| Virtualised lists and cards | ✅ E2E: 400 cards, fewer than 200 mounted |
| Debounced search, efficient saves | ✅ |
| Hundreds of cards | ✅ Unit: 600 cards and 599 connectors filtered, organised and serialised in under 1.5 s; E2E: 400 cards |
| Accurate processing and saving states | ✅ |

## Not built

- Sharing a project with other users; organisation admin.
- Drawing on document pages; pinch gestures.
- OCR languages other than English.
- Unicode fonts in converted copies (non-WinAnsi characters show as "?" and are reported).
- Images from DOCX in the converted copy.
- Production object storage, deployment and integration with other OctoGenie Legal systems (stage 7).
