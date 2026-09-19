-- Custody: chain of custody for digital evidence.
-- ICSC 2026 Universities Hackathon, Track H.
--
-- Loading this file DROPS and recreates everything. It is the reset path for
-- the demo, so it is deliberately destructive and deliberately idempotent.

DROP TRIGGER IF EXISTS no_update ON custody_events;
DROP TABLE IF EXISTS verifications CASCADE;
DROP TABLE IF EXISTS custody_events CASCADE;
DROP TABLE IF EXISTS case_events CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS actors CASCADE;
DROP TABLE IF EXISTS cases CASCADE;
DROP FUNCTION IF EXISTS block_mutation();

CREATE TABLE cases (
  id            UUID PRIMARY KEY,
  reference     TEXT UNIQUE NOT NULL,      -- e.g. 'UI-DISC-2026-014'
  title         TEXT NOT NULL,
  forum         TEXT NOT NULL,             -- disciplinary_panel | fraud_investigation | criminal
  opened_at     TIMESTAMPTZ NOT NULL,
  chain_head    TEXT                       -- hash of latest case level event
);

CREATE TABLE actors (
  id            UUID PRIMARY KEY,
  full_name     TEXT NOT NULL,
  rank_title    TEXT,
  badge_no      TEXT UNIQUE NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE items (
  id                 UUID PRIMARY KEY,
  case_id            UUID NOT NULL REFERENCES cases(id),
  reference          TEXT UNIQUE NOT NULL,  -- e.g. 'EX-2026-0041'
  description        TEXT NOT NULL,
  file_name          TEXT NOT NULL,
  file_size_bytes    BIGINT NOT NULL,
  mime_type          TEXT,
  root_hash          TEXT NOT NULL,         -- Merkle root at collection
  chunk_size_bytes   INTEGER NOT NULL,
  chunk_hashes       JSONB NOT NULL,        -- ordered array of chunk hashes
  collected_at       TIMESTAMPTZ NOT NULL,  -- device clock, from the field
  sealed_at          TIMESTAMPTZ,           -- server clock, on first sync
  collected_by       UUID NOT NULL REFERENCES actors(id),
  collection_lat     DOUBLE PRECISION,
  collection_lng     DOUBLE PRECISION,
  -- Nullable on purpose. A field device seals an item at the scene and can
  -- know nothing about the layout of the evidence store, so the fingerprint
  -- is recorded before the exhibit is deposited. Null means "not yet in the
  -- store", which is a different statement from "the file is gone".
  storage_path       TEXT,
  deposited_at       TIMESTAMPTZ,
  chain_head         TEXT                   -- hash of latest custody event
);

CREATE TABLE custody_events (
  id              UUID PRIMARY KEY,
  item_id         UUID NOT NULL REFERENCES items(id),
  seq             INTEGER NOT NULL,         -- 0-based position in the chain
  action          TEXT NOT NULL,
  actor_id        UUID NOT NULL REFERENCES actors(id),
  note            TEXT,
  device_time     TIMESTAMPTZ NOT NULL,     -- clock on the recording device
  server_time     TIMESTAMPTZ NOT NULL,     -- clock on the server at sync
  file_hash       TEXT,                     -- root hash observed at this event
  prev_hash       TEXT NOT NULL,            -- 64 zeroes for seq 0
  event_hash      TEXT NOT NULL,
  corrects_event  UUID REFERENCES custody_events(id),
  UNIQUE (item_id, seq)
);

-- The case level chain. One event per item creation, so that deleting an
-- entire item still leaves a trace. item_reference is TEXT and NOT a foreign
-- key on purpose: when a row disappears from items, this record survives and
-- the gap becomes visible. A foreign key would cascade the evidence away.
CREATE TABLE case_events (
  id              UUID PRIMARY KEY,
  case_id         UUID NOT NULL REFERENCES cases(id),
  seq             INTEGER NOT NULL,
  action          TEXT NOT NULL,            -- 'item_added'
  item_reference  TEXT NOT NULL,
  item_root_hash  TEXT NOT NULL,
  device_time     TIMESTAMPTZ NOT NULL,
  server_time     TIMESTAMPTZ NOT NULL,
  prev_hash       TEXT NOT NULL,
  event_hash      TEXT NOT NULL,
  UNIQUE (case_id, seq)
);

CREATE TABLE verifications (
  id             UUID PRIMARY KEY,
  item_id        UUID NOT NULL REFERENCES items(id),
  run_at         TIMESTAMPTZ NOT NULL,
  run_by         UUID REFERENCES actors(id),
  result         TEXT NOT NULL,             -- intact | altered | missing
  altered_chunks JSONB,                     -- indices of changed chunks
  chain_result   TEXT NOT NULL              -- intact | broken
);

CREATE INDEX idx_items_case ON items(case_id);
CREATE INDEX idx_events_item_seq ON custody_events(item_id, seq);
CREATE INDEX idx_case_events_case_seq ON case_events(case_id, seq);
CREATE INDEX idx_verifications_item ON verifications(item_id, run_at DESC);

-- Append only, enforced by the database and not merely by application code.
-- A mistake is corrected by appending a correction event that references the
-- erroneous one, which is how physical evidence handling already works.
CREATE OR REPLACE FUNCTION block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'custody_events is append only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update BEFORE UPDATE OR DELETE ON custody_events
  FOR EACH ROW EXECUTE FUNCTION block_mutation();
