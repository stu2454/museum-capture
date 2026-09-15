# Museum Artefact Capture — current status

Last updated: 2026-09-15

## Where we left off

**Development is paused (2026-09-15) until real users have given feedback, with one exception.**
The Collection page stopped showing records past the fiftieth and got slower with every
photograph, so Stage 8 (a collection page that scales) was taken up as a priority the same day.
It was deployed on 2026-09-15, the existing photographs were given thumbnails, and it has been
checked working on a desk and on a phone. Stage 8 is complete. Nothing else is planned until
feedback is in. The next major capability in mind is voice annotation; see "Future direction" in
[PROJECT_BRIEF.md](PROJECT_BRIEF.md).

The capture app and catalogue are built, deployed and in use behind Cloudflare Access. The eHive
round trip works for the museum's 35 public eHive records. The last development session was
2026-09-03 (Stage 4 complete, briefing slides generated). Since then:

- The slides were edited in PowerPoint; those edits were committed as they stood on 2026-09-15.
- One record was synced on 2026-09-09.
- On 2026-09-15 the project adopted the starter template's documentation, so that work is tracked
  in stages (this file, [PROJECT_BRIEF.md](PROJECT_BRIEF.md), [DEVLOG.md](DEVLOG.md),
  [AGENTS.md](AGENTS.md)).

Repository and deployment:

- **Repository.** https://github.com/stu2454/museum-capture — branch `main`.
- **Last commit.** The end-of-session documentation commit of 2026-09-15, pushed to `origin/main`
  together with the Stage 8 commits (ce1c4c6, ea3d17b).
- **Live site.** https://museum-capture.stu2038.workers.dev (Cloudflare Access; sign-in required).
- **Last deployment.** 2026-09-15, version `c5c1bf6c`, from commit ce1c4c6. `npm run deploy` ran
  straight after committing, on a clean working tree. Its bundle, `index-CCkcHLwM.js`, is the
  build the browser test passed against. The live site has not yet been opened in a browser.
- **Work in progress.** Stage 5, gathering user feedback. An email asking the accessioning team to
  suggest collection categories (no more than ten) was drafted on 2026-09-15. Stage 5,
  gathering user feedback, continues alongside.
- **Uncommitted at handover.** None. Two older notes:
  - `docs/artefact-catalogue-for-volunteers.pptx` was edited in PowerPoint after generation and
    committed as it stood: 41 MB, six images, one of them a 33 MB EMF. Open decision 10 is still
    open.
  - `docs/~$artefact-catalogue-for-volunteers.pptx` is a stale PowerPoint lock file, left on disk
    and now gitignored.

## Stages

