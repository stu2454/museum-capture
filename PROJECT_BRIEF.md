# Museum Artefact Capture — project brief

What the app is for, what it covers, how it is being built in stages, and the decisions still
waiting on the museum. Current progress is in [PROJECT_STATUS.md](PROJECT_STATUS.md); history is in
[DEVLOG.md](DEVLOG.md); rules for working on the code are in [AGENTS.md](AGENTS.md).

Set up on 2026-09-15 for a project already well under way. Stages 1–4 were reconstructed from the
git history that day. Stages 5–7 are proposals and need the maintainer's agreement before work
starts on them.

## Purpose

Volunteers at a small local history museum in Dorrigo catalogue objects on a two-page paper
worksheet — Appendix 1 of the eHive Cataloguing Guidelines (July 2023) — and someone later types
it into eHive. This app replaces the paper: a volunteer photographs the object and answers short
questions on a phone while holding it. The result is a structured record that goes into the
museum's eHive account cleanly through eHive's import spreadsheet.

## Intended users

- **Cataloguing volunteers.** Frequently retired and not technical. They work in a store room with
  poor light and unreliable wifi, often with one hand holding something fragile. They use phones
  and iPads, ideally with the app added to the Home Screen.
- **Committee members (admins).** Work at a desk. They add people, remove and restore records,
  and prepare the eHive import file. Donor details belong to them and stay outside the app, with
  the deed of gift.
- **Viewers.** Look records up in the catalogue.
- **The maintainer.** Not a full-time developer, and may hand the project to someone with less
  experience than themselves.
- **Accessibility.** 18px base text, 52px minimum touch targets, high contrast, adjustable text,
  reduced motion respected, no fonts fetched over the network. Australian English. Field labels
  use the paper's own wording.

## Main user journeys

**Cataloguing an object (volunteer, phone)**

1. The volunteer signs in once per device with an emailed code, before going into the store room.
2. They start a record and enter the register number from the object's tag. If that number is
   already used anywhere in the museum, they are told before doing any more work.
3. They photograph the object, then work through eight short screens.
4. The record reads back in the shape of the paper form. They check it and save it for review.
5. **Success means** the record, with its photographs, reaches the server attributed to that
   registered person, whether or not there was signal while they worked.

**Sending records to eHive (admin, desk)**

1. The admin opens the catalogue and prepares the eHive file.
2. The app reports every pick-list value that would create a new term in eHive.
3. The admin reviews it and emails the file, with images, to Vernon Systems, who run the import.
4. **Success means** the records land in eHive: imported records update their existing entry, and
   new records don't create duplicate terms.

## Scope — built and in use

| Capability | Expected behaviour | Acceptance check |
|---|---|---|
| Schema-driven capture | Every field, prompt and grouping comes from `schema/worksheet.v2.yaml` | A field added to the YAML appears in the flow, review sheet and export with no code change |
| Offline capture | Every change saves to IndexedDB immediately; no save button | In airplane mode, start a record, close the app, reopen: the record is there |
| Photographs | Camera and library inputs; EXIF rotation applied; HEIC converted to JPEG; 2000px maximum, never enlarged | A portrait iPhone photo attaches upright, and a HEIC file attaches |
| Duplicate number warning | Warns, never blocks, when a number is used on the device, on the server or in the eHive reference copy | An existing M-number triggers the warning before the photograph step |
| Review | The record read back in paper order, looking like the worksheet | Every entered field appears in its paper position |
| Background sync | Records to D1 and photographs to R2; donor fields stripped; a phone pulls back only what it captured | A record captured offline appears in `npm run db:records` after reconnecting, with no restricted field in it |
| Sign-in and roles | Cloudflare Access code by email, then the `users` table; admin, volunteer and viewer roles | An unregistered email sees who to ask, not the app; a volunteer gets 403 on admin endpoints |
| Attribution | `captured_by` chosen from the roster; `synced_by` set by the server from Access | On a shared device, a record shows both names when they differ |
| Catalogue (`/explore`) | Search, read a record and its photographs, add photographs, choose the main one; admins remove and restore | Removing a record needs a reason, and it can be restored |
| Desk or phone landing | A bare `/` opens the catalogue on a desk and capture on a phone; a deliberate crossing is remembered | Each half links to the other, and the choice sticks on that device |
| eHive export | CSV in the March 2026 workbook's column order, plus a pick-list report checked against the museum's real terms | Pastes into the workbook without columns shifting; no donor field in the output |
| eHive import | eHive's records brought into the collection, keyed on `object_record_id`, keeping text that doesn't fit a field | Running it twice leaves the same number of records, not double |
| Durability | Append-only revisions; soft delete only; weekly snapshot to R2 (Monday 01:00 AEST) | The latest Monday's snapshot folder exists in R2 with a manifest |
| Help | In-app help, `docs/user-manual.html`, volunteer briefing slides | Screen names in the help match the app |

