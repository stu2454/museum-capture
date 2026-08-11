-- Artefact catalogue — initial schema
-- Cloudflare D1 (SQLite). Apply with:
--   npx wrangler d1 migrations apply artefact-catalogue --remote
--
-- Two principles run through this file, and they're both about the catalogue
-- outliving the app that made it:
--
-- 1. NOTHING IS EVER OVERWRITTEN. Every save appends to record_revisions. A
--    museum catalogue that silently loses a previous reading is worse than one
--    with contradictions in it, because contradictions can be resolved later and
--    lost data can't.
--
-- 2. THE SCHEMA TRAVELS WITH THE DATA. A row saying {"materials":["wood","brass"]}
--    is meaningless in twenty years without the field definitions that gave it
--    shape. schema_versions holds the actual YAML, and every export bundles it.

-- ---------------------------------------------------------------- schema_versions
-- The field definitions themselves, stored verbatim. Insert a row whenever
-- worksheet.v2.yaml changes. Never delete one, even superseded: old records were
-- written against old definitions and can only be read with them.
CREATE TABLE schema_versions (
  version       INTEGER PRIMARY KEY,
  yaml          TEXT    NOT NULL,          -- the complete schema file, verbatim
  field_count   INTEGER NOT NULL,
  source_form   TEXT,                      -- e.g. "eHive Cataloguing Guidelines - July 2023"
  note          TEXT,                      -- what changed and why
  loaded_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------- records
-- Current state of each record. `values_json` is the whole answer set; the
-- columns above it are promoted copies, there purely so the list screen and
-- searches don't have to parse JSON.
--
-- Why JSON rather than a column per field: there are 44 fields today and the
-- schema is still moving. D1 caps a table at 100 columns, and every schema change
-- would otherwise mean an ALTER TABLE against live museum data. JSON keeps full
-- fidelity; the promoted columns keep it queryable. Denormalised on purpose.
CREATE TABLE records (
  id                   TEXT PRIMARY KEY,   -- client-generated (rec_...), so offline devices never collide
  registration_number  TEXT,               -- Dorrigo register number; NOT unique — see index note below
  object_name          TEXT,
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','review','confirmed','exported')),
  schema_version       INTEGER NOT NULL REFERENCES schema_versions(version),
  values_json          TEXT NOT NULL DEFAULT '{}',
  captured_by          TEXT,
  captured_at          TEXT,
  updated_at           TEXT NOT NULL,      -- client clock; used for last-write-wins
  synced_at            TEXT NOT NULL DEFAULT (datetime('now')),
  device_id            TEXT,
  revision             INTEGER NOT NULL DEFAULT 1,
  -- Soft delete only. A volunteer deleting a record on a phone must not be able
  -- to destroy the server copy; it disappears from lists and stays recoverable.
  deleted_at           TEXT
);

-- Deliberately NOT a unique constraint. A duplicated registration number is
-- usually a typo or two volunteers on the same object — both need flagging to a
-- human, not rejecting at the database, which would just lose the second record.
CREATE INDEX idx_records_registration ON records(registration_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_records_status       ON records(status)              WHERE deleted_at IS NULL;
CREATE INDEX idx_records_updated      ON records(updated_at);

-- ------------------------------------------------------------- record_revisions
-- Append-only history. One row per save that reached the server. This is the
-- actual durability guarantee: `records` can be rebuilt from here entirely.
CREATE TABLE record_revisions (
  record_id     TEXT    NOT NULL,
  revision      INTEGER NOT NULL,
  values_json   TEXT    NOT NULL,
  status        TEXT,
  captured_by   TEXT,
  updated_at    TEXT    NOT NULL,
  device_id     TEXT,
  received_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (record_id, revision)
);

CREATE INDEX idx_revisions_received ON record_revisions(received_at);

-- ----------------------------------------------------------------------- photos
-- Metadata only. The image bytes live in R2 under r2_key; D1 caps a row at 2 MB
-- and blobs in a relational database are a poor idea regardless.
--
-- sha256 is not decoration: it's how anyone can verify years from now that an
-- exported photo is the one the record refers to, and how a re-upload is
-- recognised as a duplicate rather than stored twice.
CREATE TABLE photos (
  id            TEXT PRIMARY KEY,          -- client-generated (img_...)
  record_id     TEXT NOT NULL REFERENCES records(id),
  r2_key        TEXT NOT NULL UNIQUE,      -- photos/{record_id}/{photo_id}.jpg
  sha256        TEXT,
  bytes         INTEGER,
  content_type  TEXT NOT NULL DEFAULT 'image/jpeg',
  is_primary    INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  caption       TEXT,
  added_at      TEXT NOT NULL,
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);

CREATE INDEX idx_photos_record ON photos(record_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_sha    ON photos(sha256);

-- ---------------------------------------------------------------------- exports
-- A log of every snapshot written out, so "when was this last backed up, and
-- where did it go" has an answer that isn't someone's memory.
CREATE TABLE exports (
  id            TEXT PRIMARY KEY,
  r2_key        TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('scheduled','manual','pre_migration')),
  record_count  INTEGER NOT NULL,
  photo_count   INTEGER NOT NULL,
  bytes         INTEGER,
  sha256        TEXT,
  schema_version INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  note          TEXT
);

-- ------------------------------------------------------------------- sync_log
-- Who sent what, from where. Small museums run on shared devices; when a record
-- looks wrong, the first question is always who entered it and when.
CREATE TABLE sync_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT,
  volunteer   TEXT,
  action      TEXT NOT NULL,               -- 'push' | 'pull' | 'photo_upload' | 'export'
  record_id   TEXT,
  detail      TEXT,
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sync_at ON sync_log(at);

-- ==========================================================================
-- DONOR DETAILS ARE NOT IN THIS DATABASE.
--
-- Donor name, address, email, phone and the tax incentive number are personal
-- information about living people. They are excluded from the capture app, from
-- these tables, and from every export.
--
-- If the museum later needs them held digitally, they belong in a SEPARATE D1
-- database with its own access control, joined only by records.id — so that a
-- catalogue export can be shared, published or handed to eHive without anyone
-- having to remember to strip anything out.
-- ==========================================================================

-- Convenience view for listing screens: current, undeleted records with a photo count.
CREATE VIEW current_records AS
SELECT
  r.id,
  r.registration_number,
  r.object_name,
  r.status,
  r.captured_by,
  r.updated_at,
  r.schema_version,
  (SELECT COUNT(*) FROM photos p WHERE p.record_id = r.id AND p.deleted_at IS NULL) AS photo_count
FROM records r
WHERE r.deleted_at IS NULL;

-- Registration numbers used more than once — a report for a human to resolve,
-- which is why this is a view and not a constraint.
CREATE VIEW duplicate_registrations AS
SELECT registration_number, COUNT(*) AS record_count, GROUP_CONCAT(id) AS record_ids
FROM records
WHERE deleted_at IS NULL AND registration_number IS NOT NULL AND registration_number <> ''
GROUP BY registration_number
HAVING COUNT(*) > 1;
