# Museum Artefact Capture — current status

Last updated: 2026-09-15

## Where we left off

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
- **Last commit.** 8e28f88, the same on `origin/main` (checked 2026-09-15).
- **Live site.** https://museum-capture.stu2038.workers.dev (Cloudflare Access; sign-in required).
- **Last deployment.** 2026-09-03 04:05 UTC, version `0648d551`. Deployments aren't tagged with a
  commit. The last app code change (db56401) matches the 03:30 UTC deployment. The 04:05
  deployment followed 8e28f88, which changed no app code. The live site was not opened this
  session.
- **Work in progress.** Stage 5: the volunteer briefing slides.
- **Uncommitted at handover.** None. Two notes:
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
| 5 — Volunteer rollout | In progress; scope proposed, not yet agreed | Slide images added; deck committed at 41 MB |
| 6 — Housekeeping before the catalogue grows | Proposed | |
| 7 — The whole eHive collection | Proposed; blocked on eHive | Waiting on eHive about private records |

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

Date: 2026-09-15, at commit 8e28f88. The working tree differed only in the slide deck and these
documents.

| Check | Result | Scope and limitations |
|---|---|---|
| `npm run typecheck` | Passed | App and worker |
| `npm run build` | Not run | Documentation-only change |
| `git ls-remote origin` | `main` = 8e28f88 | Local and remote agree |
| `npx wrangler deployments list` | Latest 2026-09-03 04:05 UTC | Shows time, not commit |
| D1 queries (read-only) | As in "The catalogue as the server holds it" | Live database |
| Live site in a browser | Not checked | — |

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

**Finish the slide deck.**

1. Decide whether the deck stays generated or is edited by hand from now on (brief decision 10).
   If generated, move the images into `scripts/build-volunteer-deck.py`.
2. Replace the 33 MB EMF with a PNG or JPEG.
3. Confirm no placeholder text remains.

It matters because re-running the generator today would throw away the images, and a 41 MB file
is awkward to email to volunteers.

**Done when** the deck has no placeholders, is small enough to email, and decision 10 is recorded
in the brief.

- **Status.** Recommended only.
- **Also before Stage 5 goes further.** Agree the proposed scope of Stages 5–7 in the brief.

## Resume prompt

> Read AGENTS.md and PROJECT_STATUS.md, inspect the working tree and recent commits, and help me
> continue with [task]. Check for differences between the handover and the current code before
> making changes.