## Out of scope for now

- **Voice capture.** The structure is in place; the flow is not built. The intended design is in
  AGENTS.md: one open question per group, not one per field. The maintainer's direction is under
  "Future direction: voice annotation" below.
- **Automatic sending to eHive.** eHive has no write API. The last step is a person.
- **Donor details in the app.** Never without asking.
- **Photo metadata pull between devices.** A record opened on a second device doesn't know which
  images exist elsewhere.
- **Audio and table field types.**
- **Hard deletes.**
- **Registration number validation**, until open decision 1 is answered.

These can change through an explicit decision recorded below.

## Technical context

- **Stack.** An existing codebase: Vite 5, React 18 and TypeScript as a PWA, served by a Cloudflare
  Worker. npm, with `package-lock.json`.
- **Versions.** No Node version is pinned. Node v24.1.0 was in use on 2026-09-15.
- **Hosting.** `museum-capture.stu2038.workers.dev`, behind Cloudflare Access for the whole host.
  D1 database `artefact-catalogue`, R2 bucket `artefact-photos`.
- **Devices.** iPhone and iPad Safari, installed to the Home Screen, for capture. Desktop browsers
  for the catalogue.
- **eHive.** The import spreadsheet goes to Vernon Systems staff. XML reports are downloaded from
  the museum's account. The read-only API is used for reference.
- **Local tooling for one-off scripts.** `scripts/attach-ehive-images.mjs` is macOS only (uses
  `sips`). `scripts/build-volunteer-deck.py` needs Python 3.11.
- **Offline.** After sign-in, cataloguing must work with no signal. Sync is never a precondition.

## Data and persistence

- **Created.** Object records (44 schema fields), photographs, revision history, users.
- **Reference data.** `ehive_records` and `ehive_terms`, loaded from an eHive XML report. Read-only.
- **Stored.** IndexedDB on the device is the working copy. D1 and R2 on the server.
- **Must survive.** Closing the app mid-record, no signal, and iOS's seven-day storage sweep
  (mitigated by installing to the Home Screen). Anything captured between syncs lives only on the
  device.
- **Backups.** A weekly R2 snapshot (CSV, JSON, revisions, photo checksums, schema, manifest,
  README). A periodic copy off Cloudflare is recommended; see open decision 9.
- **Sensitive.** Donor name, address, email, phone and tax incentive number are
  `sensitivity: restricted`. They never reach a component, browser storage, the server or any
  export.
- **Deletion.** Nothing is really deleted. Removal is a soft delete with an actor and a reason,
  and it can be restored.

## Assets and integrity constraints

- `schema/worksheet.v2.yaml` is the source of truth. `label` text is verbatim from the paper and
  is never edited.
- Field ids become permanent once records exist; renaming one means migrating data.
- `mapping.ehive` values are verified against `ehive_import_spreadsheet - march 2026.xlsm`.
  Re-verify when eHive publish a new workbook.
- What a volunteer typed is never silently changed. An unparsed value is kept in `raw` and
  flagged. Dates are free text (`fuzzy_date`).
- Photographs are JPEG, quality 85, 2000px maximum, never enlarged, with their checksum recorded.
  Exactly one main photograph per record.
- `images/` stays out of git, because a photograph of a filled-in worksheet carries donor details.
- `docs/artefact-catalogue-for-volunteers.pptx` is generated by `scripts/build-volunteer-deck.py`;
  see open decision 10.

## Design and content

Registration ink, archival board and the brass tie-on tag. The accession tag header is the one
loud element. The capture app is phone-first at 640px. The catalogue widens to 1080px on a desk,
but forms don't. The review screen deliberately looks like the paper worksheet.

## Failure behaviour

- **Unparseable input.** Keep the text, flag it for review, never discard it.
- **No signal.** Capture carries on. Sync retries quietly. A banner appears only after hours of
  failure.
- **Expired session.** The service worker never caches a sign-in page or a redirect.
- **Undecodable photograph.** The original file is kept.
- **Unregistered person.** They are told who to ask, not shown a raw error.
- **eHive values that don't fit a field.** Kept verbatim and shown as "Also held in eHive".

