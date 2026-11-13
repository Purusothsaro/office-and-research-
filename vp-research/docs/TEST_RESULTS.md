# OctoGenie Research: test results

Run on 27 October 2026 on Windows 11, Node 22.19, MongoDB 8.2 (local) and Chrome (Playwright `channel: "chrome"`).

| Check | Command | Result |
| --- | --- | --- |
| Type check (whole monorepo) | `npm run typecheck` | ✅ no errors |
| Lint (research app and package, server, research E2E) | `npm run lint` | ✅ no findings |
| Unit and integration tests (whole monorepo) | `npm test` | ✅ **163 passed** (16 files), 38 of them in `packages/research` |
| End-to-end tests (whole monorepo) | `npm run test:e2e` | ✅ **33 tests**: 4 core-workflow, 8 research, 21 Office. See [the latest run](#latest-end-to-end-run) |

## Core reading workflow (`e2e/core-workflow.spec.ts`)

Each step of the workflow is asserted in a real browser against the real
server. A step counts as done only when its test passes.

| # | Workflow step / requirement | How it is proven | Status |
| --- | --- | --- | --- |
| 1 | Open a PDF and read it | Two PDFs are imported; document tabs switch between them; the page number input jumps to page 2 | ✅ |
| 2 | Select a sentence or paragraph | Mouse selection over the text layer. Selection handles ("Selection start"/"Selection end") appear. A two-line answer is selected across lines | ✅ |
| 3 | Create an excerpt | "Add excerpt" button and drag-and-drop onto the workspace. Card text equals the selected text **exactly**, e.g. “A. I never received any notice from the landlord before the hearing on 3 May.” | ✅ |
| — | Excerpt points to the correct page | Card citation "Deposition of J. Roe, p. 2". The saved source has `documentId`, `viewFileId`, `viewRevision`, `sourceRevision`, `page: 1` (0-based), exact `quote`, `start`/`end` offsets, two line rectangles, and `owner: { kind: "excerpt", id }` | ✅ |
| 4 | Move an excerpt beside another | Dragged by a measured offset; the **saved** position (read back from the server) equals the old position plus offset ÷ zoom (within 3 units) | ✅ |
| 5 | Add a note explaining the relationship | Note created and typed | ✅ |
| 6 | Connect the excerpts visually | "Contradicts" between the excerpts, "References" from the note; 2 connectors | ✅ |
| — | Connectors stay attached when either object moves or is resized | After moving the first excerpt, moving the note and resizing the second excerpt, every connector end lies on the edge of a card | ✅ |
| 7 | Select an excerpt and return to its source | "Open source" switches to the right document tab, shows page 2 and flashes exactly the two line rectangles of the passage | ✅ |
| — | From the source back to the workspace | Clicking the excerpt's mark in the document selects its card, and the mark shows as active | ✅ |
| 8 | Reload and recover the same workspace | After reload: the same cards at the same positions, 2 connectors, the same workspace zoom, the same active document tab and page (2), the note text | ✅ |
| — | Multiple documents contribute to one workspace | Excerpts from both PDFs in one workspace | ✅ |
| — | Search results go to the correct source | A phrase only on page 2 of the deposition: the result opens that document at page 2, flashes the match and marks the hit | ✅ |
| — | Canvas coordinates correct at other zoom levels | At 69 % zoom, a dropped excerpt is centred on the drop point (within 4 px) | ✅ |
| — | Invalid anchors handled safely | The stored quote is made invalid on the server. "Open source" highlights **nothing** and explains why; the card shows "Not found in the current version · Fix link". Fix link → select the passage → "Use as new source" re-links it, after which the source flashes again | ✅ |
| — | One tap shows relationships and original context | Tapping an excerpt opens its document at the right page and flashes the passage; tapping a note outlines its connected cards in the relationship colours; the Connections panel lists "Supports" and "Contradicts" links whose source links open the right passage; Gather lines the connected cards up beside the note with connectors still attached; Undo restores them | ✅ |
| — | Document ↔ workspace links | A selection dropped on a note creates a passage link (no new card) and a line is drawn between them; Connect mode links a note to a highlighted passage; the note's panel lists both linked passages and opens them; scrolling the passage away shows a "p. 1" stub | ✅ |
| — | Bring together | Clicking page 1 and page 6 collapses pages 2–5 into one bar; clicking the bar restores all 6 pages | ✅ |
| — | Results together with context | "See all results together" shows the 2 matches from the contract as page strips; + and Ctrl+scroll change the context; a strip opens page 6 and flashes the match | ✅ |
| — | Screenshot parity (toolbar, tools, card actions, workspaces, rails, layout) | Pen and highlighter draw on page 1 and the eraser removes a stroke; the lasso turns a box around a sentence into an excerpt with an image; the margin bar selects that card; Comment, text size, Copy, Copy Link and To Child Workspace each work; the copied link reopens the card in its child workspace after reload, with the page ink still there; Cut plus Undo; the workspace rail adds a text box; reader bookmarks and thumbnails; Back returns to the previous page; the divider handle shows one side or both | ✅ |
| — | Merging excerpts | Dragging one excerpt over another marks it "Release to merge"; on release they join edge to edge, move together, each opens its own source, stay merged after reload, and come apart with Separate or Alt+drag | ✅ |
| — | Unavailable sources handled safely | The source file is deleted. After reload the card says "Source unavailable", "Open source" explains the file is unavailable, and the captured text is kept | ✅ |

Unit tests behind these (`packages/research/src/*.test.ts`):

- Anchoring tolerates selections that drop spaces between text runs.
- Anchors are validated on their own page only and never redirected to another page.
- Owner ids and source revision are recorded.
- Re-linking keeps ids.
- Autosave can't be postponed by a stream of edits.
- Source re-mapping after a document is replaced (ok, moved, broken).

## Other research tests (`e2e/research.spec.ts`)

These cover:

- annotations (highlight, comment, annotation list);
- tags and groups;
- undo/redo;
- exports (DOCX, PDF, annotated PDF, SVG, JSON), each reopened;
- project management and privacy;
- offline recovery after a closed tab;
- re-linking after a document is replaced;
- in-browser OCR;
- a 300-page document and 400 cards;
- tablet and phone layouts.

## Bugs found and fixed by these tests

| Bug | Fix |
| --- | --- |
| Autosave could be postponed indefinitely: every change restarted the 1 s timer, so steady updates (such as the reading position while scrolling) kept pushing the save back | The save now happens at most 1 s after the first unsaved change (unit-tested) |
| The test helper treated "Unsaved changes" as "Saved" (substring match) | The status is matched exactly |
| Excerpt and highlight marks caught the pointer, so text under an existing excerpt couldn't be selected again | Marks no longer catch the pointer; clicks and hover are hit-tested on the page, and selection takes priority |
| Scrolling the reader closed the selection toolbar, so dragging a selection after scrolling did nothing | The toolbar moves with the content and stays open |
| A deleted source file wasn't noticed, because its text index was cached on the device | File presence is checked when a project opens and whenever files change |

## Latest end-to-end run

- Full suite: 32 of 33 passed in one run. The failure was the Office word-processor test `document.spec.ts` › "edits, paginates…", which timed out after 5 s waiting for the editor to appear while the machine was under load.
- That spec was re-run on its own twice: 8 of 8 passed. It's a timing flake in existing Office code, not a regression.
- In the run before that, every test passed except one research test that expected the old behaviour (the agreement open after reload). That test was updated for the restored reading position and passes.

## Known gaps in automated coverage

- Touch gestures (two-finger pinch zoom on the workspace, dragging selection
  handles with a finger) are implemented with pointer events. Only the mouse is
  automated; touch hasn't been tested on a device.
- Not covered by automated tests:
  - viewer rotation;
  - the Compare dialog;
  - context menus;
  - marquee selection;
  - the PNG snapshot.

## Differences from the reference (LiquidText)

Based on the public behaviour recorded in
[liquidtext-interaction-study.md](liquidtext-interaction-study.md).

| LiquidText (public description) | OctoGenie Research today |
| --- | --- |
| Native iPad, Windows and Mac apps with touch, pen and multi-monitor | A web app (desktop and tablet browsers). Pen input works as a pointer; no pen-specific features or multi-window layout |
| "Pinch" to bring distant parts of a document together; pinch search and highlights "with variable context" | "Collapse page" bars and two documents side by side. No pinch gesture on documents, because its mechanics aren't publicly documented. Search shows fixed-length snippets |
| Ink lines drawn between document contents, notes "or anything" | Typed connectors between workspace objects; pen strokes on the workspace. No ink links drawn directly from a document passage |
| Multiple infinite workspaces per project | One workspace per project |
| Notes as a list and/or mind maps | Spatial workspace plus a generated outline (summary preview and exports) |
| Real-time collaboration with a shared live workspace | Live sync between the same user's devices and tabs; no sharing between users |
| Writing anywhere on documents | Highlights, underlines and comments on documents; no freehand ink on pages |
| Text-based links across projects and apps | Not built |
| Export of notes and projects (PDF, DOCX and others) | Summary (DOCX/PDF), annotated PDF, SVG/PNG snapshot, JSON |

Selection handles, typed relationships (supports, contradicts and so on),
anchor validation with re-linking, and review statuses are OctoGenie
additions. They aren't claimed to be LiquidText behaviour.
