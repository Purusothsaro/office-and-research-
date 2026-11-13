# Feature and format matrix

Legend: ✅ implemented and tested · 🟡 partial (limits stated) · 🗓 planned (milestone) · ❌ not planned

This file only marks a feature ✅ when an automated test covers it.

## Home screen (milestone 1)

| Feature | Status | Notes |
| --- | --- | --- |
| Documents, spreadsheets, presentations, PDFs in one list | ✅ | Filter by type in the sidebar |
| New blank document / spreadsheet / presentation | ✅ | Real DOCX/XLSX/PPTX files generated in the browser (US Letter) |
| Template gallery | ✅ | 6 original legal templates (engagement letter, NDA, memo, time sheet, matter tracker, client briefing) |
| Recent files and search | ✅ | Sorted by last modified; search by name and format |
| Import / upload (button and drag-and-drop) | ✅ | Extension + magic-byte validation, 100 MB limit, ZIP structure check for OOXML |
| Rename, duplicate, download, delete | ✅ | Delete asks for confirmation |
| Type icons and metadata | ✅ | Format, size, modified time in the list; revision in the file view |
| Autosave status | ✅ | All editors share one autosave hook |
| Recovery of unsaved work | ✅ | Drafts in IndexedDB, Restore / Discard banner; recovered work is not committed until the user keeps it |
| Conflict detection | ✅ | Stale saves are rejected; user can save their version as a copy or discard it |
| Version history | ✅ | Every save is a revision; DOCX and PDF editors can restore or download any revision |
| Responsive layout | ✅ | Sidebar collapses under 768 px |
| Keyboard navigation | ✅ | Arrow keys, Enter, F2, Delete, `/` to search, `?` for shortcuts |
| Server storage, accounts | 🗓 M7 | Files are stored in the browser (IndexedDB) for now |

## Document editor (milestone 2)

