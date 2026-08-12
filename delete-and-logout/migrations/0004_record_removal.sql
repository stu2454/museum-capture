-- Removing records from the collection.
--
-- The schema already has records.deleted_at, so removal has always been a soft
-- delete. This migration adds the two things that make it accountable: who did
-- it, and why.
--
-- Why nothing is ever really destroyed:
--
-- Deleting a catalogue record is not the same as tidying a spreadsheet. In museum
-- practice, removing an object from a collection is deaccessioning — a governed
-- decision, usually requiring committee approval, and one that leaves a permanent
-- paper trail precisely so it can be scrutinised later. Most records a volunteer
-- wants to "delete" are not deaccessions at all: they are duplicates, test
-- entries, or mistakes. Those should disappear from view without the underlying
-- work being destroyed.
--
-- So: removal hides a record, records who removed it and why, and stays
-- recoverable. The revision history and the photographs are untouched.

ALTER TABLE records ADD COLUMN deleted_by TEXT;
ALTER TABLE records ADD COLUMN deletion_reason TEXT;

-- Removed records, for the admin screen and for anyone asking what happened to
-- an object that used to be in the catalogue.
CREATE VIEW IF NOT EXISTS removed_records AS
SELECT
  r.id,
  r.registration_number,
  r.object_name,
  r.captured_by,
  r.deleted_at,
  r.deleted_by,
  r.deletion_reason,
  (SELECT COUNT(*) FROM photos p WHERE p.record_id = r.id) AS photo_count,
  (SELECT COUNT(*) FROM record_revisions v WHERE v.record_id = r.id) AS revision_count
FROM records r
WHERE r.deleted_at IS NOT NULL
ORDER BY r.deleted_at DESC;
