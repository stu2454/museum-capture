# Museum Artefact Capture App — working instructions

Shared instructions for any AI coding assistant working in this repository. Claude Code reads
them through `CLAUDE.md`; Codex reads this file directly. Keep them tool-neutral.

Four other files carry the rest, and each holds one kind of information:

| File | Holds | Changes when |
|---|---|---|
| `PROJECT_BRIEF.md` | Purpose, scope, the development stages and their acceptance checks, open decisions | Requirements change — record the decision |
| `PROJECT_STATUS.md` | Where things stand now: stage table, known issues, latest validation, next task | After any meaningful work |
| `DEVLOG.md` | Dated history of what changed, why, and how it was checked | Append after meaningful work |
| `README.md` | How a person installs, runs and uses the app | Setup or behaviour changes |

This file holds what stays true: how the app is meant to behave, the rules that protect the
museum's data, and the traps already fallen into. Current state goes stale, so it does not
belong here — put it in `PROJECT_STATUS.md`.

## Begin each session

1. Read `PROJECT_STATUS.md`, then the latest entries in `DEVLOG.md`. Read `PROJECT_BRIEF.md`
   when the task touches scope or a stage.
2. Check the branch, `git status` and recent commits. Preserve uncommitted work — the
   maintainer's own edits (the slide deck, for instance) arrive this way — and say what you found.
3. Check the code before trusting a note about it. If a document and the code disagree,
   investigate and record the difference; don't silently pick one.
4. Work on the task you were given. Backlog items and the "next recommended task" are context,
   not permission.

## Development stages

Work is tracked in **stages** (the project starter template calls them milestones). Each stage
is defined once in `PROJECT_BRIEF.md`: what it delivers, how to check it, when it counts as
complete. Its current state — proposed, in progress, blocked, complete — lives only in the stage
table in `PROJECT_STATUS.md`.

- Start a stage only when asked, and only once its acceptance checks are written down.
- A stage is complete when the brief's definition of done is met, not when the code compiles.
- Adding, dropping or reshaping a stage is a requirement change: record it in the brief's change
  log with the date and the reason.

## Work within the agreed scope

- Keep changes focused on the requested outcome, in the existing stack and conventions.
- When the museum's practice is unclear, ask. Don't resolve an open decision by picking
  something sensible (see "Decisions the museum still has to make").
- Nothing that costs money, is exposed publicly, or can't be undone — a new service, a
  destructive migration, a hard delete — without the maintainer's say-so.
- Never write credentials into code, documents or logs. See "Redact everything before printing
  it" below; that lesson has already cost two key rotations.
- `npm run deploy` publishes straight to the site volunteers use. Treat it as publishing.

## Validate the result

There is no automated test suite and no linter. What exists:

- `npm run typecheck` — app and worker. Must pass for any code change.
- `npm run build` — for anything touching the build, the service worker or assets.
- UI changes: look at the result in a browser, at phone width as well as desk width.
- `public/sw.js`: re-test the update handover in a headless browser (see the service worker
  section). Reasoning about it has been wrong before.
- Schema changes: `npm run db:seed`, then `npm run db:check`. The export reads the schema from
  D1, not from the repo.
- Anything that moves records or photographs: check the data afterwards — counts, checksums,
  exactly one primary photo per record — not just that the command exited cleanly.
- Documentation-only changes need an accuracy and link check, not a build.

Never report a check as passed unless it ran and passed in this session. Say which results are
fresh and which are historical.

## Keep the project memory

After meaningful work, before handing over:

1. Update `PROJECT_STATUS.md` — stage table, known issues, latest validation, next task.
2. Append a dated entry to `DEVLOG.md`: what changed and why, how it was checked, what's left.
3. Update `README.md` if setup, commands or volunteer-facing behaviour changed.
4. Record requirement changes in `PROJECT_BRIEF.md`. Record the museum's answer to an open
   question in the schema's `open_questions` and in the brief.
5. Commit the documentation with the work it describes.

Keep the status file a snapshot short enough to read every session, and the log in date order.
Neither is a transcript. Commit messages here are already detailed; the log summarises them and
cites the commit rather than copying them out.

## Finish accurately

- Say which state the work is in: local, committed, pushed, or deployed. They are different.
- A deploy is not verified until the live site has been seen working. `npx wrangler deployments
  list` shows what was deployed and when; it does not show which commit.