| Feature | Status | Notes |
| --- | --- | --- |
| Ribbon: File, Home, Insert, Layout, References, Review, View | ✅ | Contextual **Table** and **Image/Shape** tabs appear on selection |
| Multi-page print layout | 🟡 | Real page sizes, margins, gaps, headers, footers and footnotes per page. Pages break **between** blocks: a paragraph or table is never split across pages, so a long block moves to the next page (or makes a page taller if it can't fit on one) |
| Margins, orientation, paper size (Letter, Legal, A4) | ✅ | Presets and custom margins |
| Page breaks | ✅ | Ctrl+Enter |
| Columns | 🟡 | 2–3 columns for selected paragraphs (a continuous section in DOCX); not page-level |
| Section settings | 🟡 | One page setup per document; DOCX files with several differently sized sections use the last one (with a warning) |
| Fonts, sizes, colour, highlight, bold/italic/underline/strike, super/subscript | ✅ | |
| Paragraph styles (Normal, Title, Subtitle, Heading 1–6, Quote) | ✅ | |
| Lists, indentation, alignment, line and paragraph spacing | ✅ | Nested bullets and numbering |
| Borders and shading | ✅ | Box, top or bottom border; background shading |
| Tables | ✅ | Insert, add/remove rows and columns, merge/split, header row, resize columns |
| Images | ✅ | PNG/JPEG/GIF/WebP up to 10 MB, embedded; width and alt text |
| Shapes | ✅ | Rectangle, rounded rectangle, ellipse, triangle, line, arrow; fill and outline |
| Hyperlinks | ✅ | https and mailto only; `javascript:` and other schemes are refused |
| Equations | ✅ | LaTeX with live preview (KaTeX); inline or display |
| Page numbering, headers and footers | ✅ | `{PAGE}` / `{PAGES}` fields; "Page X of Y" toggle |
| Footnotes | ✅ | Numbered automatically; shown at the bottom of their page |
| Table of contents | ✅ | Live, built from headings; entries jump to the heading |
| Navigation pane | ✅ | Heading outline |
| Find and replace | ✅ | Match case, next/previous, replace, replace all |
| Word count, undo/redo, keyboard shortcuts | ✅ | Shortcut list under View → Shortcuts |
| Print / save as PDF | 🟡 | Uses the browser's print dialog with CSS page size, margins and header/footer margin boxes. Footnotes print as a list at the end. Server-side PDF conversion is planned |
| Comments and track changes | 🗓 M8 | Imported comments/tracked changes are reported and removed (changes are accepted) |

## PDF editor (milestone 3, part 1)

| Feature | Status | Notes |
| --- | --- | --- |
| Rendering, page navigation, thumbnails, zoom | ✅ | pdf.js; pages render lazily as they scroll into view |
| Text search | ✅ | Across all pages, with next/previous |
| Text selection | ✅ | Selectable text layer |
| Highlights | ✅ | From selected text (keeps the quoted text) or by dragging an area |
| Comments (sticky notes) | ✅ | One comment per annotation for now |
| Freehand drawing | ✅ | Colour and pen width |
| Text boxes | ✅ | Helvetica; characters outside Latin-1 are replaced with "?" in the saved PDF's appearance |
| Move, resize, delete annotations; undo/redo | ✅ | Delete key, Ctrl+Z / Ctrl+Y |
| Rotate, reorder and delete pages | ✅ | Deleted pages are removed from the file, not hidden |
| Form filling | ✅ | Text, checkbox, radio, dropdown and list fields |
| Signatures | 🟡 | Drawn signature placed as an image stamp. **Not** a certificate-based digital signature; digital signature fields are shown but can't be signed |
| Download / export | ✅ | Annotations are standard PDF annotations with appearance streams, visible in Acrobat, Chrome and others, and editable again here |
| Print | 🟡 | Opens the saved PDF in the browser's PDF viewer to print |
| Editing existing PDF text | 🟡 | **Edit text** tool: change or delete any line. On save the original text-drawing operators are removed from the page content (not covered) and the new text is drawn in the closest standard font (Helvetica/Times/Courier, Latin-1 only). Text inside form XObjects can only be covered, and the editor warns that it may remain extractable. Edits are listed with Revert in the side panel |
| Encrypted / password-protected PDFs | 🟡 | Owner-password-only files open read-only; user-password files can't be opened |
| OCR | 🗓 M6 | Optional and local only (Tesseract.js), off by default |

## Spreadsheet editor (milestone 4)

| Feature | Status | Notes |
| --- | --- | --- |
| Grid, multiple sheets, selection, copy/paste, fill, resize, formatting, formula bar | ✅ | Univer open-source edition (Apache-2.0) |
| Formulas and references | ✅ | Univer formula engine; cached results written to XLSX |
| Sort, filter, freeze panes, data validation, conditional formatting, find/replace, links, notes | ✅ | Filters, validation, links and notes round-trip through XLSX |
| Charts | 🟡 | Bar, line and pie charts from a range, in a side panel. Kept in files saved here; not written into the XLSX for Excel yet |
| Conditional formatting in Excel | 🟡 | Kept in files saved here; not written for Excel yet. Excel rules aren't imported yet |
| XLSX import/export | ✅ | Values, formulas, styles, borders, number formats, merges, widths/heights, hidden rows/columns, freeze, tab colours |
| CSV import/export | ✅ | First sheet's values; formula-injection guard on export; Save as XLSX offered |
| Charts, pivots, images, macros from Excel | ❌ | Reported on open; macros are never run |

## Presentation editor (milestone 5)

| Feature | Status | Notes |
| --- | --- | --- |
| Thumbnails, navigation, reorder, duplicate, hide, delete slides | ✅ | |
| Layouts and themes | ✅ | 6 layouts, 4 original themes, slide backgrounds |
| Text, shapes, images, tables | ✅ | In-place rich text (bold, italic, underline, size, colour, alignment, bullets) |
| Move, resize, rotate, align, layer, group | ✅ | Snapping, nudge with arrow keys, undo/redo |
| Speaker notes, presentation mode | ✅ | Full screen, keyboard navigation, hidden slides skipped |
| PPTX import/export | 🟡 | Placeholders resolved from layouts/masters, theme colours, groups. Animations, transitions, charts, SmartArt, media and freeform shapes are reported and removed |
| PDF export | 🟡 | Print / save as PDF from the browser, one slide per page |

## Case workspace (LiquidText-style review)

| Feature | Status | Notes |
| --- | --- | --- |
| Several PDFs per workspace, in tabs | ✅ | Documents stay in your files; the workspace links to them |
| Excerpts: select text, then drag it onto the canvas or click “Add to workspace” | ✅ | Each excerpt keeps its page and exact position |
| Two-way links | ✅ | Citation on a card jumps to and flashes the passage; marked passages in the PDF jump to their card |
| Notes, issue groups (frames), colours, connections between items | ✅ | Moving a group moves its contents |
| Infinite canvas: pan, zoom (Ctrl+wheel), fit, undo/redo | ✅ | |
| Compare: two documents (or two places in one) side by side | ✅ | Substitute for LiquidText’s “pinch to collapse”; collapsing pages isn’t built |
| Search across all documents; add a result as an excerpt | ✅ | |
| Outline by issue with citations | ✅ | |
| Export to Word | ✅ | DOCX in your files: a heading per issue, quoted excerpts with “— Document, p. N”, notes |
| Ink on the canvas or documents, DOCX/other file types as sources | ❌ | PDFs only for now |
| Page:line citations for transcripts | ❌ | Citations use page numbers |

## Other

| Area | Status |
| --- | --- |
| Rich Markdown and RTF editing | ✅ Both open in the document editor and save back in their own format, with a notice and Save as DOCX |
| Collaboration (presence, co-editing, comments, review) | 🗓 M8 |

## Format compatibility

| Format | Module | Open | Edit | Save as same format | Export | Known loss |
| --- | --- | --- | --- | --- | --- | --- |
| DOCX | Document | ✅ | ✅ | ✅ (every save is a new revision) | PDF via print 🟡 | Text boxes, SmartArt, charts, embedded objects, EMF/WMF/TIFF images, comments, tracked changes (accepted), fields (kept as text), different first-page/odd-even headers, per-section page sizes. All reported on open |
| TXT | Document | ✅ | ✅ (plain editor) | ✅ | 🗓 | None |
| Markdown | Document | ✅ | ✅ rich | ✅ | DOCX ✅ | Colours, fonts, alignment, page setup, headers/footers; raw HTML is sanitised |
| RTF | Document | ✅ | ✅ rich | ✅ | DOCX ✅ | Shapes, columns, footnotes on import, WMF/EMF pictures; equations as text |
| XLSX | Spreadsheet | ✅ | ✅ | ✅ | CSV ✅ | Excel charts, pivots, images, macros, conditional formatting (reported) |
| CSV | Spreadsheet | ✅ | ✅ grid | ✅ | XLSX ✅ | Only the first sheet's values are saved |
| PPTX | Presentation | ✅ | ✅ | ✅ | PDF via print 🟡 | Animations, transitions, charts, SmartArt, media (reported) |
| PDF | PDF | ✅ | Text edits, annotations, forms, pages ✅ | ✅ | ✅ | Edited text uses standard fonts. PDF scripts are never run |

### How lossless round trips work

DOCX files saved by this editor embed the editor's own document (`octo/document.json`) with
a hash of `word/document.xml`. Reopening uses it, so nothing is lost for files saved here.
If another program changes the document, the hash no longer matches and the editor
imports the Word XML instead, reporting anything it can't represent.

PDF annotations saved here carry their editable source in a private `/OctoData` key on
each annotation, so they reopen as editable annotations. Other programs ignore the key
and show the standard annotation.

Originals are never overwritten: every save creates a new revision, and any revision can
be downloaded or restored.
