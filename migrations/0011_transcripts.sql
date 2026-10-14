-- Machine transcripts of recorded contributions.
--
-- Made by transcribe/transcribe.py, run on the maintainer's computer, not by the
-- Worker: the speech model (Parakeet, via sherpa-onnx) runs offline there, so the
-- recordings — which may name living people — never go to another company.
--
-- APPEND-ONLY, like everything else here. A better model or a longer word list
-- means a new row, never an edit; the review page shows the newest. The recording
-- in R2 stays the original, and a transcript is only ever a reading of it (D-006).
--
-- RESTRICTED, exactly like the contributions they come from: admins only, never in
-- an export or the weekly snapshot.
--
-- What a row keeps, so nothing is laundered:
--   raw_text   what the engine heard, verbatim, "um"s and misspellings included
--   text       the same with word-list corrections applied ("Doriga" -> "Dorrigo")
--   words_json one entry per word: its time, any correction (with what was heard),
--              and whether it fell in a noticeably quieter stretch
--   notes_json the quieter stretches and corrections, listed for the reviewer
--
-- "Quieter" is a prompt to listen, not a finding. On the first real recordings it
-- caught a second person speaking in the background, and also once flagged the
-- contributor trailing off. Never treat a flagged word as someone else's, or as the
-- contributor's, without a person listening.

CREATE TABLE IF NOT EXISTS transcripts (
  id               TEXT PRIMARY KEY,            -- tr_<random>
  contribution_id  TEXT NOT NULL REFERENCES contributions(id),
  engine           TEXT NOT NULL,               -- e.g. 'sherpa-onnx parakeet-tdt-0.6b-v3-int8'
  method_version   TEXT NOT NULL,               -- transcribe.py's METHOD_VERSION; bump to re-run
  vocabulary_hash  TEXT,                        -- which word list was used
  raw_text         TEXT NOT NULL,
  text             TEXT NOT NULL,
  words_json       TEXT NOT NULL,
  notes_json       TEXT NOT NULL DEFAULT '{}',
  audio_seconds    REAL,
  made_on          TEXT,                        -- which computer ran it
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transcripts_contribution ON transcripts(contribution_id, created_at);