- Report failures and limitations plainly, and name the next useful step without implying it
  has been approved.

---

# About the app

## What this is

A web app that walks a museum volunteer through cataloguing an artefact: photograph it,
answer prompts, produce a structured record. It replaces a two-page paper worksheet.

It is **schema-driven**. Every field, prompt, option and grouping comes from
`schema/worksheet.v2.yaml` at runtime. There are no hardcoded field names in the UI.
If you find yourself typing `"registration_number"` into a component, stop — the change
belongs in the schema.

It is now **two apps in one deployment**, served by one Cloudflare Worker:

- **The capture app** (`/`) — for a volunteer holding an object. Offline-first, IndexedDB,
  syncs in the background.
- **The explorer** (`/explore`) — for looking records up, and for administering users and
  removals. Requires an identified, authorised person.

**A bare `/` decides which of the two to open** (`src/landing.ts`). A wide screen with a fine
pointer gets the catalogue; anything else gets the capture flow. The museum does not want
volunteers browsing records on a phone, and a laptop opening on the data-entry screen was
sending every desk visit somewhere it wasn't wanted.

That guess is a default, never a rule: screen size is decent evidence and poor proof, since an
iPad with a keyboard looks like a desk and a small laptop window looks like a phone. Crossing
between the halves deliberately is remembered per device and beats the guess from then on.
Don't make it a rule — a volunteer stuck on the wrong half with no way across is worse than a
guess that is occasionally wrong.

They are kept apart on purpose: the capture flow stays free of search UI, and the explorer
never risks someone accidentally editing a record.

## The critical context: this museum uses eHive

The paper worksheet is Appendix 1 of the **eHive Cataloguing Guidelines (July 2023)** —
it's eHive's own form, and the last tickbox on it is "Entered to ehive". The museum is
already on eHive (Vernon Systems), whose object model follows the Spectrum standard.

This means:
- We are **not** inventing a data model. We are building a better front door to one that
  already exists.
- The end goal is a record that lands in eHive cleanly — via their import spreadsheet
  initially, via their REST API later.
- **The mappings are now verified** (2026-09-02) against `ehive_import_spreadsheet - march
  2026.xlsm`, the current import workbook from https://info.ehive.com/importing-data/. Every
  `mapping.ehive` value is a real column in its Object Data sheet or a real entry in its
  Fieldnames sheet. Re-verify when eHive publish a new one — the filename carries its month.
- **There is no write API.** eHive's API is OAuth 2.0 and returns *public fields only*, for
  reading and publishing. Imports are run by Vernon Systems staff against a test server, from
  a spreadsheet sent by email or Dropbox, with images sent separately. So the export produces
  a file a person sends. Don't design for an automated push; it doesn't exist.

## Scope

What is built, what is deliberately left out, and the stages ahead are in `PROJECT_BRIEF.md`.

**Never without asking**
- Anything that puts donor personal information in the volunteer flow. See below.

## The volunteer flow

Ten **capture groups** are defined in the schema, in the order a person naturally handles an
object — not the paper's field order, which is filing order. Eight are volunteer-facing;
the last two are `restricted: true` and sit outside the flow entirely.

```
Record number  →  Photograph  →  Identify  →  Describe  →  Measure
               →  Condition  →  Origin  →  Story  →  Where it lives  →  Review
```

(The photograph step is a step in `CaptureFlow`, not a capture group. The eight groups are
`number`, `identify`, `describe`, `measure`, `condition`, `origin`, `story`,
`collection_management`; the two restricted ones are `acquisition` and `signoff`.)

The number comes first because volunteers work from objects that already carry a Dorrigo
register number on a tag. Knowing which record you're on before you shoot stops photographs
being filed against the wrong object, and lets the duplicate check fire before anyone has
done ten minutes of work.

Design intent for the eventual voice phase: the volunteer answers **one open question per
group**, speaking freely, and a model splits that answer across the group's fields. Do not
build one voice prompt per field — that's an interrogation, and volunteers will stop after
five. The per-field `voice_prompt` values exist as fallbacks for re-asking a specific gap.

## Donor information is restricted — this matters

Fields marked `sensitivity: restricted` are donor name, address, email, phone and tax
incentive number. These are living people's personal details.

