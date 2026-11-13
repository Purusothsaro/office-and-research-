# Setup

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 22.19+ (24 LTS also works) | Everything |
| npm | 10+ | Workspaces |
| MongoDB | 7 or 8 (tested with 8.2) | All application data |
| Google Chrome | current | End-to-end tests (`channel: "chrome"`) |

On this machine MongoDB 8.2 runs as the Windows service `MongoDB` on
`127.0.0.1:27017`. The app uses its own database, `octogenie_office`, and never
touches other databases on the server.

## Install

```bash
npm install
```

## Run in development

```bash
npm run dev          # starts the API (:3030, MongoDB) and the web app (http://localhost:1570) together
```

`npm run dev:server` and `npm run dev:web` start either one on its own. If the
sign-in page says it can't reach the server, the API isn't running.

Open http://localhost:1570, create an account and sign in. If the browser still
holds files from before server storage existed, a banner offers to import them
into your account.

## Run as one process

```bash
npm start            # builds the web app, then serves app + API on :3030
```

## Configuration

Settings come from environment variables; see `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | MongoDB connection string |
| `MONGODB_DB` | `octogenie_office` | Database name |
| `PORT` / `HOST` | `3030` / `127.0.0.1` | Listen address |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `SESSION_TTL_DAYS` | `14` | Session lifetime |
| `AUTH_RATE_LIMIT` | `10` | Sign-in attempts per IP per minute |

## What is stored in MongoDB

| Collection | Contents |
| --- | --- |
| `users` | Email, name, scrypt password hash |
| `sessions` | SHA-256 of each session token, expiry (TTL index removes expired sessions) |
| `files` | File metadata: owner, name, format, size, current revision |
| `revisions` | One record per saved version, pointing to its content in GridFS |
| `drafts` | Unsaved work for crash recovery, pointing to GridFS |
| `blobs.files` / `blobs.chunks` | GridFS: the bytes of every revision and draft |
| `audit` | Security events (sign-ins, uploads, saves, downloads, deletes). Never document contents or file names |

## Tests

```bash
npm test             # unit + integration; server tests use a throwaway database octogenie_office_test_* that is dropped afterwards
npm run test:e2e     # builds, starts the real server on :4173 with database octogenie_office_e2e (reset each run), runs Chrome
```

## Backups

Back up the `octogenie_office` database with `mongodump --db octogenie_office`
(files, revisions and GridFS contents together). Restore with `mongorestore`.

## REA (investigation tooling, optional)

REA is registered for Claude Code and Cursor on this machine, with Ghidra
12.1.4 and Temurin JDK 21 under `C:\tools`. REA is not a dependency of this app.
