# Project data export format (`octogenie-research-export`, version 1)

**Export → Project data (JSON)** downloads one UTF-8 JSON file. It contains
everything in a project's workspace but **not** the document files, which stay
in the user's OctoGenie files and are referenced by id and revision.

```jsonc
{
  "format": "octogenie-research-export",
  "version": 1,
  "exportedAt": "2026-10-27T17:40:00.000Z",           // ISO 8601
  "project": {
    "name": "Acme v Beta",
    "caseName": "Acme Holdings Ltd v Beta Corp",
    "reference": "CL-2026-000123",
    "court": "Commercial Court",
    "jurisdiction": "England and Wales",
    "description": "",
    "revision": 14                                      // workspace revision exported
  },
  "documents": [{
    "id": "a1b2c3d4e5f6",                               // project-local id (sources point here)
    "name": "Settlement Agreement.pdf",
    "short": "SA",                                      // citation label or null
    "format": "pdf",                                    // pdf | docx | txt | md
    "pageCount": 2,
    "textMode": "native",                               // native | ocr | converted | none
    "fileId": "…", "revision": 1,                       // the original upload (never modified)
    "viewFileId": "…", "viewRevision": 1                // the PDF the coordinates refer to (original, OCR copy or converted copy)
  }],
  "sources": [{
    "id": "…",
    "documentId": "a1b2c3d4e5f6",
    "viewFileId": "…", "viewRevision": 1,
    "page": 0,                                          // 0-based; citations show page + 1
    "rects": [[72, 646.5, 418.2, 662.1]],               // PDF user space [x1, y1, x2, y2], origin bottom-left, points
    "quote": "Payment of the settlement sum is due within thirty days of signing.",
    "start": 120, "end": 188,                           // offsets in the page's extracted text (optional)
    "status": "ok",                                     // ok | moved | broken (after the document was replaced)
    "note": "…",                                        // explanation when moved or broken (optional)
    "citation": "Settlement Agreement, p. 1"            // convenience copy, derived
  }],
  "cards": [{
    "id": "…", "type": "excerpt",                       // excerpt | note | group
    "x": 40, "y": 80, "w": 260, "h": 120,               // canvas units
    "color": "#ffffff", "tags": ["Key term"], "status": "key",
    "sourceId": "…",                                    // excerpt only
    "text": "…",                                        // excerpt: user's wording (may differ from the source quote); note: body
    "title": "…", "category": "issue",                  // group only: issue | argument | witness | document | evidence | other
    "createdAt": 1793000000000, "updatedAt": 1793000000000,
    "center": { "x": 170, "y": 140 }                    // convenience, derived
  }],
  "connectors": [{ "id": "…", "from": "cardId", "to": "cardId", "relation": "contradicts", "label": "Timing of payment" }],
  "annotations": [{
    "id": "…", "kind": "comment",                       // highlight | underline | comment
    "sourceId": "…", "color": "#7dd3fc", "note": "Check the signed copy",
    "tags": [], "status": "to-review", "createdAt": 0, "updatedAt": 0
  }],
  "tags": [{ "name": "Key term", "color": "#7c3aed" }],
  "ink": [{ "id": "…", "points": [[10, 20], [30, 40]], "color": "#111827", "width": 3 }],
  "view": { "x": 0, "y": 0, "zoom": 1 }
}
```

Rules for consumers:

- Group membership isn't stored. A card belongs to the smallest group whose
  rectangle contains the card's centre.
- `relation` is undirected for meaning ("supports / is supported by"). The
  `from`/`to` order is only drawing order.
- Review statuses are workflow labels chosen by the user, not legal findings.
- Timestamps are milliseconds since the Unix epoch.
