# LiquidText interaction study

**Purpose:** to decide which interaction model OctoGenie Research should
implement, based only on what is publicly observable. OctoGenie Research is
original code and design. Nothing from LiquidText (code, assets, branding,
text or screenshots) is copied or stored in this repository.

**Date:** 27 October 2026.

## 1. Method and limits

| Source | Used? | Notes |
| --- | --- | --- |
| liquidtext.net home page | Yes, read | Mostly marketing copy; a few explicit feature statements. |
| liquidtext.net/liquidtextadeeperdive | Yes, read | The most concrete public description of features. |
| liquidtext.net/videos | Yes, read (titles and descriptions only) | The page lists demo and tutorial videos but gives no step-by-step text. **I could not watch the videos**, so nothing below relies on their content. |
| The LiquidText application | **No** | There is no authorised access (licence or permission to inspect it). It was not installed, run, decompiled, traced or intercepted. |
| REA | Configured, **not** used against LiquidText | `rea doctor` reports the Cursor registration (`~/.cursor/mcp.json` → `npx -y rea-agents@6.7.0 mcp`) as `aligned`. REA can analyse web bundles and binaries, but analysing LiquidText's software needs authorisation we don't have. It was not used to capture their site either, because their terms don't clearly permit storing captures. |
| Screenshots | None stored | Not clearly permitted by the site's terms. |

Confidence scale: **High** means the behaviour is explicitly stated on a
public page. **Medium** means it is strongly implied by explicit wording.
**Low** means it is our assumption or interpretation, not verified.

## 2. Observations

### Document and workspace layout

| Observation | Evidence | Confidence |
| --- | --- | --- |
| A project holds several documents in a "document pane" | Deeper dive: the document pane "imports and contains all relevant documents" | High |
| A project has a workspace (in fact "multiple infinite workspaces") for notes and excerpts | Deeper dive: "multiple infinite workspaces" | High |
| Document and workspace are shown together, side by side | Implied by excerpts being dropped "on the workspace" while reading; not stated | Medium |
| Runs on iPad, Windows and Mac, with touch, pen, mouse and trackpad, and multi-monitor | Home page | High |

### Selecting text and extracting passages

| Observation | Evidence | Confidence |
| --- | --- | --- |
| Users excerpt passages from documents | "Excerpt anything with ease" | High |
| Excerpts are created by selecting text and dragging it onto the workspace | Deeper dive mentions users "dropping them on the workspace". The exact gesture (finger, pencil, mouse, a button) isn't described | Medium |
| A selection-handle UI exists | Not described anywhere public | Low (assumption) |

### Moving excerpts and working on the workspace

| Observation | Evidence | Confidence |
| --- | --- | --- |
| Excerpts and notes are placed and arranged freely | "organize the workspace as they prefer"; notes "written, typed and/or placed on the workspace" | High |
| Groups of excerpts exist | Video title "the workspace and working with groups of excerpts" | Medium (title only) |
| Pan, zoom, multi-select gestures | Not described | Low |

### Connecting passages

| Observation | Evidence | Confidence |
| --- | --- | --- |
| Lines can be drawn between document contents, notes "or anything in the app" | Deeper dive, explicit | High |
| Connections can be viewed as maps | "View maps of connections" | High |
| Distant parts of documents can be linked "for simultaneous viewing" | Deeper dive | High |
| Links are drawn with ink ("inklinks") | Video title "inking and inklinks" | Medium (title only) |

### Navigating between excerpts and sources

| Observation | Evidence | Confidence |
| --- | --- | --- |
| The source of an excerpt is "never more than a single click away" | Deeper dive, explicit | High |
| Connections are called out "at a touch" | "visual hyperlinks which call out the connections at a touch" | High |
| Navigation from a document highlight back to its workspace excerpt | Not stated; implied by bidirectional "visual hyperlinks" | Medium |

### Pinch, collapse and search

| Observation | Evidence | Confidence |
| --- | --- | --- |
| A pinch gesture brings distant content together ("Just pinch and it comes together") | Home page | High that it exists; the exact mechanics are Low |
| Search and highlights can be "pinched" with variable context | Deeper dive | High that it exists; mechanics Low |
| Search across documents | Not explicitly stated ("Search in Depth" is a video title) | Medium |

### Export, sync and collaboration

| Observation | Evidence | Confidence |
| --- | --- | --- |
| Export of notes to PDF and DOCX | Home page, explicit | High |
| Real-time sync and collaboration (subscription) | Home and deeper dive, explicit | High |

## 3. Interaction model chosen for OctoGenie (original implementation)

Only High and Medium confidence behaviours drive the design. Where public
information is silent, we use conventional desktop interactions and don't
imitate any undocumented gesture.

