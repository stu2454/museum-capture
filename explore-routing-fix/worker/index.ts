/**
 * Worker entry.
 *
 * Until now this project had no server side at all — wrangler.jsonc had no
 * `main` and Workers served dist/ directly. Adding sync means adding a Worker,
 * and the routing rule is: static assets win, anything left over comes here.
 *
 * `/api/*` never matches a file in dist/, so it lands in this handler. Every
 * other path is served from the assets binding exactly as before, so the app's
 * behaviour is unchanged.
 */

import { handleApi, type Env as ApiEnv } from "./api";
import { handleExplorer } from "./explorer";

export interface Env extends ApiEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Sync endpoints used by the capture app on volunteers' phones.
    if (url.pathname.startsWith("/api/sync") || url.pathname.startsWith("/api/photos")) {
      return handleApi(request, env);
    }

    // Everything else under /api is the explorer, which requires an identified
    // and authorised user. Kept separate because the capture app talks to a
    // device, and the explorer talks to a person.
    if (url.pathname.startsWith("/api/")) {
      return handleExplorer(request, env);
    }

    return serveApp(request, env);
  },

  /**
   * Weekly snapshot. This is the durability layer: D1's point-in-time recovery
   * is only 7 days on the free plan, so a copy that doesn't depend on D1 being
   * healthy is the thing that actually protects the catalogue.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(writeExport(env));
  },
};

async function writeExport(env: Env): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const prefix = `exports/catalogue-${stamp}`;

  const [records, revisions, photos, schema] = await Promise.all([
    env.DB.prepare(
      `SELECT id, registration_number, object_name, status, schema_version, values_json,
              captured_by, captured_at, updated_at, revision
       FROM records WHERE deleted_at IS NULL ORDER BY registration_number`
    ).all(),
    env.DB.prepare(`SELECT * FROM record_revisions ORDER BY record_id, revision`).all(),
    env.DB.prepare(`SELECT id, record_id, r2_key, sha256, bytes, is_primary, caption
                    FROM photos WHERE deleted_at IS NULL`).all(),
    env.DB.prepare(`SELECT version, yaml FROM schema_versions ORDER BY version DESC LIMIT 1`)
      .first<{ version: number; yaml: string }>(),
  ]);

  const files: Record<string, string> = {
    "records.json": JSON.stringify(records.results, null, 2),
    "records.csv": toCsv(records.results as Record<string, unknown>[]),
    "revisions.json": JSON.stringify(revisions.results, null, 2),
    "photos.json": JSON.stringify(photos.results, null, 2),
    "schema.yaml": schema?.yaml ?? "# No schema version recorded — exports are not self-describing.",
    "README.txt": readme(stamp, records.results.length, photos.results.length, schema?.version),
  };

  const manifest: string[] = [`Catalogue export ${stamp}`, ""];
  for (const [name, body] of Object.entries(files)) {
    const bytes = new TextEncoder().encode(body);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.PHOTOS.put(`${prefix}/${name}`, body, {
      httpMetadata: { contentType: name.endsWith(".json") ? "application/json" : "text/plain" },
    });
    manifest.push(`${hash}  ${name}  (${bytes.length} bytes)`);
  }

  manifest.push("", "Photographs are stored under photos/{record_id}/{photo_id}.jpg");
  manifest.push("in the same bucket; photos.json lists every key and its sha256.");
  await env.PHOTOS.put(`${prefix}/MANIFEST.txt`, manifest.join("\n"));

  await env.DB.prepare(
    `INSERT INTO exports (id, r2_key, kind, record_count, photo_count, schema_version)
     VALUES (?1, ?2, 'scheduled', ?3, ?4, ?5)`
  )
    .bind(`exp_${stamp}`, prefix, records.results.length, photos.results.length, schema?.version ?? null)
    .run();
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  // Flatten values_json into columns so the CSV is genuinely readable in Excel
  // rather than one cell of JSON per row.
  const fieldKeys = new Set<string>();
  for (const row of rows) {
    try {
      for (const key of Object.keys(JSON.parse(String(row.values_json)))) fieldKeys.add(key);
    } catch {
      /* a malformed row shouldn't take the whole export down */
    }
  }

  const base = ["id", "registration_number", "object_name", "status", "captured_by", "updated_at"];
  // object_name is promoted to a base column, so drop it from the field set or
  // the CSV carries the same data twice under one header name.
  const extra = Array.from(fieldKeys).filter((k) => !base.includes(k)).sort();
  const headers = [...base, ...extra];
  const lines = [headers.map(esc).join(",")];

  for (const row of rows) {
    let values: Record<string, { value?: unknown }> = {};
    try {
      values = JSON.parse(String(row.values_json));
    } catch {
      /* keep the base columns even if the field data won't parse */
    }
    const cells = headers.map((header) => {
      if (base.includes(header)) return esc(row[header]);
      const held = values[header]?.value;
      return esc(Array.isArray(held) ? held.join("; ") : held);
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

function esc(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function readme(stamp: string, recordCount: number, photoCount: number, schemaVersion?: number): string {
  return `ARTEFACT CATALOGUE EXPORT
Taken ${stamp}. ${recordCount} records, ${photoCount} photographs.

WHAT THIS IS
A complete snapshot of the museum's digital artefact catalogue, produced by the
Artefact Catalogue app. It is meant to be readable without that app.

WHAT IS IN HERE
  records.csv     Every record, one row each. Opens in Excel or any spreadsheet.
  records.json    The same data, with full structure preserved.
  revisions.json  Every earlier version of every record. Nothing is overwritten.
  photos.json     Photograph list: which image belongs to which record, and a
                  sha256 checksum so you can verify the file is the right one.
  schema.yaml     The field definitions (version ${schemaVersion ?? "unknown"}).
                  Read this to understand what each field in records.json means.
  MANIFEST.txt    Checksums for every file above.

  Photographs are in the same storage bucket under photos/<record id>/.

IF YOU ARE READING THIS YEARS FROM NOW
Start with records.csv. It is plain text and will outlast any software.
schema.yaml explains the columns. The museum's collection management system
(eHive at the time of writing) remains the authoritative record; this is a
parallel copy made so the catalogue never depends on a single system.

DONOR DETAILS ARE NOT IN THIS EXPORT
Donor names, addresses, emails, phone numbers and tax incentive numbers are
personal information and are deliberately excluded. They are held separately.
`;
}

/**
 * Serve the built app.
 *
 * This is a single-page app: /explore is a route inside the JavaScript bundle,
 * not a file on disk. The assets binding only knows about files, so it returns
 * 404 for any route and the browser shows a blank page.
 *
 * So: try the asset first (real files — the bundle, the icons, the manifest),
 * and when it isn't found and the browser is asking for a page rather than an
 * asset, serve index.html and let the app route it. Requests for missing files
 * still 404 properly, which matters — a missing image should not silently return
 * a page of HTML.
 */
async function serveApp(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 404) return asset;

  const wantsPage =
    request.method === "GET" &&
    (request.headers.get("Accept") ?? "").includes("text/html");

  if (!wantsPage) return asset;

  const url = new URL(request.url);
  url.pathname = "/index.html";
  const page = await env.ASSETS.fetch(new Request(url.toString(), request));

  // Re-issue with a 200: the browser must not treat the app shell as an error.
  return new Response(page.body, {
    status: 200,
    headers: page.headers,
  });
}
