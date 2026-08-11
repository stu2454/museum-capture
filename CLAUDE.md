# CLAUDE.md — Museum Artefact Capture App

## What this is

A web app that walks a museum volunteer through cataloguing an artefact: photograph it,
answer prompts, produce a structured record. It replaces a two-page paper worksheet.

It is **schema-driven**. Every field, prompt, option and grouping comes from
`schema/worksheet.v2.yaml` at runtime. There are no hardcoded field names in the UI.
If you find yourself typing `"registration_number"` into a component, stop — the change
belongs in the schema.

## The critical context: this museum uses eHive

The paper worksheet is Appendix 1 of the **eHive Cataloguing Guidelines (July 2023)** —
it's eHive's own form, and the last tickbox on it is "Entered to ehive". The museum is
already on eHive (Vernon Systems), whose object model follows the Spectrum standard.

This means:
- We are **not** inventing a data model. We are building a better front door to one that
  already exists.
- The end goal is a record that lands in eHive cleanly — via their import spreadsheet
  initially, via their REST API later.
- Every `mapping.ehive` value in the schema is currently `UNVERIFIED`. **Do not build any
  export until those are confirmed** against the real eHive import spreadsheet. Guessing
  field names produces an import that half-works, which is worse than none.

## Scope

**Build now**
- Load the schema, render the capture flow, save records locally, export JSON.
- Photo capture and attachment.
- Review screen showing every field before a record is confirmed.

**Not yet**
- Voice recording and transcription. Structure for it, don't build it.
- eHive export. Blocked on mapping verification.
- Accounts, server, sync.

**Never without asking**
- Anything that puts donor personal information in the volunteer flow. See below.

## The volunteer flow

Nine **capture groups**, defined in the schema, not the paper's 35-field order. Paper order
is filing order; capture order is the order a person naturally handles an object.

```
Photograph  →  Identify  →  Describe  →  Measure  →  Condition
            →  Origin  →  Story  →  Where it lives  →  Review  →  Save
```

Groups 8 (Acquisition) and 9 (Sign-off) are marked `restricted: true` and sit outside the
volunteer flow entirely.

Design intent for the eventual voice phase: the volunteer answers **one open question per
group**, speaking freely, and a model splits that answer across the group's fields. Do not
build 35 individual voice prompts — that's an interrogation, and volunteers will stop after
five. The per-field `voice_prompt` values exist as fallbacks for re-asking a specific gap.

## Donor information is restricted — this matters

Fields marked `sensitivity: restricted` are donor name, address, email, phone and tax
incentive number. These are living people's personal details.

Rules:
- Do not show them in the volunteer capture flow.
- Do not put them in browser storage alongside object data.
- Do not include them in any export, share link or backup that object records go into.
- They belong with the deed of gift, entered by a committee member, linked to the object
  record by id only.

In a volunteer-run museum, records get emailed around and copied onto USB sticks. Design as
if that will happen, because it will.

## Schema conventions you need to know

| Key | Meaning |
|---|---|
| `label` | Verbatim from the paper. Never edit. Volunteers recognise the paper wording. |
| `display_label` | Same thing with the trailing colon stripped. **Use this in the UI.** |
| `source` | `printed` = on the form. `inferred` = we grouped it. `app_added` = new. |
| `sensitivity` | `public` / `internal` / `restricted`. Gates visibility and export. |
| `capture_group` / `capture_order` | Drives the app flow. |
| `order` / `page` | Where it sat on paper. For traceability only — don't drive UI from it. |
| `autofill` | App sets this, don't ask the volunteer. |
| `mapping.ehive` | All `UNVERIFIED`. Blocking for export. |

Three types were added beyond the original vocabulary: `fuzzy_date`, `image`, `audio`.

**`fuzzy_date` is not a date picker.** Museums record "c. 1890", "1920s", "before the war",
"unknown". A date picker forces a volunteer to invent precision they don't have, and invented
precision in a catalogue is a lie that outlives everyone who could correct it. Free text,
with optional parsing to a year range for searching — never overwrite what they typed.