## Stages

Each stage is defined here once. Its current state is recorded only in the stage table in
PROJECT_STATUS.md.

### Stage 1 — Schema-driven capture on a phone

- **Deliver.** The capture flow built from the YAML, record number first, photographs that work on
  iOS, the review sheet, local saving, JSON export, and a service worker that lets a deploy reach
  a phone.
- **Validate.** The capture journey on an iPhone. The service worker update handover in a headless
  browser.
- **Completed.** 2026-08-11.

### Stage 2 — Sync, the catalogue and roles

- **Deliver.** The Worker API, D1, R2 and the weekly snapshot. Donor fields stripped from sync.
  The explorer with user roles, removal and restore. Sync scoped to the device. In-app help.
- **Validate.** Restricted fields absent from the sync payload. A volunteer cannot reach admin
  endpoints.
- **Completed.** 2026-08-13.

### Stage 3 — Sign-in for everyone, and attributed records

- **Deliver.** Access over the whole site, including capture. Records attributed to a registered
  person (`captured_by` and `synced_by`). People can correct their own name and badge. Service
  worker and manifest fixes so the sign-in doesn't break installed apps. The user manual.
- **Validate.** An expired session doesn't leave the app opening on a login page. Add to Home
  Screen still produces a named app.
- **Completed.** 2026-09-02.

### Stage 4 — The eHive round trip (public records)

- **Deliver.** Verified mappings, the import file and pick-list report, the reference copy, the 35
  records imported with their photographs and measurements, adding photographs to catalogued
  objects, the desk-or-phone landing, and the API handshake documented.
- **Validate.** Import is idempotent. Every exported row carries its eHive record id. Every record
  has exactly one main photograph. Sampled photographs match their checksums in R2.
- **Completed.** 2026-09-03, for the 35 public records. The 31 private records are Stage 7.

### Stage 5 — Volunteer rollout *(proposed 2026-09-15)*

- **Deliver.** The briefing slides finished, with real images in place of the five placeholders.
  The user manual in step with the app. Volunteers added as users. Real cataloguing sessions.
  Feedback from volunteers and admins after real use, written up in the repository without
  people's names.
- **Validate.** No placeholder text left in the deck, and the file is a size that can be emailed.
  Screen names in the manual match the app. A volunteer other than the maintainer catalogues an
  object on their own device, and the record reaches the server attributed to them, with its
  photographs.
- **Complete when.** The briefing has been held; a session's records appear in
  `npm run db:records` with `captured_by` and `synced_by` both set; and the feedback is written
  up and has been used to choose the next stage.

### Stage 6 — Housekeeping before the catalogue grows *(proposed 2026-09-15)*

- **Deliver.**
  - Move `migrations/seed-schema.sql` to `seeds/`, and point `scripts/seed-schema.mjs` and
    `db:seed` at the new place.
  - Remove the stale `gate-sync-endpoints/` copies, once confirmed unused.
  - Remove the vestigial `ehiveExportReady` flag.
  - Bring `SYNC-SETUP.md`'s hand-written seed command in line with `npm run db:seed`.
- **Validate.** Migrations apply cleanly to a fresh local D1 (`npm run db:migrate:local`).
  `npm run db:seed` then `npm run db:check` report schema version 2 with 44 fields.
  `npm run typecheck` and `npm run build` pass.
- **Complete when.** All of the above pass and the documentation no longer lists these items.

### Stage 7 — The whole eHive collection *(proposed 2026-09-15; blocked on eHive)*

- **Deliver.** The 31 private records in the reference copy. The reference copy and photographs
  harvested through the API instead of downloaded by hand.
- **Validate.** The reference copy holds as many records as eHive's dashboard reports (66 on
  2026-09-03). The duplicate-number warning fires for a private record's number. A second harvest
  changes nothing.
- **Depends on.** eHive explaining how to reach private records through the API.

### Stage 8 — A collection page that scales *(added 2026-09-15, as a priority)*

The Collection page was built for a few dozen records. The list stopped at 50 without saying
so, every thumbnail downloaded the 2000px original, the tools sat below the list, and coming
back from a record lost your place. This is Option A of the options discussed that day.

- **Deliver:**
  - Tools and sign-out at the top of the page.
  - The list in pages of 50, with a "Show the next 50" button and a count that says how many
    are showing.
  - A 400px thumbnail for each photograph, made by the device that sends it, plus a script for
    photographs already on the server.
  - The address follows the screen, so the browser's Back button returns to the list and your
    place in it.
  - Registration numbers in natural order.