Rules:
- Do not show them in the volunteer capture flow.
- Do not put them in browser storage alongside object data.
- Do not include them in any export, share link or backup that object records go into.
- **Do not let them leave the device.** `sync.ts` strips them before a record is sent.
- They belong with the deed of gift, entered by a committee member, linked to the object
  record by id only.

In a volunteer-run museum, records get emailed around and copied onto USB sticks. Design as
if that will happen, because it will. Now that records also reach a server, the same applies
to the database and the weekly export.

## Schema conventions you need to know

44 fields, in 6 printed sections and 10 capture groups.

| Key | Meaning |
|---|---|
| `label` | Verbatim from the paper. Never edit. Volunteers recognise the paper wording. |
| `display_label` | Same thing with the trailing colon stripped. **Use this in the UI.** |
| `source` | `printed` = on the form. `inferred` = we grouped it. `app_added` = new. |
| `sensitivity` | `public` / `internal` / `restricted`. Gates visibility and export. |
| `capture_group` / `capture_order` | Drives the app flow. |
| `order` / `page` | Where it sat on paper. For traceability only — don't drive UI from it. |
| `autofill` | App sets this, don't ask the volunteer. |
| `mapping.ehive` | Verified against the March 2026 import spreadsheet. `NOT_EXPORTED` means considered and deliberately withheld; `null` means the field has no eHive counterpart at all (app internals). |

Three types were added beyond the original vocabulary: `fuzzy_date`, `image`, `audio`.

**`fuzzy_date` is not a date picker.** Museums record "c. 1890", "1920s", "before the war",
"unknown". A date picker forces a volunteer to invent precision they don't have, and invented
precision in a catalogue is a lie that outlives everyone who could correct it. Free text,
with optional parsing to a year range for searching — never overwrite what they typed.

The schema is also stored **in the database**, seeded by `npm run db:seed`. A row saying
`{"materials":["wood","iron"]}` means nothing in twenty years without the field definitions,
so every weekly export bundles a copy of the YAML it was written against.

## Decisions the museum still has to make

Seven questions are recorded in `open_questions` in the schema, which holds the authoritative
wording. `PROJECT_BRIEF.md` lists them with what each one holds up and what the app assumes in
the meantime, alongside the project decisions that aren't schema questions. Don't resolve any of
them by picking something sensible — ask, and record the answer in the schema and the brief.

## The stack

Vite + React + TypeScript, PWA, on Cloudflare Workers. Rationale, so you can argue with it:

- **PWA with offline-first storage.** A country museum's back room is where wifi goes to die.
  A volunteer who loses twenty minutes of work to a dropped connection does not come back
  next Saturday. Records save locally and sync later.
- **IndexedDB, not localStorage** — photos are too big for localStorage.
- **IndexedDB stays the working copy even now there is a server.** Sync is a background
  convenience, never a precondition for cataloguing.
- **Cloudflare for the server side.** D1 for records, R2 for photographs and export
  snapshots, Access for sign-in. One deployment, one bill, no login form to maintain.
- **Big touch targets, high contrast, adjustable text.** The volunteers are frequently
  retired and often working in poor light while holding something fragile.

## Working style

- Boring, readable code. The person maintaining this is not a full-time developer and may
  be handing it to someone with even less experience.
- One screen, one job. Volunteers are not power users.
- Never silently discard what someone typed or said. If a value doesn't parse, keep the raw
  text and flag it for review.
- When the museum's practice is unclear, ask. Cataloguing conventions are institution-specific
  and expensive to unpick after a few hundred records exist.

---

# Implementation notes (this repo)

## Commands

```bash
npm install
npm run dev              # http://localhost:5173
npm run dev:https        # for device testing — Home Screen and the SW need HTTPS
npm run build            # tsc -b && vite build -> dist/
npm run typecheck        # app AND worker; both must pass
npm run deploy           # build, then wrangler deploy

npm run db:migrate:local # try migrations locally first
npm run db:migrate       # then for real
npm run db:seed          # load the schema YAML into the database — don't skip this
npm run db:check         # schema version and field count as the server sees them
npm run db:errors        # last 20 sync errors, by device
npm run db:records       # last 20 records to arrive
```

`SYNC-SETUP.md` has the one-time Cloudflare setup: creating D1 and R2, and putting Access in
front. Read it before deploying to a new environment.

## Where things live

