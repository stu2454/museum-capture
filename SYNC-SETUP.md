# Sync and the durable store — setup

**This is a record of how the server side was set up, not a to-do list.** It is all
built, deployed and running. Read it to understand the shape of things, or to
rebuild them somewhere else.

## Cloudflare Access

Access covers the **whole hostname** — an empty Path on the application. The capture
app at `/` was reachable without signing in until 2026-09-02; it no longer is, and
the app refuses to start a record it cannot attribute to a registered person.

Zero Trust → Access → Applications → Self-hosted →
`museum-capture.stu2038.workers.dev`, Path empty → email one-time PIN.

Two things depend on that being whole-host rather than path-scoped:

- **The manifest must send credentials.** `index.html` carries
  `crossorigin="use-credentials"` on the manifest link. Without it the manifest is
  fetched with credentials omitted, gets redirected to the login page, and Add to
  Home Screen silently produces a nameless bookmark — which is precisely the thing
  that does *not* survive iOS's seven-day storage sweep.
- **The service worker must never cache a redirect.** An expired session answers
  200 with a sign-in page; caching that as the app shell would leave a device
  opening on a login screen with no cure but clearing site data.

Authentication is Access; authorisation is the `users` table. Both must say yes.
The login page also offers a *Sign in with Cloudflare* button, which no volunteer
has an account for — the app's own wording tells them to ignore it and use the
email box.

## Then

```bash
npx wrangler d1 create artefact-catalogue     # paste the id into wrangler.jsonc
npx wrangler r2 bucket create artefact-photos

npm run db:migrate:local                       # try it locally first
npm run db:migrate                             # then for real

npm run deploy
curl https://museum-capture.stu2038.workers.dev/api/health
```

## Load the schema — don't skip this

```bash
node -e "
const fs=require('fs');
const yaml=fs.readFileSync('schema/worksheet.v2.yaml','utf8').replace(/'/g,\"''\");
fs.writeFileSync('/tmp/seed.sql',
  \"INSERT OR REPLACE INTO schema_versions (version, yaml, field_count, source_form) VALUES (2, '\"+yaml+\"', 44, 'eHive Cataloguing Guidelines - July 2023');\");
"
npx wrangler d1 execute artefact-catalogue --remote --file=/tmp/seed.sql
```

This stores the field definitions in the database itself. A row saying
`{"materials":["wood","iron"]}` means nothing in twenty years without them, and
every export bundles a copy so the snapshot can be read without this repo.

## What changed in the app

| File | Change |
|---|---|
| `worker/index.ts` | New. Routes `/api/*`, serves assets otherwise, runs the weekly export. |
| `worker/api.ts` | New. Sync and photo endpoints. |
| `migrations/0001_initial.sql` | New. The schema. |
| `src/sync.ts` | New. Offline-tolerant client queue. |
| `src/storage.ts`, `src/components/StorageNotice.tsx` | New — these were in the hardening patch but hadn't been applied. See below. |
| `wrangler.jsonc` | Added `main`, the `ASSETS` binding, D1, R2, cron. |
| `src/types.ts` | `syncedAt`, `revision`, `PhotoMeta.uploadedAt`. |
| `src/App.tsx`, `RecordList.tsx` | Sync loop, backup status line, storage notice. |
| `render.yaml` | Deleted — dead config from the old host. |

## The iOS storage warning that was missing

`sw.js` and `_headers` from the hardening patch made it in; `storage.ts` and
`StorageNotice.tsx` didn't. That's the one that can lose work: iOS clears
script-writeable storage, IndexedDB included, after seven days of Safari use
without a visit to the site. A volunteer who catalogues one Saturday and returns
a fortnight later is in range.

It's now added. On iOS, when the app isn't installed to the Home Screen, the home
screen shows a short instruction to add it — a home-screen web app isn't "in
Safari" and keeps its own use counter, so the seven-day tally never accrues.

Sync reduces this risk a great deal, since records reach the server. It doesn't
remove it: anything captured between syncs still lives only on the device.

## Routing, so it isn't a surprise later

Static assets are matched first; anything left over invokes the Worker. `/api/*`
never matches a built file, so it reaches the handler. Every other path is served
from `dist/` exactly as before — the app's behaviour is unchanged.

## What the weekly export writes

To R2 under `exports/catalogue-YYYY-MM-DD/`:

```
records.csv     flattened, opens in Excel, will outlast any software
records.json    full structure
revisions.json  every earlier version of every record
photos.json     image keys and sha256 checksums
schema.yaml     the field definitions these records were written against
MANIFEST.txt    checksums for every file
README.txt      plain English: what this is and how to read it
```

**Still get a copy off Cloudflare.** Monthly download to a committee member's
machine, and something physical in the museum safe. Two copies on one platform
under one account is one lapsed billing away from zero copies.

## Not built yet

- **Photo metadata pull.** A record opened on a second device doesn't yet know
  which images exist elsewhere. `fromWire` deliberately leaves local photos alone
  rather than clobbering them.
- **Adding a photograph to a record after it has left the device that made it.**
  Sync is device-scoped, so imported records never reach a phone, and the explorer
  is read-only. The most likely next gap somebody hits.

## eHive

Built and verified 2026-09-02 — mappings, export, reference copy, import, and the
museum's existing photographs. The details live in CLAUDE.md's eHive section; the
one to carry in your head is that **the export reads the schema from D1, not the
repo**, so `npm run db:seed` after any change to the YAML.

## Seeds are not migrations

`seeds/` holds data; `migrations/` holds schema. Wrangler treats *everything* in
`migrations/` as a migration and once ordered a seed before the migration that
created its table. `migrations/seed-schema.sql` still sits in the wrong place and
should move.
