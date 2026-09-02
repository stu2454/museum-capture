# Artefact Catalogue

A web app for cataloguing museum artefacts in the collection store. Replaces the two-page
paper worksheet from the eHive Cataloguing Guidelines (July 2023).

Works offline, on a phone, held in one hand.

## Getting started in VS Code

```bash
cd museum-capture
npm install
npm run dev
```

Open http://localhost:5173.

### Testing on a phone or iPad

```bash
npm run dev:https
```

Use the **Network** address it prints, on a device on the same wifi. Safari will warn about the
self-signed certificate — accept it once per device.

Use `dev:https`, not `dev`, for device testing. iOS needs a secure context for Add to Home
Screen, for the offline cache, and later for the microphone. The camera itself works either
way, but you'll hit the others quickly.

Recommended VS Code extensions: ESLint, Prettier, and the Claude Code extension.

## The two halves

The app is one deployment with two front doors, both behind Cloudflare Access:

- **`/`** — the capture app. A volunteer with an object in their hands.
- **`/explore`** — the collection. Search, read, and for admins: manage people, and the eHive
  import and export.

## How a volunteer uses it

1. **Sign in.** Email address, then a code. Once per device, and it needs a connection — so do
   it before going into the store room. The Cloudflare page also offers a *Sign in with
   Cloudflare* button; volunteers must ignore it and use the email box.
2. Check the name at the top is yours. On a shared museum device, *Someone else is cataloguing*
   switches it. Records are filed under whoever is named there.
3. **Start a record.**
4. **Enter the record number.** If that number is already used — on this device, on another, or
   in eHive — you're told before doing any more work.
5. **Photograph the object.** *Take a photo* opens the camera; *Choose from library* picks
   existing shots. Overall view first, then marks, labels and damage.
6. Work through eight short screens: what is it, describe it, how big, condition, who made it,
   its story, where it lives.
7. **Check the record** — it reads back looking like the paper form.
8. **Save for review.** A second person confirms it later.

Everything saves as you go, and it all works offline. You can close the app mid-record and pick
it up later.

## Sending records to eHive

`/explore` → **Send records to eHive** (admins only). It builds the spreadsheet data, and warns
about any value that would create a new eHive pick-list term — checked against the terms the
museum actually uses. It produces a **file you send**: eHive has no write API, and imports are
run by Vernon Systems staff from a spreadsheet emailed to them.

The same screen imports eHive's existing records into the collection. See the eHive section of
CLAUDE.md before changing any of it.

## What it doesn't do yet

- **Voice recording.** The prompts and structure are in place; the recording flow isn't built.
- **Adding a photograph to a record after it has left the device that made it.** There is no
  route for this in the app. It is the most likely next thing somebody needs.
- **Donor details.** Deliberately absent — see below.

## Donor details are not in this app

Five fields on the paper form (donor name, address, email, phone, tax incentive number) are
personal information about living people. They aren't shown to cataloguing volunteers, aren't
stored with the object record, and are stripped from every export.

They belong with the deed of gift, entered by a committee member, linked to the object by
its record id.

## Changing what the app asks

Edit `schema/worksheet.v2.yaml`. Add a field there and it appears in the flow, the review
sheet and the export with no code change. Field ids become permanent once records exist —
renaming one means migrating data, so get them right early.

## Decisions the museum still needs to make

Listed under `open_questions` in the schema:

1. Registration numbers — the museum's 35 eHive records are all `M` plus a number, sometimes
   with a letter suffix (`M654a`). Is that the rule? Accepted as free text for now, which is
   safe but won't catch a typo.
2. Dimensions — mm or cm as the house standard?
3. The unlabelled line after the "Unknown" acquisition tickbox — elaboration, or "Other"?
4. Do cataloguing volunteers ever touch the donor block?
5. Storage and display — eHive has separate fields; our one question feeds only storage.
6. Pick list terms — author vocabularies for the app to offer, or keep free text and tidy
   duplicates in eHive after each import?

The eHive mappings, once listed here, are now verified — see CLAUDE.md.

## Storage

Records and photos are written to the browser's IndexedDB first, always, so the app works with
no signal. Photos are downscaled to 2000px on the way in, EXIF rotation is applied so nothing
ends up sideways, and iPhone HEIC files are converted to JPEG.

They then **sync in the background** to Cloudflare — D1 for records, R2 for photographs — and a
snapshot is written to R2 every Monday. Two things still matter:

- **Anything captured between syncs lives only on the device.** A device that has never signed
  in never syncs at all.
- **Get a copy off Cloudflare.** Two copies on one platform under one account is one lapsed
  billing away from none. Download a snapshot monthly.

On iPhone and iPad, add the app to the Home Screen. Records kept in a Safari tab can be cleared
after seven days; a home-screen app is not "in Safari" and keeps its own counter.