```
AGENTS.md                  Working instructions for any AI assistant. CLAUDE.md imports it.
PROJECT_BRIEF.md           Purpose, scope, development stages, open decisions.
PROJECT_STATUS.md          Where things stand now, and the next task.
DEVLOG.md                  Dated history of changes and how each was checked.
schema/worksheet.v2.yaml   THE SOURCE OF TRUTH. Change what's asked here, not in components.
src/schema.ts              Loads and slices the schema. The only module that reads the YAML.
src/types.ts               TS mirror of the schema. Keep in step with the YAML.
src/db.ts                  IndexedDB: records + photo blobs.
src/media.ts               Photo downscaling on intake, file download.
src/export.ts              JSON export, for a device. The eHive export is worker/ehive.ts.
src/storage.ts             iOS seven-day storage cap: detection and persistence request.
src/sync.ts                Offline-tolerant client sync queue. Strips restricted fields.
src/identity.ts            Who is signed in, who is cataloguing, and the registered roster.
src/landing.ts             Which half of the app a bare "/" opens, and remembering a choice.
src/avatars.ts             The badge palette. Names are stored; hex values live here only.
src/App.tsx                Routes /explore to the explorer; runs the background sync loop.
src/components/
  CaptureFlow.tsx          Step machine: photos -> capture groups -> review.
  FieldInput.tsx           One branch per schema field type.
  PhotoStep.tsx            Camera intake, primary image selection.
  ReviewSheet.tsx          Record read back in PAPER order, as the printed form.
  RecordList.tsx           Home screen, backup status line, sync warning banner.
  AccessionTag.tsx         The tag header.
  Help.tsx                 In-app manual. Four tabs. Mirrors the capture groups.
  StorageNotice.tsx        "Add to Home Screen" prompt on iOS.
  Cataloguer.tsx           Who is cataloguing. States the signed-in identity; picker
                           for shared devices; your own name and colour.
  WhoBadge.tsx             The corner badge, and the Avatar disc the picker reuses.
src/explorer/
  Explorer.tsx             Search and list. Admin tabs when the role allows.
  RecordView.tsx           One record, its photographs, and admin removal.
  RemovePanel.tsx          Removal with a reason. Restore.
  UserAdmin.tsx            Add and remove users, set roles.
  api.ts                   Explorer data access.
  EhiveExport.tsx          Prepare the eHive file; import eHive's records. Admins only.
  AddPhotos.tsx            Photograph an object already catalogued. Volunteers and admins.
  photoQueue.ts            Holds those photographs in IndexedDB until they can be sent.
worker/
  index.ts                 Entry. Routes /api/*, serves assets, runs the weekly export cron.
  api.ts                   Sync and photo endpoints, for devices.
  explorer.ts              Explorer, user admin, eHive export and import. Read its header.
  ehive.ts                 Builds the eHive import file; maps eHive's records back to ours.
migrations/                D1 schema, in order. Each file's header explains why it exists.
seeds/                     Data, not schema. Kept OUT of migrations/ because wrangler treats
                           everything in there as a migration and ordered a seed before the
                           migration that created its table.
scripts/seed-schema.mjs    Turns the YAML into the seed SQL for db:seed.
scripts/import-ehive-xml.mjs  Turns an eHive XML report into seeds/seed-ehive.sql.
scripts/attach-ehive-images.mjs  One-off: matches eHive's photographs to records and
                           uploads them. macOS only (uses sips). Read its header before reuse.
docs/ehive-import-fields.tsv  Every field eHive's import workbook can carry, for reference.
docs/artefact-catalogue-for-volunteers.pptx  Slides for a volunteer briefing. Rebuild with
                           `python3.11 scripts/build-volunteer-deck.py` rather than editing the
                           .pptx by hand, or the next change loses the previous one.
```

## Rules that are easy to break by accident

