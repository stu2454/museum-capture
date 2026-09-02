/**
 * Attaches the museum's eHive photographs to the records imported from eHive.
 *
 *   node scripts/attach-ehive-images.mjs <images-dir> <ehive-report.xml>
 *
 * Two layouts, both accepted:
 *
 *   images/M677.png              one photograph, named for its object
 *   images/M677/front.jpg        a folder per object, as many photographs as it has
 *   images/M677/base.jpg
 *
 * The folder form is the useful one: eHive holds several views of most objects, and
 * a catalogue is far better for having them. Within a folder the first file by name
 * becomes the main image, which you can change afterwards in the app.
 *
 * Writes seeds/seed-ehive-photos.sql and seeds/upload-ehive-photos.sh. Run the
 * shell script first (it puts the files in R2), then the SQL. THAT ORDER MATTERS:
 * an R2 object with no database row is invisible and harmless, a database row
 * with no R2 object is a broken image on a catalogue record.
 *
 * WHY FILENAMES AREN'T TRUSTED. The files are named by object number, and object
 * numbers do not identify records in this collection: eHive has two different
 * objects numbered M1723, and one record with no number at all. Matching on the
 * filename alone silently put a school uniform onto a rugby league blazer's
 * record - which looked entirely correct. The ambiguous ones are therefore listed
 * explicitly below, each resolved by comparing the file against the images
 * embedded in eHive's own PDF report, where every image sits on its record's page.
 *
 * Requires sips, which is macOS only. This is a one-off admin tool run on a
 * maintainer's machine, not part of the app.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/**
 * Files whose record cannot be worked out from the name. Each was confirmed by
 * pixel comparison against the PDF report's own images.
 */
const EXPLICIT = {
  M1720a: "1841304", // Blazer, NSW Rugby Football League       (eHive M1720)
  M1720b: "1831719", // Uniform, Dorrigo District Rural School  (eHive M1723 - the duplicate)
  M1723: "1831723", // Honour Roll, North Dorrigo Public School (eHive M1723 - the other one)
  No_M_number_tablecloth: "838377", // Signature Tablecloth - eHive holds no number for it
};

/**
 * Held back deliberately. Both blazers carry accession numbers the museum is
 * still checking against the register, and a photograph filed against a number
 * that later turns out to be wrong is harder to find and fix than one that was
 * never filed at all.
 */
const HOLD = new Set(["M1720a", "M1720b"]);

const MAX_EDGE = 2000; // matches src/media.ts, so imported and captured photos agree
const QUALITY = 85;

/**
 * Photographs already attached, by checksum, so running this again after a fuller
 * download doesn't attach the same picture twice.
 *
 * Ids are content-addressed for the same reason: the same file always produces the
 * same id and the same R2 key, so a re-run overwrites rather than accumulates. The
 * first pass used one id per record, which cannot survive a record having four
 * photographs.
 */
function alreadyAttached() {
  try {
    const out = execFileSync(
      "npx",
      ["wrangler", "d1", "execute", "artefact-catalogue", "--remote", "--json",
       "--command", "SELECT sha256 FROM photos WHERE sha256 IS NOT NULL AND deleted_at IS NULL"],
      { encoding: "utf8", cwd: root }
    );
    const rows = JSON.parse(out.slice(out.indexOf("[")))?.[0]?.results ?? [];
    return new Set(rows.map((r) => r.sha256));
  } catch {
    // No network, or not logged in. Carry on rather than refuse: the SQL upserts by
    // id, so the worst case is re-uploading bytes that were already there.
    console.log("  (couldn't read existing photographs — nothing will be skipped)");
    return new Set();
  }
}

/** Every image in a folder, or the single file itself. */
function imagesIn(dir, entry) {
  const full = join(dir, entry);
  if (statSync(full).isDirectory()) {
    return readdirSync(full)
      .filter((f) => /\.(png|jpe?g)$/i.test(f))
      .sort()
      .map((f) => join(full, f));
  }
  return /\.(png|jpe?g)$/i.test(entry) ? [full] : [];
}

const [imagesDir, xmlPath] = process.argv.slice(2);
if (!imagesDir || !xmlPath) {
  console.error("Usage: node scripts/attach-ehive-images.mjs <images-dir> <ehive-report.xml>");
  process.exit(1);
}

const unesc = (s) =>
  s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();

// object_record_id -> object number, and the reverse where a number is unique.
const xml = readFileSync(resolve(process.cwd(), xmlPath), "utf8");
const byId = new Map();
const numberCounts = new Map();
for (const m of xml.matchAll(/<record\b([^>]*)>([\s\S]*?)<\/record>/g)) {
  const id = /object_record_id="([^"]+)"/.exec(m[1])?.[1];
  const num = /<fieldName>object_number<\/fieldName>\s*<fieldValue>([\s\S]*?)<\/fieldValue>/.exec(m[2]);
  const name = /<fieldName>name<\/fieldName>\s*<fieldValue>([\s\S]*?)<\/fieldValue>/.exec(m[2]);
  if (!id) continue;
  const number = num ? unesc(num[1]) : null;
  byId.set(id, { number, name: name ? unesc(name[1]) : null });
  if (number) numberCounts.set(number, (numberCounts.get(number) ?? 0) + 1);
}
const uniqueNumber = new Map();
for (const [id, r] of byId) if (r.number && numberCounts.get(r.number) === 1) uniqueNumber.set(r.number, id);

const tmp = join(root, ".ehive-jpeg");
mkdirSync(tmp, { recursive: true });
mkdirSync(join(root, "seeds"), { recursive: true });

