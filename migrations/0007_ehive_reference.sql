-- What eHive already holds.
--
-- A read-only copy of the museum's existing eHive records, so this app can answer
-- two questions it otherwise has to guess at:
--
--   "Is this object already catalogued?"  A volunteer typing M1227 should be told
--   before they spend ten minutes on a record that already exists.
--
--   "Does this term already exist?"  object_type, place_made, maker and location
--   are pick lists in eHive, where a value that doesn't match an existing term
--   creates a new one. Knowing the real terms turns the export's warning from
--   "these two look similar" into "this one doesn't exist yet".
--
-- REFERENCE, NOT CATALOGUE. Nothing here is editable and nothing here appears in
-- the collection. eHive remains the master of what eHive already holds; this is a
-- copy of it for checking against. Keeping the two apart is what stops the app and
-- eHive quietly disagreeing about the same object, which we could not resolve
-- anyway - eHive has no write API.
--
-- Loaded from an eHive XML report by scripts/import-ehive-xml.mjs. Re-running the
-- import replaces the copy wholesale, because a partial merge of someone else's
-- master data is a good way to invent records that exist in neither system.

CREATE TABLE IF NOT EXISTS ehive_records (
  -- eHive's own id. This is what makes a round trip possible: written into
  -- column C of the import spreadsheet, it updates that record instead of
  -- creating a second one.
  object_record_id  TEXT PRIMARY KEY,
  object_number     TEXT,
  name              TEXT,
  object_type       TEXT,
  place_made        TEXT,
  maker             TEXT,
  location          TEXT,
  perspective       TEXT,              -- HISTORY for every record so far
  public_access     INTEGER,           -- 0 = not published on ehive.com
  fields_json       TEXT NOT NULL,     -- every field as exported, for later use
  imported_at       TEXT NOT NULL DEFAULT (datetime('now')),
  source_file       TEXT
);

-- The duplicate check runs on every keystroke of a registration number.
CREATE INDEX IF NOT EXISTS idx_ehive_object_number ON ehive_records(object_number);

-- Every term the museum actually uses, by field, with how many records use it.
-- This is what the export checks a volunteer's value against.
CREATE VIEW IF NOT EXISTS ehive_terms AS
  SELECT 'object_type' AS field, object_type AS term, COUNT(*) AS records
    FROM ehive_records WHERE object_type IS NOT NULL AND object_type <> '' GROUP BY object_type
  UNION ALL
  SELECT 'place_made', place_made, COUNT(*)
    FROM ehive_records WHERE place_made IS NOT NULL AND place_made <> '' GROUP BY place_made
  UNION ALL
  SELECT 'primary_creator_maker', maker, COUNT(*)
    FROM ehive_records WHERE maker IS NOT NULL AND maker <> '' GROUP BY maker
  UNION ALL
  SELECT 'location', location, COUNT(*)
    FROM ehive_records WHERE location IS NOT NULL AND location <> '' GROUP BY location;