## Decisions the museum still has to make

These are in `open_questions` in the schema. Don't resolve them by picking something sensible —
ask, and record the answer in the schema.

1. Dimensions unit — mm or cm as house standard?
2. The unlabelled ruled line after the "Unknown" acquisition tickbox — elaboration, or "Other"?
3. Who assigns registration numbers — the app, or a person, beforehand?
4. Do cataloguing volunteers ever touch the donor block?

## Suggested stack

Vite + React + TypeScript, PWA. Rationale, so you can argue with it:

- **PWA with offline-first storage.** A country museum's back room is where wifi goes to die.
  A volunteer who loses twenty minutes of work to a dropped connection does not come back
  next Saturday. Records save locally and sync later.
- **IndexedDB, not localStorage** — photos are too big for localStorage.
- **No backend for now.** Export JSON, import JSON. Add sync when the flow is proven.
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
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build -> dist/
npm run typecheck
```

## Where things live

```
schema/worksheet.v2.yaml   THE SOURCE OF TRUTH. Change what's asked here, not in components.
src/schema.ts              Loads and slices the schema. The only module that reads the YAML.
src/types.ts               TS mirror of the schema. Keep in step with the YAML.
src/db.ts                  IndexedDB: records + photo blobs.
src/media.ts               Photo downscaling on intake, file download.
src/export.ts              JSON export. eHive export deliberately not built.
src/components/
  CaptureFlow.tsx          Step machine: photos -> capture groups -> review.
  FieldInput.tsx           One branch per schema field type.
  PhotoStep.tsx            Camera intake, primary image selection.
  ReviewSheet.tsx          Record read back in PAPER order, as the printed form.
  RecordList.tsx           Home screen.
  AccessionTag.tsx         The tag header.
```

## Rules that are easy to break by accident

1. **No hardcoded field ids in components.** `FieldInput` switches on `field.type`, never on
   `field.id`. The two exceptions are in `CaptureFlow` (`registration_number` drives the tag)
   and `RecordList` (`object_name` is the record's display name) — both are deliberate, both
   are commented. Don't add a third without a reason.
2. **Capture order vs paper order.** The flow uses `capture_group`/`capture_order`. The review
   sheet uses `page`/`order`. That's not an inconsistency: doing the work and checking the
   work want different orders.
3. **Restricted fields never reach a component.** `volunteerFields()` and
   `printedFieldsInSection()` filter them out at the schema layer, and `toBundle()` strips
   them again on export. Keep all three.
4. **Autosave on every change.** `CaptureFlow` writes to IndexedDB in an effect. Don't
   replace it with a save button.
5. **Never discard what someone typed.** `FieldValue` carries `raw` alongside `value` for
   exactly this. If a value won't parse, keep the text and flag it.

## Deliberately not built

- **eHive export.** `ehiveExportReady` is `false`. Every `mapping.ehive` in the schema says
  `UNVERIFIED`. Verify against eHive's import spreadsheet first.
- **Voice capture.** The structure is there — `capture_groups` each carry one open
  `voice_prompt`, `FieldValue.origin` can already record `"spoken"`, and the schema has
  `voice_recording` and `transcript` fields. The flow to build: record one answer per group,
  transcribe, have a model split it across that group's fields, then show the volunteer what
  it heard before accepting. Do not build 35 separate voice prompts.
- **Sync, accounts, server.** Records live on the device and export as JSON.
- **Audio and table field types.** `FieldInput` has no branch for them yet; nothing in the
  volunteer flow uses them.

## Design direction

Registration ink, archival board, and the brass tie-on tag. The accession tag header is the
one loud element; everything else stays quiet. 18px base text, 52px minimum touch targets,
no fonts fetched over the network (the store room's wifi can't be relied on), reduced motion
respected.

The review screen deliberately looks like the paper worksheet. Volunteers know that form —
reading a record back in its shape is how they can tell whether it's right.
