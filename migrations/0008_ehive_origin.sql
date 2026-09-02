-- Records that came from eHive rather than from a volunteer.
--
-- The reference copy in ehive_records answers "what does eHive hold?". This puts
-- those objects into the collection proper, so the explorer shows one collection
-- rather than two halves a person has to remember to check separately.
--
-- ehive_record_id is what makes that safe. Written into column C of the import
-- spreadsheet it means "update this record", so an object catalogued in eHive and
-- later edited here goes back as a correction rather than a second copy. Without
-- it, importing would quietly set up a duplicate for every one of these objects
-- the next time anything was sent.
--
-- NOTHING IS LOST IN THE MAPPING. eHive's fields don't all have a counterpart
-- here - measurement_description is one string where we hold height, width and
-- length separately, and no honest parse recovers that. So the verbatim eHive
-- record stays in ehive_records.fields_json, linked by this id. What the mapping
-- can't carry is still there to be read; it simply isn't pretended into a shape
-- it was never in.

ALTER TABLE records ADD COLUMN ehive_record_id TEXT;

CREATE INDEX IF NOT EXISTS idx_records_ehive_id
  ON records(ehive_record_id) WHERE ehive_record_id IS NOT NULL;

-- What came from where. The committee question this answers is "how much of the
-- collection have we actually catalogued ourselves?".
DROP VIEW IF EXISTS collection_sources;

CREATE VIEW collection_sources AS
SELECT
  CASE WHEN ehive_record_id IS NULL THEN 'catalogued here' ELSE 'imported from eHive' END AS source,
  COUNT(*)                                   AS records,
  SUM(CASE WHEN registration_number IS NULL OR registration_number = '' THEN 1 ELSE 0 END) AS without_number
FROM records
WHERE deleted_at IS NULL
GROUP BY 1;