- **Validate:**
  - More than 50 records can all be reached, and the count is right at every step.
  - M654 sorts before M1227, and records with no number come last.
  - Returning from a record, by the app's button or the browser's, lands at the same place.
  - The list and photo grids load thumbnails; the enlarged view loads the original.
  - Nothing scrolls sideways at phone width.
- **Complete when.** It is deployed, the thumbnail script has been run against the real
  collection, and the live site has been checked on a desk and on a phone.

### Stage 9 — "What do you know about this?" contribution trial *(added 2026-10-14)*

Only two people do the accessioning, and much of what an object means is in other volunteers'
heads. This stage lets any volunteer pick an object that has already been photographed and add
what they know — typed or spoken — with a computer's description of the photographs revealed
afterwards for them to correct. It is a trial with two or three volunteers, separate from the
capture flow, and it never edits a record.

Decided by the maintainer on 2026-10-14, when asked:

- **Placement.** A `/contribute` page in this deployment, reusing Access sign-in and the users
  table, so it works on the museum iPad and from home.
- **Donor names.** Allowed. "Where did it come from?" is the question most likely to produce
  them, and they are often the most valuable answer. Every contribution is therefore treated as
  restricted: a volunteer reads back only their own, admins read all, and nothing goes into an
  export, the weekly snapshot or browser storage. This is the answer to the AGENTS.md "never
  without asking" rule for this page only; it changes nothing in the capture flow.
- **Voice.** Typing, with an optional recording. Audio is kept in R2 as an artefact and not
  transcribed yet, so the transcription choice is left to the voice trial in "Future direction".
- **Computer description.** The Anthropic API, called from the Worker with an
  `ANTHROPIC_API_KEY` secret, once per object and stored. Without the key the panel is simply
  not offered.

- **Deliver:**
  - A list of photographed objects, fewest answers first, with search.
  - One screen per object: large photographs, three open questions, each answerable by typing
    or recording. Saving clears the box only once the server confirms.
  - The computer's description behind a button, after the questions, labelled as an unchecked
    guess, with a fourth box for corrections.
  - Every answer records whether the description had been shown (`ai_seen`), who was signed in,
    and who the screen said was answering.
  - An admin page listing every answer with its audio and its before/after flag.
- **Validate:**
  - Unknown people get nothing; viewers can read but not answer; only admins see the review page
    and other people's answers or recordings.
  - An answer that fails to send stays on screen.
  - Leaving an object with unsaved words asks first.
  - `ai_seen` is 0 for answers saved before the reveal and 1 after, including on a later visit.
  - Nothing scrolls sideways at phone width.
- **Complete when.** It is deployed with the migration applied, two or three volunteers have
  used it in real sessions, and what they did is written up as Stage 5 feedback.

### Stage 10 — Pick lists for object type, materials and location *(proposed 2026-10-27)*

At the volunteer session on 2026-10-26 the museum asked for ready-made lists to choose from,
each with a way to add something new: object type ("What is it?"), materials ("Describe it",
several per object) and location ("Where does it live?", by room). This answers open decision 7:
the museum authors its own term lists. Choosing is quicker than typing and keeps terms
consistent; the reference copy shows what free text produces — one room appears as "Main, East
Wall, Mid Section", "Main, western wall" and "Main south west wall".

Decided by the maintainer on 2026-10-27, when asked:

- **Object types follow eHive's plural style** ("Jugs", "Cups and Saucers"), matching the
  museum's 27 existing eHive terms, so exports don't create near-duplicate terms there. The
  lists belong to the museum, not to eHive: they live in our database and stay usable if eHive
  is no longer used. The accessioning team is supplying the starting list.
- **Room and detail are two fields.** The existing `location` field keeps its id and its eHive
  mapping and becomes the room, chosen from the list. A new `app_added` field,
  `location_detail`, holds the case, wall or shelf as free text. The eHive export joins them as
  "Room, detail", matching how the museum's existing records read.
- **Any volunteer can add a term; an admin reviews it.** A new term works on the record at once
  and is marked provisional until an admin accepts it or merges it into an existing one.

How it is meant to work, so the checks below have something to check against:

- **Lists live in D1, not in the YAML.** A `vocab_terms` table: vocabulary, label, status
  (`accepted`, `provisional`, `merged`), the term it was merged into, synonyms, who added it and
  when. The YAML still decides which fields use a list, through two new keys on a field,
  `vocabulary` and `allow_new`; no new field type. Putting the terms in the YAML would mean a
  redeploy and a reseed for every new room.
- **Records keep the words, not term ids.** A value stays `"Timber"`, so a record means
  something without the table, existing records and exports are unchanged, and a merge never
  rewrites a record: it is recorded in the list and applied when exporting.
  `FieldValue.origin` gains `"picked"`, so a record shows whether a value was chosen or added.
- **Lists work offline.** Each device caches the lists in IndexedDB and refreshes them on sync.
  A term added offline is queued like a record. The server treats terms that differ only in case
  or spacing as one; true synonyms ("Wood", "Timber") wait for an admin.
- **Nothing a volunteer chose or typed disappears.** A value already on a record but not in the
  list still shows, marked as not in the list. Existing location values, which mix room and
  position, are left exactly as they are for a person to sort out.
- **Location becomes `sensitivity: internal`**, and so does `location_detail`. Nothing filters
  on `internal` yet; this marks both for the publication boundary to come. They still go to
  eHive, where location is not public either.

- **Deliver:**
  - Migration: `vocab_terms`. A seed with the team's object types, the starting materials
    (timber, metal, paper, cloth, glass, ceramic, plus what the team adds) and the rooms.
  - Schema: `vocabulary` and `allow_new` on `object_type`, `materials` and `location`;
    `location` relabelled as the room; `location_detail` added; both location fields
    `internal`. Open question 7 marked as answered.
  - One reusable control: large tappable chips, one or several, with "Not sure" where several
    are allowed, a search box when a list is long, and "+ Add" that searches before it adds.
  - `GET` the lists for any signed-in person; `POST` a provisional term for volunteers and admins.
  - A Lists page in the explorer, admins only: each list with how many records use each term,
    provisional terms first; accept, merge into another, add a synonym, hide. No delete.
  - eHive export: merges applied, materials joined into `medium_description`, room and detail
    joined into `location`. The pick-list report keeps flagging terms eHive doesn't know.
  - Help, the user manual and the volunteer slides updated for the three screens.
- **Validate:**
  - In airplane mode: pick two materials and a room, add a new material, close and reopen. All
    are on the record; the new term reaches the server as provisional after reconnecting.
  - Adding "timber " when "Timber" exists offers "Timber" instead of a second term.
  - A record captured before this stage opens with its old values intact and shown.
  - An admin merges "Wood" into "Timber": no record changes in `record_revisions`, and the next
    export says "Timber".
  - A volunteer gets 403 on accept and merge; a viewer cannot add a term.
  - Chips are at least 52px tall and nothing scrolls sideways at phone width.
  - `npm run db:seed` then `npm run db:check` show the new field count.
- **Complete when.** It is deployed with the migration and seed applied, checked signed in on
  the museum iPad and on a desk, and the accessioning team has catalogued real objects with it.
  Not to be deployed until the first fortnight of training (from 2026-10-26) has been observed,
  so the screens change once.

Not in this stage: collection categories (decision 11), page order and transcription for
many-page objects such as the Charters–Farmer Bible, and restricted photographs (see
`PROJECT_STATUS.md`, known issues).

### Stage 11 — Reviewers, and approving records *(proposed 2026-10-27)*

