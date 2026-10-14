-- Contributions: what volunteers know about an object, added after it was catalogued.
--
-- WHY THIS EXISTS. Two people do all the accessioning, and much of what makes an
-- object worth keeping — whose kitchen it sat in, which shop sold it, what it was
-- for — is in other volunteers' heads. The /contribute page lets any volunteer
-- pick a photographed object and say or type what they know. This table holds
-- what they said. It is a trial (October 2026): see PROJECT_BRIEF.md.
--
-- WHAT IT IS NOT. A contribution never edits a record. It is evidence sitting
-- beside the record, waiting for a person to decide what, if anything, goes into
-- the catalogue. Nothing here reaches the eHive export or the weekly snapshot.
--
-- DONOR NAMES ARE EXPECTED HERE. Asked "where did it come from?", people name
-- families and donors. The maintainer decided (2026-10-14) to allow that and to
-- treat every contribution as restricted: readable by admins only, never in an
-- export, never in browser storage. Keep it that way unless that decision changes.
--
-- APPEND-ONLY, like record_revisions. A correction is a new contribution. Removal,
-- if ever needed, is a soft delete with an actor and a reason.

CREATE TABLE IF NOT EXISTS contributions (
  id               TEXT PRIMARY KEY,         -- con_<random>, made by the Worker
  record_id        TEXT NOT NULL REFERENCES records(id),
  -- Which prompt was being answered: 'use', 'origin', 'story', 'other', or
  -- 'ai_check' for a comment on the machine description. Free text in the
  -- database so the trial can change its questions without a migration.
  question         TEXT NOT NULL,
  -- The question as it was worded on screen at the time. Wording shapes answers,
  -- and the wording will change during the trial.
  question_text    TEXT,
  body             TEXT,                     -- what they typed; may be empty if they only recorded
  audio_r2_key     TEXT,                     -- contributions/{record_id}/{id}.{ext}
  audio_type       TEXT,
  audio_bytes      INTEGER,
  audio_seconds    REAL,
  -- Had this person already been shown the machine description of the object
  -- when they sent this? 1 = yes. This is the anchoring check: agreeing with a
  -- guess you've just read is not the same evidence as knowing it independently,
  -- and a reviewer needs to be able to tell the two apart.
  ai_seen          INTEGER NOT NULL DEFAULT 0 CHECK (ai_seen IN (0,1)),
  -- From the Cloudflare Access header on the request — trustworthy.
  contributed_by   TEXT NOT NULL,
  -- The name shown on screen, which on a shared museum iPad is a claim made by
  -- choosing from the roster, not proof. Kept separate for the same reason
  -- captured_by and synced_by are (AGENTS.md rule 10). NULL = same as above.
  speaking_for     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT,
  deleted_by       TEXT,
  delete_reason    TEXT
);

CREATE INDEX IF NOT EXISTS idx_contributions_record ON contributions(record_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contributions_created ON contributions(created_at);

-- Machine descriptions of an object, made from its photographs.
--
-- One row per generation, never updated: if an object gets new photographs or a
-- better model, a new row is written and the newest is shown. Keeping the old
-- ones means a contribution marked ai_seen can always be matched to the exact
-- description that person read (the one current at its created_at).
--
-- These are guesses and are labelled as guesses everywhere they appear. They are
-- not catalogue data and do not flow into records.
CREATE TABLE IF NOT EXISTS ai_descriptions (
  id               TEXT PRIMARY KEY,         -- aid_<random>
  record_id        TEXT NOT NULL REFERENCES records(id),
  model            TEXT NOT NULL,
  photo_ids_json   TEXT NOT NULL,            -- which photographs it was shown, in order
  prompt_version   TEXT NOT NULL,
  description_json TEXT NOT NULL,            -- the structured answer
  input_tokens     INTEGER,
  output_tokens    INTEGER,
  requested_by     TEXT,                     -- whoever first opened the panel
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_descriptions_record ON ai_descriptions(record_id, created_at);