| Workflow | OctoGenie implementation | Basis |
| --- | --- | --- |
| Layout | Full-height reader (continuous scroll) beside an infinite workspace; document tabs above the reader; a collapsible panel for documents, search and annotations | High (document pane + workspace); side by side Medium |
| Extract | Select text (native selection, with draggable start/end handles), then **drag the selection onto the workspace** or click "Add excerpt" | Drag: Medium. Button and handles: our own conventional additions, not claimed as LiquidText behaviour |
| Excerpt card | Shows the captured text, citation (document, page), and an "edited" marker if the user rewrites it; the source is stored separately | High (excerpts linked to source) |
| Source navigation | One click on the card's citation opens the document and page and flashes the exact passage; one click on the passage mark in the document brings the card into view | High (one click / "at a touch") |
| Connect | Connectors between cards, with relationship types and labels; they stay attached to card edges | High (draw lines between anything). Typed relationships are our addition |
| Bring distant passages together | "Collapse page(s)" bars and side-by-side documents. **We do not implement a pinch gesture on documents**: its mechanics aren't publicly documented | Low, so not imitated |
| Gather and organize: one tap shows relationships and original context | One tap on an excerpt opens its source passage; one tap on any card highlights its connections; a Connections panel lists them with source links; "Gather connected cards here" brings them together | High (the public page says "a single tap can show those relationships and original context"). The panel and Gather are our own design |
| Connect across pages and documents ("Just pinch and it comes together") | "Bring together" (click two places, or two-finger pinch on touch) collapses the pages between them; collapsed bars reopen on click or a spread gesture | High that pinch exists; the exact LiquidText gesture isn't public, so the click mode and pinch thresholds are our own |
| Document and workspace connected | Passage links drawn as lines across the reader and workspace; created by dropping a passage on a card or with Connect | High ("draw lines between document contents, notes, or anything"). Drawing with a pen stroke across panes isn't replicated; links are made by drag or click |
| Search without losing context ("see the context of each … with just a pinch") | Together view of search results or marks from all documents with adjustable context (pinch, Ctrl+scroll, − / +) | High that it exists; presentation is our own |
| Merging excerpts | Dropping an excerpt or note onto another joins them into one stack that moves as a unit; each part keeps its own source link. Alt+drag or "Separate" pulls them apart | User report: in LiquidText, moving two excerpts together merges them. Not described on the public pages, so the exact behaviour (e.g. how they are pulled apart) is our own design |
| Workspace manipulation | Drag the background to pan, Ctrl/⌘+scroll or a two-finger pinch on touch to zoom, Shift+drag for a selection box, Shift+click to multi-select, group frames, undo/redo | Our conventional choices (public sources are silent) |
| Search | Search all documents with page results; activating a result opens and highlights the source | Medium |
| Export | DOCX and PDF summaries, annotated PDF, JSON | High (PDF/DOCX) |

## 3a. From the user's LiquidText screenshot (28 October 2026)

The user shared a screenshot of LiquidText (version 2.7.137 on Windows)
showing a document with a workspace. Only what is visible in it was used. The
app was not installed, decompiled or automated by us, because LiquidText's
terms forbid reverse engineering and automated access.

| Visible in the screenshot | OctoGenie implementation (own design and icons) |
| --- | --- |
| Top bar: home, back/forward, undo/redo, tool modes (text, pen, highlighter, eraser, lasso), Share, search, help, more | Project toolbar with the same functions |
| Bar for the selected workspace item: Comment, Edit, Copy, Cut, Copy Link, To Child Workspace, Delete, Tags, colour swatches, text size | Card action bar with the same actions (a slim strip at the top of the workspace) |
| Rail on the left edge of the document (outline, text/annotations, thumbnails, add document, bookmark) with a collapse arrow | Reader rail |
| Rail on the right of the workspace (add text, zoom out, add) with a collapse arrow | Workspace rail |
| Excerpted text shaded in the document with bars in the right margin | Excerpt marks plus margin bars |
| Two excerpts joined by curved "liquid" connectors, the selected one filled with colour | Merged stacks drawn with liquid joints; colours fill the card |
| "P 1" page label; round ◀▶ handle on the divider | Page tags; divider handle that collapses either side |

## 4. Hypotheses we did not adopt

- That the workspace and documents share one continuous zoomable surface.
  It isn't evidenced, so they stay separate panes.
- That ink strokes can connect a document passage directly to a workspace
  object across panes. LiquidText's "draw lines between document contents,
  notes, or anything" suggests this, but the mechanics aren't documented.
  We connect workspace objects; document ↔ workspace links are implicit
  through the excerpt's source anchor.
- Specific gestures for pinch-collapse and pinch-search.
- Comments attached to several passages at once.

## 5. Remaining differences from the reference

See "Differences from the reference" in
[research/TEST_RESULTS.md](TEST_RESULTS.md).
