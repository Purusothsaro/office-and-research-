# Setup

## Prerequisites

- Node.js 22.19 or newer and npm.
- MongoDB 7 or newer, running on `mongodb://127.0.0.1:27017` (or set `MONGODB_URI`).
- Google Chrome, for the end-to-end tests.

## Install and run

```bash
npm install
npm run dev
```

- Web app: http://localhost:1580 (Vite; forwards `/api` to the server).
- API server: http://127.0.0.1:3040, database `octogenie_research`.

Create an account on the sign-in page. Accounts are separate from OctoGenie Office.

## Run as one process

```bash
npm start   # builds apps/web/dist and serves it with the API on PORT (default 3040)
```

## Configuration

Copy `.env.example` and set the values in your environment: `MONGODB_URI`,
`MONGODB_DB`, `PORT`, `HOST`, `COOKIE_SECURE` (true behind HTTPS),
`SESSION_TTL_DAYS`, `AUTH_RATE_LIMIT`, `STATIC_DIR` and `LOG`.

## What is stored in MongoDB

| Collection | Contents |
| --- | --- |
| `users` | Email, name, scrypt password hash, organisation |
| `sessions` | SHA-256 of each session token, expiry (TTL index) |
| `files` / `revisions` | Imported documents and their versions; generated copies (converted, OCR) are linked to their original with `derivedFrom` |
| `projects` / `project_revisions` | Case details and every saved workspace version (last 100) |
| `blobs.files` / `blobs.chunks` | GridFS: file and workspace contents |
| `audit` | Security events, without names or document text |

Back up with `mongodump --db octogenie_research` and restore with `mongorestore`.

## Tests

```bash
npm test           # unit + integration
npm run test:e2e   # builds, starts the server on :4175 with database octogenie_research_e2e (reset each run), runs Chrome
```
