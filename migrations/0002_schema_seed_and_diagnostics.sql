-- Fixes two faults exposed by the first real sync attempt.
--
-- FAULT 1 — records.schema_version referenced schema_versions(version), but that
-- table starts empty and is only populated by a separate manual script. Every
-- insert from a device failed with FOREIGN KEY constraint failed until someone
-- remembered to run it. A schema that cannot accept a row until a human runs a
-- side task is a broken schema.
--
-- The fix: seed a placeholder row here, in the migration itself, so the database
-- is usable the moment it is created. Running the real seed later replaces it
-- (INSERT OR REPLACE on the same version) and fills in the actual field
-- definitions. Records written in the meantime stay valid.
INSERT OR IGNORE INTO schema_versions (version, yaml, field_count, source_form, note)
VALUES (
  2,
  '# PLACEHOLDER — the real worksheet.v2.yaml has not been loaded yet.
# Run: node scripts/seed-schema.mjs
#      npx wrangler d1 execute artefact-catalogue --remote --file=migrations/seed-schema.sql
# Until then, records reference this version but the field definitions are missing,
# so exports from this database will NOT be self-describing.
schema_version: 2
fields: []',
  0,
  'eHive Cataloguing Guidelines - July 2023, Appendix 1, pp.10-11',
  'Placeholder inserted by migration 0002 so sync works immediately. Replace by seeding the real schema.'
);

-- FAULT 2 — there was no way to see that sync was failing. Errors were caught on
-- the device and never left it. This table records every failure the server sees,
-- so a problem can be found by looking rather than by guessing.
CREATE TABLE IF NOT EXISTS sync_errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT,
  volunteer   TEXT,
  record_id   TEXT,
  stage       TEXT,           -- 'upsert' | 'revision' | 'photo' | 'pull'
  message     TEXT NOT NULL,
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_errors_at ON sync_errors(at);

-- Is the schema real yet, or still the placeholder? One query answers it.
CREATE VIEW IF NOT EXISTS schema_health AS
SELECT
  version,
  field_count,
  CASE WHEN field_count = 0 THEN 'PLACEHOLDER — run the seed script'
       ELSE 'loaded' END AS state,
  loaded_at
FROM schema_versions;