Defined in [PROJECT_BRIEF.md](PROJECT_BRIEF.md#stages). This table is the only place a stage's state
is recorded.

| Stage | State | Notes |
|---|---|---|
| 1 — Schema-driven capture on a phone | Complete 2026-08-11 | |
| 2 — Sync, the catalogue and roles | Complete 2026-08-13 | Little validation recorded for 08-12 and 08-13 |
| 3 — Sign-in for everyone, and attributed records | Complete 2026-09-02 | |
| 4 — The eHive round trip (public records) | Complete 2026-09-03 | Covers 35 of 66 eHive records |
| 5 — Volunteer rollout | In progress: gathering user feedback | Development paused until feedback is in; deck committed at 41 MB |
| 6 — Housekeeping before the catalogue grows | Proposed; on hold | Waits for feedback, like all development |
| 7 — The whole eHive collection | Proposed; blocked on eHive | Waiting on eHive about private records |
| 8 — A collection page that scales | Complete 2026-09-15 | Live on desk and phone; photographs from a phone arrive with thumbnails |

## The catalogue as the server holds it

Read-only D1 queries, 2026-09-15:

- **Records.** 38 live: 35 `exported` (the eHive imports), 2 `review`, 1 `draft`. 5 removed
  (3 on 2026-08-12, 1 on 2026-09-02, 1 on 2026-09-03), all restorable.
- **Photographs.** 91 live and 32 retired. Every record with photographs has exactly one main
  photograph.
- **Without a photograph.** M1723 (Dorrigo District Rural School uniform), held back while its
  number is checked, and the draft below.
- **Latest sync.** 2026-09-09: one draft with no number, no name and no photographs. Its
  `captured_by` and `synced_by` differ, which is the shared-device case. Possibly a test or an
  abandoned start; worth asking before removing.
- **Users.** 3 active.
- **Schema.** `schema_health` reports version 2, 44 fields, loaded.
- **Measurements.** M677 carries its eHive measurement, so the import was re-run after the
  measurement fix (03798e6).

## Important constraints

The full rules are in [AGENTS.md](AGENTS.md). The ones most likely to matter next:

- Donor details never leave the device, and never go into any export.
- Nothing a volunteer typed is discarded or silently changed.
- Nothing is hard-deleted.
- The export reads the schema from D1. After any YAML change, run `npm run db:seed`.
- eHive has no write API. The export is a file a person sends to Vernon Systems.
- Object numbers don't identify records in eHive, so never match photographs on number alone.

## Known issues and limitations

| Issue | User impact | Evidence / location | Next action |
|---|---|---|---|
| Photographs can stay on the phone after their record reaches the server, while the home screen says "All records backed up" | A record shows fewer photographs than were taken until the app is next opened; if the phone's storage were cleared first, they'd be lost | S123455 on 2026-09-15: photograph 1 sent at 03:54, photographs 2–4 at 04:14 when the app was reopened. `src/App.tsx:127` counts records only. `uploadPhotos` in `src/sync.ts` sends each thumbnail before the next photograph | Proposed fix, awaiting the go-ahead (see next task). All four photographs of S123455 did arrive; the maintainer confirmed them on the record |
| We hold 35 of eHive's 66 records; the 31 private ones are unreachable | The duplicate-number warning is blind to private records, and so are the pick-list checks | AGENTS.md, "Private records"; 312a036 | Waiting on eHive (Stage 7) |
| M1723 is used for two objects in eHive, and one eHive record has no number | Risk of mis-filing; the uniform has no photograph | `HOLD` in `scripts/attach-ehive-images.mjs` | Museum checking the register; fix in eHive; then re-run the script |
| Slides edited by hand after generation | Re-running the generator would lose the images; a 41 MB file is too big to email or commit comfortably | `git status`; brief open decision 10 | Decide generated or hand-edited; shrink the EMF; commit |
| `migrations/seed-schema.sql` sits in `migrations/` | Wrangler may run it as a migration, in the wrong order | `scripts/seed-schema.mjs` writes it there; `db:seed` reads it there | Stage 6 |
| `gate-sync-endpoints/` holds stale copies of two files | Confusing; could be mistaken for live code | Added in 860a3c6; both copies differ from `src/` and `worker/` | Stage 6 |
| `ehiveExportReady` flag is vestigial | None; dead code | `src/export.ts:51` | Stage 6 |
| The export sends every record, including the 35 unchanged imports | Vernon Systems re-imports records nobody changed | Brief open decision 8 | Ask the museum before the next export |
| `docs/user-manual.html` says six open questions; there are seven | Minor inaccuracy for readers of the manual | Line 1488 | Fix with Stage 5's manual check |
| Photo metadata doesn't pull between devices | A record opened on a second device doesn't show photographs taken elsewhere | AGENTS.md, "Deliberately not built" | Backlog |
| No automated tests | Regressions are caught only by typecheck and by hand | `package.json` | Accepted for now |

## Latest validation

Date: 2026-09-15, at commit ce1c4c6.

| Check | Result | Scope and limitations |
|---|---|---|
| `npm run typecheck` | Passed | App and worker |
| `npm run build` | Passed | |
| Browser test, 44 checks | All passed | Headless Chromium against `wrangler dev` with a throwaway database of 129 test records and 15 photographs, at desk and phone widths. The test script lives in the session scratchpad, not the repository |
| `scripts/make-thumbnails.mjs --local` | 12 of 12 made | Against the test copy: 824 KB originals became 61 KB at 400px |
| The capture app's thumbnail upload | Not tried in a browser | Same code path as the one tested |
| `npm run deploy` | Deployed, version `c5c1bf6c` | From ce1c4c6 |
| `scripts/make-thumbnails.mjs` on the real collection | 89 made, 2 already small, 0 failed | All 91 live photographs. One downloaded back from R2: 300×400, 49 KB |
| D1 queries (read-only) | As in "The catalogue as the server holds it" | Live database, earlier today |
| Live site in a browser | Works on a desk and on a phone | Reported by the maintainer, 2026-09-15 |
| Thumbnail from a phone upload | Works | All four photographs of S123455, catalogued on a phone, have 300×400 thumbnails in R2 |

The browser test covered:

- paging, the count line and natural number order
- keeping your place, the browser's Back and Forward buttons, and a record opened from a direct
  link
- the search surviving a reload, and a slow older answer being ignored
- thumbnails, and the fallback to the original
- a photograph added from the catalogue sending its thumbnail
- the thumbnail upload refusing unknown photographs, oversized files and requests without a
  sign-in
- connection failures and recovery

Rerun the relevant checks after any later code change.

## Running and testing

- **Install.** `npm install`
- **Development.** `npm run dev`, or `npm run dev:https` on a phone.
- **Checks.** `npm run typecheck`, then `npm run build`.
- **Deploy.** `npm run deploy` (publishes to the live site).
- **Database.** `npm run db:check`, `db:records`, `db:errors`.
- **Configuration.** `.dev.vars` holds `EHIVE_CLIENT_ID`, `EHIVE_CLIENT_SECRET` and
  `EHIVE_TRACKING_ID`; it is gitignored. Cloudflare setup is in [SYNC-SETUP.md](SYNC-SETUP.md).
- **Tests.** No automated tests. See "Validate the result" in AGENTS.md.

## Next recommended task

**Decide whether to fix photographs lingering on the phone** (the first known issue). It is
small and it protects volunteers' photographs, so it may be worth doing during the pause if the
maintainer agrees. The proposed fix:

- The home screen's backup line counts photographs still on the device, so it never says "All
  records backed up" while any are waiting.
- Every photograph is sent before any thumbnail, so the originals go first.
- A sync starts when the app comes back to the front, not only on opening, when the connection
  returns, and every five minutes.

**Done when** a record catalogued on a phone with several photographs, and the phone locked
straight afterwards, shows all of them once the app is reopened, and the backup line never
claims otherwise in between.

**Then: get real user feedback before any further development.**

1. Brief the volunteers and put the app in their hands for real cataloguing sessions. If the
   slides are to be emailed, shrink the 33 MB EMF first; brief decision 10 is still open.
2. Collect what works and what doesn't from volunteers and admins.
3. Separately, trial dedicated voice recording apps with volunteers and see what they think,
   before anything voice-related is built here (see "Future direction" in the brief). Keep
   donor names out of the recordings.
4. Write the feedback and the trial's findings up in the repository, for example in
   `docs/user-feedback.md`, without people's names, so the next session can plan from it.

It matters because the app works, and the next thing worth building should come from how it is
actually used, not from guesses about it.

**Done when** feedback from real sessions is written up and the next stage has been chosen from it.

- **Status.** In progress, with the maintainer. No code work until it is done.

## Resume prompt

> Read AGENTS.md and PROJECT_STATUS.md, inspect the working tree and recent commits, and help me
> continue with [task]. Check for differences between the handover and the current code before
> making changes.
