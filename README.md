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

## How a volunteer uses it

1. Enter your name once — it stays on the device.
2. **Start a record.**
3. **Enter the record number** from the object's tag or the register. If that number is already
   on the device, you'll be told before you do any more work.
4. **Photograph the object.** *Take a photo* opens the camera; *Choose from library* picks
   existing shots. Overall view first, then marks, labels and damage.
5. Work through seven short screens: what is it, describe it, how big, condition,
   who made it, its story, where it lives.
6. **Check the record** — it reads back looking like the paper form.
7. **Save for review.** A second person confirms it later.

Everything saves as you go. You can close the app mid-record and pick it up later.

## What it doesn't do yet

- **Voice recording.** The prompts and structure are in place; the recording flow isn't built.
- **Sending records to eHive.** Blocked until the field mappings are verified against eHive's
  import spreadsheet. Export JSON in the meantime.
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

1. Registration numbers — is there a Dorrigo format the app should check against? Currently
   accepted as free text with no validation, which is safe but won't catch a typo.
2. Dimensions — mm or cm as the house standard?
3. The unlabelled line after the "Unknown" acquisition tickbox — elaboration, or "Other"?
4. Do cataloguing volunteers ever touch the donor block?
5. Confirm every eHive field mapping before an export is built.

## Storage

Records and photos live in the browser's IndexedDB on that device. Photos are downscaled to
2000px on the way in, EXIF rotation is applied so nothing ends up sideways, and iPhone HEIC
files are converted to JPEG. **Records are not backed up anywhere** — export regularly until
sync exists.

Clearing site data in the browser deletes everything. Say so to anyone using it.
