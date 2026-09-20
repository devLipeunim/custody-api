# Custody API

Chain of custody service for digital evidence. Fingerprints evidence at the point of
collection, records every transfer in an append only log, and proves whether a file or its
handling record has changed since.

Built for ICSC 2026 Universities Hackathon, Track H, by Team Captain.

- **Dashboard:** [`hackathonWebApp`](../hackathonWebApp) (Next.js)
- **Field app:** [`hackathonMobile`](../hackathonMobile) (React Native, Expo)

---

## Contents

- [Overview](#overview)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Data and privacy](#data-and-privacy)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

---

## Overview

The service answers two questions independently, because they fail for different reasons:

| Question | Mechanism |
| --- | --- |
| Has the file changed? | SHA-256 Merkle root over 4MB chunks, recomputed from disk and compared |
| Has the handling record been edited? | Per item hash chain, recomputed from each event's own fields |

**Chunked hashing.** Files are read in 4MB chunks and a binary Merkle tree is built over the
ordered chunk hashes, with unpaired nodes promoted unchanged. Memory use is constant
regardless of file size, and a change is localised to a chunk and therefore a byte range.

**Append only.** `custody_events` rejects `UPDATE` and `DELETE` at the database level via
trigger. Corrections are appended as events referencing the erroneous one.

**Case level chain.** One event per item creation, referencing the item by text rather than by
foreign key, so deleting an item leaves a detectable gap.

**No file uploads.** Devices send the root hash, ordered chunk hashes and metadata. Evidence
files reach the store separately and are recorded with `POST /api/items/:id/deposit`.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 20+ (ESM) |
| HTTP | Express 5 |
| Database | PostgreSQL 16 via `pg` |
| Hashing | SHA-256, Node `crypto` |
| PDF | `pdfkit` (no browser dependency) |

---

## Prerequisites

- Node.js 20 or later
- PostgreSQL 16, running locally

```bash
# macOS
brew install postgresql@16 && brew services start postgresql@16

# Debian / Ubuntu / WSL
sudo apt update && sudo apt install postgresql postgresql-contrib
sudo service postgresql start
```

---

## Getting started

```bash
# 1. Create the database and its owner.
#    The custody user must OWN the database, or CREATE TRIGGER will fail.
psql -h localhost -d postgres <<'SQL'
CREATE USER custody WITH PASSWORD 'custody' CREATEDB;
CREATE DATABASE custody OWNER custody;
SQL

# 2. Install and seed.
npm install
cp .env.example .env
npm run demo:reset

# 3. Run.
npm run dev
```

The server prints two addresses on start. The second is this machine's LAN address and is what
the field app needs; `localhost` on a handset resolves to the handset.

Verify the installation:

```bash
npm run test:acceptance     # expect 23 passed, 0 failed
```

---

## Configuration

Copy `.env.example` to `.env`. All variables are optional and fall back to the defaults below.

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://custody:custody@localhost:5432/custody` | Connection string. TLS is enabled automatically for non local hosts. |
| `PORT` | `4000` | HTTP port. The server binds `0.0.0.0`. |
| `EVIDENCE_ROOT` | `./testdata` | Root for resolving each item's `storage_path`. |

Credentials are `custody/custody` by design: a local, disposable database holding only
synthetic data.

---

## API reference

Items and cases accept either a UUID or a human reference, so `/api/items/EX-2026-0007/verify`
resolves.

### Cases

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/cases` | List cases with an integrity summary as at last verification |
| `POST` | `/api/cases` | Create a case |
| `GET` | `/api/cases/:id` | Case detail with items |
| `GET` | `/api/cases/:id/verify` | Verify the case chain; detects a deleted item |

### Items

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/items` | Seal an item from metadata; opens its custody chain |
| `GET` | `/api/items/:id` | Item detail |
| `POST` | `/api/items/:id/deposit` | Record the exhibit reaching the evidence store |
| `GET` | `/api/items/:id/chain` | Custody trail, with any break located |
| `GET` | `/api/items/:id/verify` | Recompute the fingerprint and the chain |
| `GET` | `/api/items/:id/chunks` | Per chunk status, for the chunk map |
| `GET` | `/api/items/:id/report` | One page PDF. `?download=1` for an attachment |

### Custody and actors

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/custody/events` | Append a single custody event |
| `POST` | `/api/custody/sync` | Batch upload a field device's queue, in one transaction |
| `GET` `POST` | `/api/actors` | List or create officers |
| `GET` | `/api/health` | Liveness |

### Integrity states

`GET /api/items/:id/verify` returns one of:

| `fileIntegrity` | Meaning |
| --- | --- |
| `intact` | The stored file matches the fingerprint taken at collection |
| `altered` | It does not. `alteredChunks` and `alteredByteRange` locate the change |
| `awaiting_file` | Sealed in the field; the exhibit has not been deposited yet |
| `missing` | The exhibit was in the store and is no longer there |

### Trust model

The server stamps its own `server_time` and recomputes every `event_hash` rather than
accepting the client's. A supplied hash that disagrees, or a root hash inconsistent with its
own chunk hashes, rejects the batch with `409`. Field devices therefore send no event hashes:
they cannot know the server's identifiers before the item exists.

---

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start with `--watch` |
| `npm start` | Start |
| `npm run demo:reset` | Restore a known clean state: schema, seed, fixtures |
| `npm run schema` / `npm run seed` | The two halves of the above |
| `npm test` | Parity, API, sync and mobile suites |
| `npm run test:web` | Dashboard suite (needs the dashboard running) |
| `npm run test:acceptance` | Full end to end run |
| `npm run deck` / `npm run deck:pptx` | Build the presentation deck, PDF and PowerPoint |
| `npm run writeup` | Build the technical write-up PDF |
| `npm run deploy:setup` | One time setup for a hosted deployment |

---

## Testing

240 assertions across six suites. `npm test` needs the API running; `test:web` needs the
dashboard too. Start from `npm run demo:reset`.

| Suite | Assertions | Covers |
| --- | --- | --- |
| `device-parity` | 13 | Device and server hashing, byte for byte |
| `api` | 104 | Every endpoint, response contracts, error paths |
| `sync` | 14 | Offline collection and deferred sync |
| `mobile` | 33 | The field app's own payload builder against the live API |
| `web` | 53 | Rendered dashboard HTML and the client bundle |
| `acceptance` | 23 | The full demonstration, end to end |

`device-parity` is the one to fix first if it fails: it asserts that the field app and the
server produce identical fingerprints. If they diverge, nothing verifies.

See [TESTING.md](TESTING.md) for the full guide and [DEMO.md](DEMO.md) for the demonstration
script.

---

## Deployment

`render.yaml` provisions a web service and a PostgreSQL instance. After the first deploy:

```bash
npm run deploy:setup    # generates the large file, loads the schema, seeds
```

The evidence pack is vendored at `testdata/`, so a deployed instance can verify without
depending on anything outside its checkout. Render's filesystem is ephemeral: re-run
`deploy:setup` after a redeploy. The chain itself lives in PostgreSQL and survives.

Demonstrations should run against a local database. Showing offline first architecture against
a hosted one is a contradiction.

---

## Project structure

```
src/
  hash.js          chunked hashing, Merkle tree
  chain.js         event hashing, chain verification
  custody.js       sealing, appending, depositing, batch sync
  verify.js        recompute, compare, localise
  report.js        one page PDF and appendix
  plain.js         plain language formatting
  db.js            pg Pool
  server.js        Express app
  routes/          cases, items, custody, actors
scripts/           seeder, demo reset, deploy setup, deck builders
test/              six suites
testdata/          synthetic evidence pack and fixtures
schema.sql         DDL and the append only trigger
```

---

## Data and privacy

**All data in this repository is synthetic and was generated by the team.** There are no real
persons, cases, accounts, student records, transactions or personal data of any kind. Names,
badge numbers and account numbers are invented.

`testdata/evidence/case-c/handset-extraction.bin` is 30MB of random bytes standing in for a
phone extraction. It is not a real extraction and does not need to be: the system fingerprints
bytes and never interprets contents. It is generated on demand and is not committed.

---

## Limitations

- **Corrupt collector.** Tampering before sealing produces a valid chain over already altered
  evidence. The chain is protected from collection onward, not before it.
- **Device clock.** Offline timestamps come from the device. Both clocks are recorded and
  shown, but the device time is not independently verifiable.
- **Scale.** Tested at 30MB and extrapolated. Memory use is constant regardless of size, which
  is measured; a full extraction was never hashed.
- **Per officer signing.** Events are attributable to a login, not cryptographically to a
  person. Not implemented.
- **Storage.** Change is proven; deletion of the underlying file is not prevented.
- **Bulk compromise.** Full database and server access would allow a consistent rebuild of the
  chain. Publishing periodic root hashes externally is the mitigation. Not implemented.

---

## Troubleshooting

| Symptom | Cause | Resolution |
| --- | --- | --- |
| `psql: peer authentication failed` | Unix socket auth | Add `-h localhost`, or set `local` to `md5` in `pg_hba.conf` |
| `permission denied` on `CREATE TRIGGER` | `custody` does not own the database | Recreate with `OWNER custody` |
| `connection refused` on 5432 | PostgreSQL not started | `brew services start postgresql@16`, or `sudo service postgresql start` |
| `verify` returns `missing` | File not at `storage_path` | `npm run demo:reset` |
| `verify` returns `awaiting_file` | Exhibit not deposited | Expected; call `POST /api/items/:id/deposit` |
| Field app cannot reach the API | Wrong host, or different networks | Use the LAN address printed at startup, not `localhost` |
