# Development log

Dated history of what changed, why, and how it was checked. Oldest first; append new entries at
the bottom. Current state is in [PROJECT_STATUS.md](PROJECT_STATUS.md).

Entries before 2026-09-15 were reconstructed that day from the commit messages. Validation in
them is as the commits report it, and was not re-run. Commits from late 2026-08-11 to 2026-08-13
carry one-line messages, so those entries say less. The commit messages hold the full reasoning;
this log summarises and cites them.

## 2026-08-11 — Capture app, service worker, and the start of sync

### Change and reason

- **Initial app** (7368130). Schema-driven PWA: every field and prompt from
  `schema/worksheet.v2.yaml`, records and photographs in IndexedDB, donor fields restricted.
- **Record number first, and photographs on iOS** (544a78f). Knowing the record before shooting
  stops photographs being filed against the wrong object. iOS fixes: two file inputs, EXIF
  orientation, HEIC to JPEG, PNG touch icon.
- **Hosting** (d6a3e10, 6c48ff0). Render's service cap forced a move to Cloudflare Pages, then
  to Workers with an explicit `wrangler.jsonc`.
- **Service worker rewritten** (ebe41b1). The page is network-first and hashed assets are
  cache-first. The old cache-first page would have made every deploy after the first invisible
  to phones.
- **Sync** (3b7fdc2). Worker API, D1 with append-only revisions, R2 for photographs, the weekly
  snapshot, and the iOS storage notice. `render.yaml` deleted.
- **Two sync bugs fixed** (b959eba). Pulling a record wiped its local photographs, and restricted
  fields weren't filtered from the payload.
- 60a3273 "updted database record" — no description.

### Validation

- `wrangler deploy --dry-run` (6c48ff0).
- Service worker update handover in headless Chromium, over three runs (ebe41b1).
- Restricted-field stripping run against the real worksheet: all five fields removed (b959eba).

### Remaining limitations

- Not deployable at the end of the day: placeholder D1 id, and the API trusted the Access header
  with nothing yet in front of it.

### Handover

- Committed. Push and deployment state not recorded.

## 2026-08-12 — Explorer, roles and removal

### Change and reason

- Photo upload and database fixes (de61cac).
- Explorer, user roles and sync diagnostics (681e2b2).
- App shell served for client-side routes, and the empty-response fallback fixed (03690bc, 5ab9b62).
- Admin record removal, restore and sign-out (01c5f06, then committed again as a7ac083).
- Removal endpoints and clearer 404s (1aaa13b).
- Sync endpoints require an authorised user (860a3c6). The same commit added
  `gate-sync-endpoints/`, copies of two files that have since diverged from the live ones.

### Validation

- None recorded.

### Remaining limitations

- `gate-sync-endpoints/` is a stale copy left in the repository.

## 2026-08-13 — Device-scoped sync, identity required, help

### Change and reason

- Sync scoped to the device that captured a record, and removals propagated (522bb90).
- Sync refused without an identity header (4a5091d).
- In-app help for volunteers (8c72558).

### Validation

- None recorded.

## 2026-09-01 — Sign-in failures and attributed records

### Change and reason

- **Service worker never caches a sign-in page** (b0dcf96). `/api/*` is never intercepted and no
  redirected response is stored; `CACHE` bumped to v3. Shipped on its own, ahead of widening
  Access.
- **Records attributed to a registered person** (15eb490). `captured_by` comes from the roster and
  `synced_by` from the Access header. Also the corner badge, and `PATCH /api/me` so people can
  correct their own name and colour.
- **Documentation** (83b4f30). CLAUDE.md brought back in step with the app, and
  `docs/user-manual.html` added in four parts.

### Validation

- None recorded. The manual's screen names were taken from the components.

## 2026-09-02 — Access everywhere, and the eHive round trip

### Change and reason

- **Sign-in across the whole site.**
  - A route into the sign-in, and a notice describing Cloudflare's page (e1bdd14, 8a8971d).
  - Safe-area insets (b72fe6c).
  - The crest in `public/` for the login page (42c5d5f).
  - The manifest fetched with credentials (da80500), deployed before Access widened.
- **Mappings verified** (3c44782) against the March 2026 import workbook: 28 mapped, 11
  withheld, 5 app internals. Museum decisions recorded: History / Physical Object constants;
  description goes to the web public description; pick-list values flagged, not constrained.
- **eHive import file and pick-list report** (1f997b9).
- **Reference copy from eHive's XML report** (8531c24). Subjects remapped to
  `association_keyword`. `seeds/` created, because wrangler ran a seed as a migration.
- **The 35 eHive records imported** (15e0a74), idempotent on `object_record_id`. The
  duplicate-number warning now covers the whole museum.
- **Explorer refreshes on return** (b9b6ab9).
- **eHive's photographs attached** to 33 of the 35 imported records from a PDF report (739f260).
  Ambiguous files resolved by image comparison, not filename.
- **Documentation brought up to date** (60d10b8).

### Validation