const sql = [
  "-- Photographs from the museum's eHive records, attached to the imported records.",
  "-- Generated by scripts/attach-ehive-images.mjs. Run the .sh first: an R2 object",
  "-- with no row here is harmless, a row here with no R2 object is a broken image.",
  "",
];
const uploads = ["#!/bin/sh", "# Upload first, then apply seeds/seed-ehive-photos.sql.", "set -e", ""];
const held = [];
const skipped = [];

const existing = alreadyAttached();
const retired = [];
let attached = 0;
let duplicates = 0;

for (const entry of readdirSync(imagesDir).sort()) {
  const stem = entry.replace(/\.(png|jpe?g)$/i, "");
  const files = imagesIn(imagesDir, entry);
  if (files.length === 0) continue;

  if (HOLD.has(stem)) { held.push(stem); continue; }

  const recordId = EXPLICIT[stem] ?? uniqueNumber.get(stem);
  if (!recordId) { skipped.push(stem); continue; }

  const record = `ehive_${recordId}`;
  let first = true;

  // A folder means eHive's own originals have arrived for this object, and they
  // supersede the single image derived from the PDF report on the first pass.
  // They are the same photographs, better sourced - and a checksum cannot tell,
  // because one was re-encoded from a PNG lifted out of a report and the other
  // came straight from eHive. Left alone, the record would show the same view
  // twice. Retired rather than deleted: deleted_at is how everything else here
  // stops being visible, and it can be undone.
  if (statSync(join(imagesDir, entry)).isDirectory()) {
    retired.push(
      // is_primary cleared too: a retired row that still claims to be the main
      // image would give the record two primaries if it were ever restored.
      `UPDATE photos SET deleted_at = datetime('now'), is_primary = 0 ` +
        `WHERE record_id = '${record}' AND id = 'img_ehive_${recordId}';`
    );
  }

  for (const source of files) {
    // Convert, but never enlarge: sips -Z scales up as well as down, which invents
    // pixels that were never in the photograph and makes the file bigger.
    const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", source], { encoding: "utf8" });
    const longest = Math.max(...[...dims.matchAll(/pixel(?:Width|Height):\s*(\d+)/g)].map((m) => Number(m[1])));
    const out = join(tmp, `${record}-${basename(source).replace(/\.[^.]+$/, "")}.jpg`);
    const args = ["-s", "format", "jpeg", "-s", "formatOptions", String(QUALITY)];
    if (longest > MAX_EDGE) args.push("-Z", String(MAX_EDGE));
    execFileSync("sips", [...args, source, "--out", out], { stdio: "ignore" });

    const bytes = readFileSync(out);
    const sha = createHash("sha256").update(bytes).digest("hex");

    if (existing.has(sha)) {
      duplicates += 1;
      if (first) first = false; // it is already attached, and already the main one
      continue;
    }
    existing.add(sha);

    // Content-addressed, so the same photograph always lands in the same place
    // however many times this is run.
    const photoId = `img_e_${sha.slice(0, 16)}`;
    const key = `photos/${record}/${photoId}.jpg`;

    uploads.push(
      `npx wrangler r2 object put "artefact-photos/${key}" --file="${out}" --content-type=image/jpeg`
    );
    sql.push(
      `INSERT INTO photos (id, record_id, r2_key, sha256, bytes, content_type, is_primary, added_at, source) ` +
        `VALUES ('${photoId}', '${record}', '${key}', '${sha}', ${bytes.length}, 'image/jpeg', ` +
        `${first ? 1 : 0}, datetime('now'), 'ehive') ` +
        `ON CONFLICT(id) DO UPDATE SET r2_key=excluded.r2_key, sha256=excluded.sha256, ` +
        `bytes=excluded.bytes, source=excluded.source;`
    );
    console.log(`  ${basename(source).padEnd(28)} -> ${record}${first ? "  (main)" : ""}`);
    attached += 1;
    first = false;
  }
}

if (retired.length) {
  sql.push("");
  sql.push("-- Retire the images derived from the PDF report, now that eHive's originals are here.");
  sql.push(...retired);
}

// Exactly one main image per record, whatever order the files arrived in. Without
// this a record that already had a primary would end up with two.
sql.push("");
sql.push("-- Leave exactly one main image per record.");
sql.push(
  `UPDATE photos SET is_primary = 0 WHERE record_id IN (SELECT id FROM records WHERE ehive_record_id IS NOT NULL) ` +
    `AND deleted_at IS NULL ` +
    `AND id <> (SELECT p.id FROM photos p WHERE p.record_id = photos.record_id AND p.deleted_at IS NULL ` +
    `ORDER BY p.is_primary DESC, p.added_at, p.id LIMIT 1);`
);

writeFileSync(join(root, "seeds/seed-ehive-photos.sql"), sql.join("\n") + "\n");
writeFileSync(join(root, "seeds/upload-ehive-photos.sh"), uploads.join("\n") + "\n", { mode: 0o755 });

console.log(`\n  ${attached} photographs prepared, ${duplicates} already attached and skipped`);
if (held.length) console.log(`  held back (accession numbers unverified): ${held.join(", ")}`);
if (skipped.length) console.log(`  NO MATCHING RECORD, skipped: ${skipped.join(", ")}`);
if (retired.length) console.log(`  ${retired.length} PDF-derived image(s) will be retired, superseded by eHive's originals`);
console.log("\nThen, in order:");
console.log("  sh seeds/upload-ehive-photos.sh");
console.log("  npx wrangler d1 execute artefact-catalogue --remote --file=seeds/seed-ehive-photos.sql");
