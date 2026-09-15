/**
 * Makes the small copies the collection shows, for photographs already on the server.
 *
 *   node scripts/make-thumbnails.mjs                            the real collection
 *   node scripts/make-thumbnails.mjs img_abc img_def            just those photographs
 *   node scripts/make-thumbnails.mjs --local --persist-to DIR   a local test copy
 *
 * New photographs get a thumbnail from the device that sends them (src/thumbnail.ts).
 * This is for the photographs sent before that existed, and for any whose thumbnail
 * never arrived: a device still running an older version, or a connection that
 * dropped at the wrong moment. The collection works without thumbnails, showing the
 * original instead. It is just slower.
 *
 * SAFE TO RUN AGAIN. It only ever writes under thumbs/ in R2. It never touches an
 * original or the database, and a photograph always gets the same key, so a re-run
 * overwrites rather than accumulates.
 *
 * Every live photograph is done each time, because wrangler can't cheaply ask
 * whether a thumbnail already exists. At a hundred photographs a few minutes is
 * cheaper than cleverness.
 *
 * Requires sips, which is macOS only. Same as attach-ehive-images.mjs: a tool run on
 * a maintainer's machine, not part of the app.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const THUMB_EDGE = 400; // matches THUMB_EDGE in src/media.ts
const QUALITY = 80; // matches THUMB_QUALITY there
const BUCKET = "artefact-photos";
const DATABASE = "artefact-catalogue";

const args = process.argv.slice(2);
const local = args.includes("--local");
const persistAt = args.indexOf("--persist-to");
const persistTo = persistAt >= 0 ? args[persistAt + 1] : null;
const only = new Set(
  args.filter((arg, i) => !arg.startsWith("--") && (persistAt < 0 || i !== persistAt + 1))
);

// wrangler 3's r2 commands reach the real bucket unless told --local, and have no
// --remote flag; d1 wants to be told either way.
const localFlags = local ? ["--local", ...(persistTo ? ["--persist-to", persistTo] : [])] : [];
const d1Flags = local ? localFlags : ["--remote"];

function wrangler(...parts) {
  return execFileSync("npx", ["wrangler", ...parts], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const listing = wrangler(
  "d1", "execute", DATABASE, ...d1Flags, "--json",
  "--command", "SELECT id, r2_key FROM photos WHERE deleted_at IS NULL ORDER BY id"
);
const photos = JSON.parse(listing.slice(listing.indexOf("[")))[0].results.filter(
  (photo) => only.size === 0 || only.has(photo.id)
);

console.log(`${photos.length} photograph(s) in ${local ? "the local copy" : "the real collection"}\n`);

const work = mkdtempSync(join(tmpdir(), "thumbnails-"));
let made = 0;
let small = 0;
const failed = [];

try {
  for (const [index, photo] of photos.entries()) {
    const label = `  ${String(index + 1).padStart(3)}/${photos.length}  ${photo.id}`;
    const original = join(work, `${photo.id}-original.jpg`);
    const thumbnail = join(work, `${photo.id}.jpg`);

    try {
      wrangler("r2", "object", "get", `${BUCKET}/${photo.r2_key}`, "--file", original, ...localFlags);

      const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", original], {
        encoding: "utf8",
      });
      const longest = Math.max(
        ...[...dims.matchAll(/pixel(?:Width|Height):\s*(\d+)/g)].map((m) => Number(m[1]))
      );
      if (!Number.isFinite(longest)) throw new Error("couldn't read the image size");

      // Never enlarge: sips -Z scales up as well as down, inventing pixels. A
      // photograph already this small is its own thumbnail, and the server shows it
      // whenever a thumbnail is missing.
      if (longest <= THUMB_EDGE) {
        small += 1;
        console.log(`${label}  already small, left as it is`);
        continue;
      }

      execFileSync(
        "sips",
        ["-s", "format", "jpeg", "-s", "formatOptions", String(QUALITY), "-Z", String(THUMB_EDGE),
         original, "--out", thumbnail],
        { stdio: "ignore" }
      );
      // Key matches thumbKey() in worker/api.ts.
      wrangler(
        "r2", "object", "put", `${BUCKET}/thumbs/${photo.id}.jpg`,
        "--file", thumbnail, "--content-type", "image/jpeg", ...localFlags
      );
      made += 1;
      console.log(`${label}  done`);
    } catch (error) {
      failed.push(photo.id);
      const reason = String(error?.stderr || error?.message || error).trim().split("\n")[0];
      console.log(`${label}  FAILED: ${reason}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n  ${made} thumbnail(s) made, ${small} already small enough`);
if (failed.length) {
  console.log(`  ${failed.length} failed. Run again with just those ids:`);
  console.log(`  node scripts/make-thumbnails.mjs ${failed.join(" ")}`);
  process.exitCode = 1;
}