- **Export**, against seeded records: no donor fields, constants on every row, fuzzy dates kept
  as typed, 403 for volunteers and unregistered callers. The pick-list report caught all three
  planted near-duplicates (1f997b9).
- **Terms**, against the real vocabulary: "Jugs", "Dorrigo" and "Verandah" recognised (8531c24).
- **Import**: running it twice gives 35 rows, not 70, and every exported row carries its eHive id
  (15e0a74).
- **Photographs**: five checksums checked against R2 (739f260).

### Remaining limitations

- The export reads the schema from D1, and built against a stale schema twice that day.
- The claim written that day that all 35 records were unpublished turned out to be wrong
  (corrected 2026-09-03).

## 2026-09-03 — Photographs, measurements, API access, landing, briefing slides

### Change and reason

- **Add photographs to catalogued objects** (53d8e8d). Photographs queue in IndexedDB before
  upload. Exactly one main photograph per record.
- **eHive measurements kept** (03798e6). 26 records had text the import had dropped; it is now
  kept as `raw` and not parsed. The record view gains "Also held in eHive".
- **Several views per object** (a67ebb0, b674d25, 2798bc7). 91 photographs across 38 records.
  The 32 PDF-derived images they supersede are retired, not deleted. Only the Dorrigo District
  Rural School uniform (M1723) still has no photograph.
- **Wide catalogue layout and wrapping for long references** (b91b9eb).
- **eHive API handshake documented** (1d777c8). Two credentials were exposed in a transcript and
  rotated.
- **Desk-or-phone landing for a bare `/`** (db56401).
- **Record coverage** (312a036). We hold 35 of eHive's 66 records. `publicAccess: 0` does not mean
  private. Two registration number schemes are in use.
- **Volunteer briefing slides** (8e28f88), generated by `scripts/build-volunteer-deck.py` with five
  image placeholders.

### Validation

- **Photographs and roles**: an upload demotes the old main photograph, promotion leaves exactly
  one, and an unregistered caller gets 403 (53d8e8d).
- **Primary invariant**: every record has exactly one main photograph, and four random
  photographs match their R2 checksums (2798bc7).
- **Landing**: the rule exercised against all six combinations of saved choice and device
  (db56401).
- **Layout**: the widening rule confirmed in the built stylesheet (b91b9eb).
- **Slides**: rendered and inspected (8e28f88).

### Remaining limitations

- The 31 private eHive records can't be reached through the API or the XML report.
- M1723 is used by two objects in eHive, and one eHive record has no number.

### Handover

- Committed and pushed. Worker deployments at 03:30, 03:40 and 04:05 UTC.

## 2026-09-15 — Track development in stages, using the project starter template

### Change and reason

- **Documentation set** adopted from the project starter template, for tracking development
  stages between sessions.
  - `AGENTS.md` holds the shared working instructions: everything enduring from the former
    CLAUDE.md, plus the template's rules for starting a session, validating, keeping project
    memory and finishing.
  - `CLAUDE.md` now only imports `AGENTS.md`, so Claude Code and Codex read one copy.
  - `PROJECT_BRIEF.md` defines the stages: 1–4 reconstructed as complete, 5–7 proposed. It also
    holds the open decisions table and a requirement change log.
  - `PROJECT_STATUS.md` holds the current snapshot and the stage table.
  - This log was backfilled from git history.
- **Current-state notes moved out of the instructions.** CLAUDE.md's "Left undone" list went to
  the status file, because a list of open items inside standing instructions goes stale.
  Enduring facts from that list stayed in `AGENTS.md`: the private-records attempts,
  `publicAccess`, the two numbering schemes, and how to re-run the photograph script.
- **Documentation drift corrected:**
  - CLAUDE.md's eHive section still opened by saying all 35 records were unpublished and the API
    would return nothing. That was corrected lower in the same file on 2026-09-03, but never
    removed.
  - CLAUDE.md said "all six" open questions and then listed seven; the schema has seven.
  - README said API access included private records, and listed six questions.
  - CLAUDE.md said both blazers lacked a photograph. The database shows only the uniform (M1723)
    does, as 2798bc7 said.
  - SYNC-SETUP listed adding photographs to a catalogued record as not built; it was built in
    53d8e8d.
- **`.gitignore`** now ignores Office lock files (`~$*`).

### Validation

- `npm run typecheck` passed at 8e28f88. The working tree differed only in the slide deck.
- `git ls-remote origin` shows `main` at 8e28f88, the same as local.
- `npx wrangler deployments list`: the latest deployment is 2026-09-03 04:05 UTC.
- Read-only D1 queries: 38 live records, 91 live photographs, 32 retired, no record with more or
  fewer than one main photograph, and M677 carries its eHive measurement (so the import was re-run
  after 03798e6).
- File references in the new documents checked against the repository.
- Not run: build or browser checks. This was a documentation-only change.

### Remaining limitations

- Stages 5–7 are proposals and need the maintainer's agreement.
- `docs/user-manual.html` still says there are six open questions.

### Handover

- Committed, not pushed. The maintainer's PowerPoint edit to the slide deck was committed
  separately, as it stood.