1. **No hardcoded field ids in components.** `FieldInput` switches on `field.type`, never on
   `field.id`. The two exceptions are in `CaptureFlow` (`registration_number` drives the tag)
   and `RecordList` (`object_name` is the record's display name) — both are deliberate, both
   are commented. Don't add a third without a reason.
2. **Capture order vs paper order.** The flow uses `capture_group`/`capture_order`. The review
   sheet uses `page`/`order`. That's not an inconsistency: doing the work and checking the
   work want different orders.
3. **Restricted fields never reach a component, and never leave the device.**
   `volunteerFields()` and `printedFieldsInSection()` filter them out at the schema layer,
   `toBundle()` strips them again on export, and `sync.ts` strips them before anything is
   sent to the server. Keep all four.
4. **Autosave on every change.** `CaptureFlow` writes to IndexedDB in an effect. Don't
   replace it with a save button.
5. **Never discard what someone typed.** `FieldValue` carries `raw` alongside `value` for
   exactly this. If a value won't parse, keep the text and flag it. **This applies to reading
   as well as writing**: a field holding only `raw` is not empty, it is unparsed, and anything
   filtering on `value` alone will hide it. That is how the museum's own measurements went
   missing from every imported record — eHive keeps them as one line of prose, the import had
   nowhere structured to put it, and so dropped it entirely instead of keeping the sentence.
6. **Sync must never block cataloguing.** No error from `sync.ts` should surface as something
   a volunteer has to act on. They're holding an object, not debugging a connection. The one
   thing that does surface is a quiet banner after sync has been failing for hours.
7. **Nothing is ever really deleted.** Every save appends to `record_revisions`; removal is a
   soft delete with an actor and a reason, and it can be restored. Don't add a hard delete.
8. **A photograph is never uploaded straight from the camera.** Both the capture app and the
   explorer write the blob to IndexedDB first and send it afterwards. The explorer's version
   looks like it could skip that — it reads everything else from the server — but the person
   holding the phone is inside a museum, and a photograph of an object already put back on its
   shelf cannot be retaken. `src/explorer/photoQueue.ts`.
9. **Exactly one primary photo per record.** `putPhoto` demotes the others when a photograph
   arrives marked primary, and `setPrimaryPhoto` does it in one batch. Two images both claiming
   to be the main one means the catalogue picks between them on whatever a query happens to
   order by.
10. **Two identities on a record, and only one of them is trustworthy.** `captured_by` is an
   email the device chose from the registered roster — on a shared museum device that is a
   claim, not proof. `synced_by` is written by the Worker from the Access header on the
   request that carried the record. Never populate `synced_by` from the request body, and
   never merge the two into one column: the gap between them is the shared-device case, and
   collapsing it invents a certainty the museum doesn't have.

## The server side

Read the header comments in `worker/explorer.ts` and `migrations/0003_users_and_access.sql`
before changing anything here. In short:

- **Authentication is Cloudflare Access, in front of the Worker.** It verifies the person's
  email by one-time PIN and passes it in `Cf-Access-Authenticated-User-Email`. There are no
  passwords in this application and none should ever be added.
- **Authorisation is the `users` table.** Being able to receive a PIN is not permission to
  enter the collection — the Access policy is deliberately broad so that admins add people
  in the app rather than in the Cloudflare dashboard. Both checks are required.
- **A missing identity header is refused, not waved through** (`worker/api.ts`). That was a
  fix, not an oversight: skipping the check when the header was absent was only safe while
  Access covered every path.
- **The whole model rests on one assumption**: Access sits in front. If the Worker is ever
  exposed without it, anyone can set that header themselves.
- **Access must cover the whole site, not just `/explore` and `/api`.** The capture app used
  to be reachable without signing in, which meant anyone with the address could start writing
  records. It is now gated like everything else, and the app refuses to start a record it
  cannot attribute to a registered person.
- **`PATCH /api/me`** is the only self-service write in the system. A person may change their
  own `display_name` and `avatar_colour` and nothing else — never a role, never a status,
  never another person's row, which the handler guarantees by binding the caller's own
  verified email into the `WHERE` clause rather than by checking a field. Self-service that
  can grant permissions isn't self-service. It exists because an admin's typo in someone's
  name was otherwise uncorrectable by the person whose name it is, and that name goes on
  every record they catalogue.
- **Badge colours are stored as palette names** (`sage`), never hex. The values live in
  `src/avatars.ts` and the allowlist is duplicated in `worker/explorer.ts` — keep the two in
  step. Storing a name means the palette can be restyled without touching a single row, and
  an allowlist of ten known words is a cheaper guarantee than escaping downstream.
- **`ehive_records` is a reference copy, not catalogue.** The museum's existing eHive records,
  loaded from an XML report they download from their own account. Read-only, never shown as
  collection records, never editable: eHive stays master of what eHive already holds, which
  matters because there is no write API to resolve a disagreement with. It exists to answer
  "does this term already exist?" and, later, "is this object already catalogued?". Each row
  keeps eHive's `object_record_id`, which written into column C of the import spreadsheet
  updates that record instead of creating a second one.
- **`/api/people`** returns the active roster — email and display name only — to any
  authorised user, because the capture app's picker is useless without it. Roles, sign-in
  times and who-added-whom stay in `/api/users`, which is admins only.
- **Roles** are `admin` / `volunteer` / `viewer`. Removal, restore and user admin are
  admins-only. The first person through the door becomes admin, and only while the users
  table is empty — a bootstrap, not a back door.
- **Sync is scoped to the device.** A phone pulls back only what it captured. Every device
  used to receive every record, which slowly filled each phone with the whole collection.
- **Batches are capped at 20 records** because D1's free plan allows 50 queries per
  invocation and each record costs two statements. The client pages through anything larger.
- **The weekly cron writes a snapshot to R2** (01:00 Monday AEST) — CSV, JSON, revisions,
  photo checksums, the schema, a manifest and a plain-English README. D1's point-in-time
  recovery is only 7 days on the free plan, so this is what actually makes the catalogue
  durable. Still get a copy off Cloudflare periodically; two copies on one platform under
  one account is one lapsed billing away from zero copies.

## The eHive round trip

Verified and built on 2026-09-02. The details that took longest to establish, so nobody has
to establish them twice:

**There is no write API.** eHive's REST API is OAuth 2.0, read-only for records, and in
practice returns only the account's public records (see "Private records" below). Imports are
run by Vernon Systems staff against a test server, from a spreadsheet emailed or Dropboxed to
them with images alongside. The last step is a person. Don't design around an automated push.

**Records come out of eHive as an XML report**, downloaded by an account holder from their own
account. `scripts/import-ehive-xml.mjs` turns one into `seeds/seed-ehive.sql`, which fills
`ehive_records` — a read-only reference copy, not catalogue. `POST /api/import/ehive` then
turns that into real records, idempotent on eHive's `object_record_id`.

**`object_record_id` is what makes the round trip safe.** Written into column C of the import
spreadsheet it means "update this record". Without it, every export after an import would
create a duplicate of every imported object.

**Six of our free-text fields are pick lists in eHive**, where a value that doesn't exactly
match an existing term creates a new one. The export reports every value with `known: true`
or `false`, checked against `ehive_terms` — the real vocabulary from the museum's own records.
Flagged, never corrected: changing what a volunteer typed without telling anyone is the one
thing this app doesn't do.

**Two mandatory columns the paper worksheet has no question for**, held in
`ehive_export.constants`: Record Type `History` and Dublin Core `Physical Object`. Confirmed
against the museum's own records — all 35 are `perspective="HISTORY"`.

**Their data corrected one of our mappings.** Subjects were mapped to the spreadsheet's `Tag`
column; the museum's records use `association_keyword` 30 times and `tag` not once. When a
mapping is arguable, their existing practice settles it — that is what `docs/ehive-import-fields.tsv`
and the reference copy are for.

### The API, and how to authenticate against it

Access granted 2026-09-02 on goodwill by eHive's manager. The key is configured for account
public **and** private data, but in practice only the 35 public records come back — see
"Private records" below. Keys live in `.dev.vars` locally (gitignored) as `EHIVE_CLIENT_ID`,
`EHIVE_CLIENT_SECRET`, `EHIVE_TRACKING_ID`.

**The published documentation does not describe the handshake correctly.** What follows was
read out of the PHP client's `Transport.php`, and cost most of an afternoon of 401s:

1. `POST https://ehive.com/api/oauth2/v2/authorize`, no body, with headers
   `Authorization: OAuth` (the literal string), `Client-Id`, `Client-Secret`,
   `Grant-Type: client_credentials`. Answers **303** with an `Access-Grant` header.
2. **`GET`** `https://ehive.com/api/oauth2/v2/token` — a GET, despite being a token exchange —
   echoing back the four headers the 303 returned. Answers `{"oauthToken": …}`.
3. Every API call: `Authorization: Basic {oauthToken}`, `Client-Id`,
   `Grant-Type: authorization_code` — the grant type **changes** between steps — and the
   **trackingId as a query parameter**, not a header. As a header it returns 403 "missing a
   tracking ID", which is a maddening way to say "wrong place".

No username or password is involved at any point. If you find them in `.dev.vars`, delete them.

**Endpoints that work, and one that doesn't:**

- `GET /api/v2/accounts/7417/objectrecords?limit=100` — all records, **primary image only**.
- `GET /api/v2/objectrecords/{objectRecordId}` — one record, **every image**, six sizes up to
  `image_l` (697×800). Note the path: `/accounts/{id}/objectrecords/{id}` is a 404.
- Field identifiers match the XML report exactly (`measurement_description`, `credit_line`…),
  so the existing mapping applies unchanged.

**Redact everything before printing it.** eHive echoes request headers back in error bodies,
including credentials. During this work a client secret and then a base64 Basic auth header
were printed into a transcript and had to be rotated — the second because the redaction
filter covered the plaintext values but not the encoded form. Any filter here must cover
base64 of each secret and of `user:password`, not just the literals.

**Private records.** eHive's dashboard for account 7417 reports 66 object records: 35 public,
31 private. The API returns exactly the 35 public ones, and so did the detailed XML report. The
key is configured "Account — public and private data (oAuth only)" and the OAuth flow works, so
it is not obviously a permissions problem. Tried, and none widened the result: `content=all`
and `detailLevel=full` (both error), `defaultContent=all`, `publicAccess=0`,
`includePrivate=true`, and `/accounts/objectrecords` without an id (404). Don't repeat them;
the question is with eHive, and tracked in `PROJECT_STATUS.md`.

**`publicAccess: 0` does not mean private.** Every record the API returns carries it, and those
are the *public* 35 — their pages render on ehive.com to an anonymous browser. An earlier note
claimed all 35 were unpublished and that the API would have returned nothing without private
access. Both were wrong. Whatever the field encodes, don't build on a reading of it until eHive
explain it.

**Still read-only for records.** The NSTP spec at apidocs.ehive.com confirms it: 23 operations,
of which the only writes are adding a comment and adding or deleting a tag. Getting records
*in* is still the spreadsheet, run by Vernon Systems staff.

### Traps, all of which have already bitten once

**The export reads the schema from D1, not the repo.** Change `worksheet.v2.yaml` and you must
run `npm run db:seed`, or the export silently builds against the old mappings and produces
plausible, wrong output. This cost two debugging rounds in one afternoon.

**Object numbers do not identify records.** eHive holds two different objects numbered `M1723`
and one record with no number at all. Anything matching on object number alone — photographs
especially — will silently mis-assign. The photographs were resolved by comparing each file
against the images embedded in eHive's own PDF report, where every image sits on its record's
page.

**`sips -Z` enlarges as well as shrinks.** It inflated a 378px photograph to 2000px, inventing
pixels. Resize only when the source exceeds the maximum, as `src/media.ts` already does.

**Seeds must not live in `migrations/`.** Wrangler treats everything in that directory as a
migration and ordered a seed *before* the migration creating its table. `migrations/seed-schema.sql`
still has this hazard and should move to `seeds/`.

**Registration numbers use two schemes, not one.** eHive's dashboard shows `2026.007`–`2026.011`
alongside M-numbers. Every record we hold is an M-number, which is why an `M`+digits validation
rule looked plausible — it would have rejected every record catalogued this year. Don't add
number validation until the museum answers the open question.

### Re-running the photograph script

`scripts/attach-ehive-images.mjs` takes a folder per artefact as well as a loose file, skips
anything already attached by checksum, and names photographs by content hash so a re-run
overwrites rather than accumulates. Ambiguous folder names go in its `EXPLICIT` map — object
numbers do not identify records here. Files held back while the museum checks a number sit in
its `HOLD` list; take them out and re-run once the number is confirmed.

What is still undone on the eHive side — the records we can't see, photographs held back,
eHive's own data errors, harvesting through the API — is tracked in `PROJECT_STATUS.md`.

## Deliberately not built

- **The eHive round trip's last step is a person.** The export builds the file; a human emails
  it to Vernon Systems, who run it. Nothing automates that and nothing can — see the eHive
  section above. `src/export.ts`'s `ehiveExportReady` flag is now vestigial; the real export
  lives in `worker/ehive.ts`.
- **Voice capture.** The structure is there — `capture_groups` each carry one open
  `voice_prompt`, `FieldValue.origin` can already record `"spoken"`, and the schema has
  `voice_recording` and `transcript` fields. The flow to build: record one answer per group,
  transcribe, have a model split it across that group's fields, then show the volunteer what
  it heard before accepting. Do not build one voice prompt per field.
- **Photo metadata pull.** A record opened on a second device doesn't know which images exist
  elsewhere. `fromWire` deliberately leaves local photos alone rather than clobbering them.
- **Audio and table field types.** `FieldInput` has no branch for them yet; nothing in the
  volunteer flow uses them.

## Mobile behaviour that is easy to break

- **Two file inputs, not one.** iOS Safari ignores `capture` when `multiple` is also set. A
  single combined input silently degrades to the library picker on iPhone and iPad. Keep the
  camera input (`capture`, no `multiple`) and the library input (`multiple`, no `capture`)
  separate.
- **EXIF orientation.** Phones store rotation as metadata. `createImageBitmap` is called with
  `imageOrientation: "from-image"`; the `<img>` fallback applies it natively. Drop either and
  artefacts come out sideways.
- **HEIC.** iPhones shoot HEIC. Safari decodes it and the canvas re-encodes to JPEG, which is
  what we want. If decoding fails the original file is kept rather than the photo being lost.
- **Secure context.** `npm run dev:https` for device testing. Add to Home Screen, the service
  worker and (later) the microphone all need HTTPS. The camera file input does not.
- **apple-touch-icon must be PNG.** iOS ignores SVG for home-screen icons.
- **The iOS seven-day storage cap.** Safari can clear IndexedDB after seven days of Safari
  use without a visit — taking every unsynced record with it. A home-screen web app isn't
  "in Safari" and keeps its own counter, which is why `StorageNotice` nags about installing.
  See the header of `src/storage.ts`. Sync reduces this risk a great deal; it doesn't remove
  it, because anything captured between syncs still lives only on the device.

## The service worker, and why it is split two ways

`public/sw.js` is the only thing standing between a deploy and a volunteer's phone. Get it
wrong and a fix never arrives: the app keeps serving its cached self, and the only remedy in
the field is clearing site data — which also destroys every record not yet exported.

So the strategy is deliberately split:

- **The page is network-first**, falling back to cache when there is no signal. This is what
  makes a deploy reach a device that has already opened the app.
- **`/assets/*` is cache-first.** Vite content-hashes those filenames, so a changed file
  always arrives under a new name and a cached one can never be stale. They are the big
  files, and serving them from disk is what makes the app open instantly.
- **Everything else** (icons, manifest) is stale-while-revalidate.
- **`sw.js` itself is never intercepted.** The browser needs a straight answer from the
  network to notice an update.

Do not make the page cache-first "for speed". That is the bug this replaced.

If the caching behaviour changes, bump `CACHE`. `activate` deletes every cache that isn't the
current name, and that sweep is how a device with a broken cache recovers.

Verified in a real browser, not by reasoning: a device carrying the old cache-first worker
recovers after **two** opens (the first installs the new worker, the second serves fresh
content), and thereafter a redeploy lands on the **first** reload. Offline still works
throughout. Re-test with a headless browser if you touch this file — the handover is
asynchronous, and fixed timeouts will lie to you.

Two things are never cached, and both exist because a signed-out request does not fail —
Cloudflare Access answers it `200` with a sign-in page:

- **`/api/*` is never intercepted.** A cached record list can show a record that has been
  removed, and a cached sign-in page would sit where data should be.
- **A redirected response is never stored.** This is the one that would be unrecoverable in
  the field: an expired session redirects the page itself to Cloudflare, and caching that as
  the app shell leaves the device opening on a login screen with no way back except clearing
  site data — which destroys unexported work. Both `networkFirst` and `staleWhileRevalidate`
  check `response.redirected` before they put anything in the cache. Don't remove that check
  while Access sits in front of the app.

## Design direction

Registration ink, archival board, and the brass tie-on tag. The accession tag header is the
one loud element; everything else stays quiet. 18px base text, 52px minimum touch targets,
no fonts fetched over the network (the store room's wifi can't be relied on), reduced motion
respected.

The review screen deliberately looks like the paper worksheet. Volunteers know that form —
reading a record back in its shape is how they can tell whether it's right.
