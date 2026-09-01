-- Who catalogued this object, as an identity rather than a typed name.
--
-- Before this, captured_by held whatever someone typed into a box on the home
-- screen. Two volunteers called Margaret were indistinguishable, a typo was
-- permanent, and there was nothing linking a record to a person the museum
-- could actually contact.
--
-- Now captured_by holds an email address chosen from the registered user list.
--
-- THE POINT OF THE SECOND COLUMN. captured_by is still, in the end, a claim: on
-- a shared museum device the person signed in is the device, and whoever picks
-- their name from the list is trusted to pick their own. synced_by is not a
-- claim. The Worker writes it from the Cloudflare Access identity header on the
-- request that carried the record, so a device cannot assert it and cannot
-- change it. When the two agree, the attribution is verified. When they differ,
-- that is the shared-device case and the record says so honestly rather than
-- pretending to a certainty it doesn't have.
--
-- Older records keep the typed name in captured_by and a NULL synced_by. That is
-- correct: they were never verified, and back-filling a guess would erase the
-- distinction this migration exists to draw.

ALTER TABLE records ADD COLUMN synced_by TEXT;
ALTER TABLE record_revisions ADD COLUMN synced_by TEXT;

-- Answers "which records did this person catalogue" without scanning values_json.
CREATE INDEX IF NOT EXISTS idx_records_captured_by
  ON records(captured_by) WHERE deleted_at IS NULL;

-- SQLite views are fixed at creation, so exposing the new column means replacing
-- the view. Same shape as before with synced_by added; npm run db:records reads it.
DROP VIEW IF EXISTS current_records;

CREATE VIEW current_records AS
SELECT
  r.id,
  r.registration_number,
  r.object_name,
  r.status,
  r.captured_by,
  r.synced_by,
  r.updated_at,
  r.schema_version,
  (SELECT COUNT(*) FROM photos p WHERE p.record_id = r.id AND p.deleted_at IS NULL) AS photo_count
FROM records r
WHERE r.deleted_at IS NULL;

-- Who has catalogued, and how recently. The committee question this answers is
-- "is anyone actually using this?", which is otherwise a trawl through the logs.
CREATE VIEW IF NOT EXISTS cataloguer_activity AS
SELECT
  COALESCE(r.captured_by, '(not recorded)') AS cataloguer,
  u.display_name,
  COUNT(*)                                  AS records,
  MIN(r.captured_at)                        AS first_record,
  MAX(r.updated_at)                         AS last_record
FROM records r
LEFT JOIN users u ON u.email = r.captured_by
WHERE r.deleted_at IS NULL
GROUP BY COALESCE(r.captured_by, '(not recorded)'), u.display_name;