Records already carry a status — Draft, Awaiting review, Confirmed, Exported to eHive — and a
finished capture becomes Awaiting review (`CaptureFlow.tsx`). But nothing in the app can confirm
a record: there is no approve action anywhere, and the server accepts whatever status a device
sends, so approval is neither possible nor protected. A volunteer's first pass should not be
authoritative (the schema's note on `status`), and the design notebook makes human review the
only path to a verified record.

Decided by the maintainer on 2026-10-27, when asked:

- **Approving is its own permission, not part of admin.** Regular volunteers must not get admin
  access to be able to approve.
- **Volunteers can be flagged as reviewers.** An admin turns the flag on or off for a person;
  it sits beside their role and doesn't change it.

Confirmed by the maintainer on 2026-10-27:

- **Only flagged people approve, admins included.** An admin who should approve flags
  themselves. The list of reviewers is then exactly the people with the flag. Viewers cannot
  be flagged.
- **Nobody approves a record they captured.** Checked against both `captured_by` and
  `synced_by`, since on a shared device the first is only a claim (AGENTS.md rule 10). With two
  accessioners, each reviews the other's work.
- **Only Confirmed records go to eHive.** This also answers open decision 8: the imported
  records are Exported already, so they are no longer resent.
- **Confirming fills the paper form's "Catalogued by" sign-off.** The fields map to eHive's
  `cataloguer` and `catalogued_date`, which credit whoever did the cataloguing, so they are
  filled with the display name of the person who captured the record and the date it was
  confirmed. The reviewer is recorded in `record_reviews`, not in "Catalogued by". *(This
  reading is Claude's, put to the maintainer on 2026-10-27; change it if he meant the reviewer.)*

Proposed and not yet answered, kept as the default because it is what sync does already:

- **A changed record goes back for review.** If a confirmed record is edited later, it returns
  to Awaiting review, and the reviewer sees what changed since it was confirmed.

How it is meant to work:

- **`users` gains `can_review`** (0 or 1, default 0). Migration only adds a column; no existing
  row changes meaning.
- **Statuses become partly server-owned.** A device may send Draft or Awaiting review, and
  nothing else; the sync endpoint refuses to let a device set Confirmed or Exported. Confirming
  happens only through an explorer endpoint that checks the flag and the self-approval rule.
- **Every review is recorded and never edited.** A `record_reviews` table, append-only: record,
  revision reviewed, action (`confirm` or `return`), an optional note, the reviewer's email
  from the Access header (never from the request body), and when. Confirming also appends a
  revision, so the history shows who confirmed which version.
- **Send back with a note.** A reviewer can return a record to Draft with a short note. The
  note shows on the record in the explorer and, after the next sync, on the volunteer's own
  record list, so they know what to fix.

- **Deliver:**
  - Migration: `can_review` on `users`; the `record_reviews` table.
  - User administration: a "Can approve records" switch per person, admins only, logged in
    `access_log`.
  - An "Awaiting review" list in the explorer for reviewers, oldest first.
  - On a record, for reviewers: Confirm, and Send back with a note. Neither shown to anyone else.
  - Sync: device-sent statuses limited to Draft and Awaiting review; a confirmed record that
    changes returns to Awaiting review.
  - The volunteer's record list shows Confirmed, and a returned record's note.
  - Confirming writes `catalogued_by_name` (the capturer's display name) and
    `catalogued_by_date` (the day of confirming) into the record, as a new revision.
  - eHive export: only Confirmed records; the screen says how many are waiting for review and
    so were left out. After the file has gone to Vernon Systems, an admin marks that export as
    sent: its records become Exported, and their "Entered to ehive" tickbox is set. Editing an
    Exported record sends it back for review like any other.
  - Help, the user manual and the volunteer slides updated.
- **Validate:**
  - A volunteer without the flag gets 403 on confirm and return, and sees no buttons.
  - A flagged volunteer cannot confirm a record they captured or synced; they can confirm
    someone else's, and `record_reviews` holds their Access email.
  - A device that sends status Confirmed through sync is refused that status; the record keeps
    its server status.
  - Confirm a record, edit it on the phone, sync: it is Awaiting review again, and both
    revisions are in the history.
  - A returned record's note appears on the volunteer's phone after sync.
  - Turning the flag off takes effect on that person's next request.
  - A confirmed record's review sheet shows "Catalogued by" with the capturer's name and the
    confirmation date; the eHive file carries them in `cataloguer` and `catalogued_date`.
  - The eHive export holds only Confirmed records, never Draft, Awaiting review or Exported;
    marking it sent turns exactly those records to Exported.
  - Nothing scrolls sideways at phone width; buttons are at least 52px.
- **Complete when.** It is deployed with the migration applied, at least one reviewer is
  flagged on the live site, and a record has been captured by one person and confirmed by
  another, checked signed in on a desk and on a phone.

### Later backlog

- Voice annotation — see "Future direction: voice annotation" below.
- Collection page, if user feedback asks for it:
  - Option B: a search-first home page with recent records and a "needs attention" list.
  - Option C: a denser one-line-per-record view on a desk, or a photo grid.
  - Option D: filters by object type or location, which need tidy vocabularies first
    (decision 7; Stage 10 provides them).
- Photo metadata pull between devices.
- Registration number validation, once decision 1 is answered.
- Splitting storage and display, if decision 6 goes that way.

A backlog item is a recommendation, not an instruction to start it.

## Future direction: voice annotation

This is direction from the maintainer, recorded 2026-09-15. It is not scheduled. Development is
paused until real users have given feedback on the app as it stands, and that feedback comes
first.

**The idea.** A volunteer still works through the standard questions the app asks now, but can
talk about the artefact instead of typing. What they say becomes the record's text, and they check
it before accepting it. It would be a significant piece of work.

**Likely shape:**

- **Developed separately at first.** A prototype outside the working capture app can't disturb
  the tool volunteers rely on. It can be tried with a few volunteers before anyone decides whether
  it joins the capture app.
- **Consistent with the design already in AGENTS.md.**
  - One open question per capture group, not one per field.
  - A model splits the spoken answer across that group's fields.
  - The volunteer sees what was heard before accepting it.
  - The recording and transcript are kept, never discarded.
  - The schema already has `voice_recording` and `transcript` fields, and `FieldValue.origin` can
    record `"spoken"`.

**Questions to settle before building, not now:**

- **Offline.** The store room has no reliable signal. Record on the device and transcribe later,
  or require a connection?
- **Donor details spoken aloud.** A volunteer telling an object's story will often name the person
  who gave it. Recordings and transcripts would then hold restricted information that the app
  currently never holds.
- **Consent and retention** for recordings of volunteers' voices.
- **Accuracy** with local names (places, makers, families), with older voices, and in a room where
  others are talking.
- **Running cost** of transcription and language-model services for a volunteer museum, and who
  pays.
- **What reaches eHive.** Only the checked text, or the audio too?
- **Where it ends up.** A separate tool for good, or a mode inside the capture app once proven?

**First step, before anything is built.** The maintainer will trial existing dedicated voice
recording apps with volunteers and see what they think (planned 2026-09-15). What the trial shows
about talking versus typing, and about how well those apps transcribe, feeds the questions above.
Nothing voice-related is designed or built in this project until the trial has been written up.

During the trial, the donor rule still applies. Many recording apps send audio to their own
servers for transcription, so volunteers should talk about objects, not about the people who gave
them, and it's worth checking where each app keeps its recordings.

**What user feedback should tell us first:**

- Whether typing is really where volunteers struggle.
- Whether they would be comfortable talking to a phone in a shared store room.
- Which questions they find hardest to answer in writing.

## Open decisions

Questions 1–7 are the schema's `open_questions`, which hold the authoritative wording. When the
museum answers one, record the answer in the schema and here.

| # | Question | Why it matters | Needed before | Current assumption |
|---|---|---|---|---|
| 1 | Registration number format | Validation would catch typos, but two schemes are in use: M-numbers and `2026.007`-style numbers | Any number validation | Free text; duplicate warning only |
| 2 | Dimensions unit: mm or cm as house standard | Mixed units make eHive's measurements inconsistent | Defaulting or converting units | Volunteer chooses a unit on every record (`dimensions_units`, required) |
| 3 | The ruled line after "Unknown" on acquisition: elaboration or "Other" | Decides how acquisition method is recorded | Any work on the acquisition group | Acquisition is a restricted group, outside the volunteer flow |
| 4 | Who assigns registration numbers: the app or a person beforehand | Decides whether the app generates numbers | Any number generation | A person; the volunteer types the number from the tag |
| 5 | Do cataloguing volunteers ever touch the donor block | Privacy, and whether a committee entry screen is needed | Any donor-entry work | Volunteers never see it; not captured in the app |
| 6 | Storage and display: split the one question | eHive has separate `storage_details` and `display_details` | Changing that mapping | One question feeds `storage_details` only |
| 7 | Pick-list vocabularies: author term lists, or tidy in eHive | New spellings create duplicate eHive terms | Offering term lists in the app | **Answered 2026-10-26/27:** the museum authors lists for object type, materials and location (room); volunteers add, admins review; object types in eHive's plural style. See Stage 10. Place made and maker stay free text |
| 8 | Should the eHive export send every record, or only those changed since import | Each export currently resends the 35 imported records | The next file sent to Vernon Systems | **Answered 2026-10-27:** only Confirmed records are exported; imported records are Exported already and not resent. See Stage 11 |
| 9 | Who takes a copy of the snapshot off Cloudflare, and how often | Two copies under one account can be lost together | Relying on the snapshot as the backup | README recommends monthly; nobody assigned in any document |
| 10 | Is the slide deck generated by script, or edited by hand from now on | The deck was edited in PowerPoint after generation; re-running the script would lose those edits | The next change to the deck | Undecided; the script is documented as the source |
| 11 | Collection categories: which ones, no more than ten, one main category per object | Browsing stays manageable as the collection grows; object type is too fine (29 types across 38 records) | Any category browsing on the Collection page (Option D) | Accessioning team asked for suggestions, 2026-09-15. Starting six, from the museum's own eHive keywords: agriculture, timber and surveying; sport; tourism and hotels; wars; schools; music, crafts, household objects and factories |

## Definition of done

A stage is complete when:

- Its acceptance checks pass, and were run for this stage, not assumed.
- The volunteer journey still works offline, including empty and error states.
- `npm run typecheck` passes, and `npm run build` where the build is affected.
- No restricted field reaches a component, browser storage, the server or an export.
- Nothing a volunteer typed has been discarded or silently changed.
- If the schema changed, `npm run db:seed` has been run and `npm run db:check` agrees.
- PROJECT_STATUS.md, DEVLOG.md and, where behaviour changed, README.md describe what was actually
  built.
- If it was deployed, the live site has been checked, not just the deploy command.

## Requirement changes

| Date | Change | Reason | Reference |
|---|---|---|---|
| 2026-08-11 | Record number asked before the photograph | Stops photographs being filed against the wrong object; lets the duplicate check fire early | 544a78f |
| 2026-08-11 | Hosting moved from Render to Cloudflare, then to a Worker with D1 and R2 | Render's service cap; records needed to leave the phone | d6a3e10, 6c48ff0, 3b7fdc2 |
| 2026-09-01 | Records attributed to a registered person, not a typed name | A typed name can't be traced back to a person | 15eb490 |
| 2026-09-02 | Sign-in required for the capture app as well as the catalogue | Anyone with the address could start writing records | SYNC-SETUP.md |
| 2026-09-02 | Museum decisions: every record is History / Physical Object; description goes to eHive's public description; pick-list values flagged, not constrained | Two mandatory eHive columns had no question on the paper | 3c44782 |
| 2026-09-02 | Subjects mapped to eHive's `association_keyword`, not `Tag` | The museum's own records use it 30 times, and `tag` never | 8531c24 |
| 2026-09-03 | Volunteers can photograph objects that are already catalogued | Imported records never reach a phone, so their photographs couldn't be improved | 53d8e8d |
| 2026-09-03 | A bare `/` opens the catalogue on a desk and capture on a phone | The museum doesn't want desk users on the data-entry screen, or volunteers browsing on phones | db56401 |
| 2026-09-15 | Work tracked in stages, with this brief, a status file and a development log | A method for tracking each development stage between sessions | This file |
| 2026-09-15 | Development paused until real users have given feedback. Voice annotation recorded as the intended next major capability, possibly developed separately | The app is working well; what comes next should come from real use | "Future direction" above |
| 2026-09-15 | Pause set aside for the Collection page (Stage 8) | The list stopped showing records past the fiftieth, and got slower with every photograph | Stage 8 |
| 2026-10-14 | Stage 9: a `/contribute` trial where any volunteer adds what they know about photographed objects, typed or recorded, with an AI description revealed afterwards. Pause set aside for it. Donor names allowed in contributions, which are admin-only and never exported | Two people do all the accessioning; the knowledge is spread across many more | Stage 9 |
| 2026-10-14 | Recordings transcribed now, not after the voice trial: Parakeet run offline on the maintainer's computer, with a local word list and a quieter-stretch flag. Transcripts admin-only, append-only, shown on the review page | The first real recordings showed both engines mishear "Dorrigo", and Whisper silently drop a second speaker; the maintainer chose to build on Parakeet | Stage 9; `transcribe/` |
| 2026-10-27 | Stage 10: pick lists for object type, materials (several per object) and location by room, with room and detail as two fields. Lists held in D1 and owned by the museum; volunteers add terms, admins review; object types follow eHive's plural style | Asked for by the museum at the volunteer session on 2026-10-26; answers open decision 7 | Stage 10 |
| 2026-10-27 | Stage 11: approving records becomes its own permission. Admins flag individual volunteers as reviewers; only reviewers confirm records; devices can no longer set Confirmed themselves | Nothing in the app could confirm a record, the server trusted any status a device sent, and the maintainer does not want volunteers given admin access in order to approve | Stage 11 |
| 2026-10-27 | Stage 11 settled: only flagged reviewers approve, admins included; nobody approves their own record; only Confirmed records go to eHive (answers decision 8); confirming fills the "Catalogued by" sign-off | Maintainer's answers to the stage's proposals | Stage 11 |
