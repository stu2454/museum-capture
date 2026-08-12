/**
 * Sync API. Mount this from whatever your Worker's entry file is:
 *
 *   import { handleApi } from "./server/api";
 *   export default {
 *     async fetch(request, env, ctx) {
 *       const url = new URL(request.url);
 *       if (url.pathname.startsWith("/api/")) return handleApi(request, env);
 *       return env.ASSETS.fetch(request);   // your existing static handling
 *     }
 *   };
 *
 * Written as one exported function so it drops into any structure — Hono,
 * itty-router, or a bare fetch handler.
 *
 * Bindings required (wrangler.toml):
 *   [[d1_databases]] binding = "DB"      database_name = "artefact-catalogue"
 *   [[r2_buckets]]   binding = "PHOTOS"  bucket_name   = "artefact-photos"
 */

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
}

/**
 * D1 allows 50 queries per Worker invocation on the free plan. Each record costs
 * two statements (upsert + revision insert), so 20 records is a deliberately
 * conservative ceiling that leaves headroom for the pull query and the log write.
 * The client pages through anything larger.
 */
const MAX_RECORDS_PER_SYNC = 20;

interface IncomingRecord {
  id: string;
  registration_number: string | null;
  object_name: string | null;
  status: string;
  schema_version: number;
  values_json: string;
  captured_by: string | null;
  captured_at: string | null;
  updated_at: string;
  revision: number;
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");

  // Identity comes from Cloudflare Access, which must sit in front of this.
  const volunteer = (request.headers.get("Cf-Access-Authenticated-User-Email") ?? "").trim().toLowerCase();

  // Being able to receive a one-time PIN is not permission to write to the
  // museum's collection. The Access policy decides who may authenticate; the
  // users table decides who may actually do anything. Both are required.
  //
  // This check exists because the Access policy is deliberately broad — an admin
  // adds volunteers in the app, not in the Cloudflare dashboard — which means
  // strangers can reach this Worker with a valid session. They get nothing.
  if (volunteer) {
    const allowed = await env.DB.prepare(
      `SELECT 1 FROM users WHERE email = ?1 AND status = 'active'`
    )
      .bind(volunteer)
      .first();

    if (!allowed) {
      return json(
        {
          error: "not_authorised",
          message:
            "You're signed in, but you haven't been given access to the collection yet. " +
            "Ask a museum administrator to add you.",
        },
        403
      );
    }
  }

  try {
    if (path === "/sync" && request.method === "POST") return await sync(request, env, volunteer);
    if (path.startsWith("/photos/") && request.method === "PUT") return await putPhoto(request, env, path, volunteer);
    if (path.startsWith("/photos/") && request.method === "GET") return await getPhoto(env, path);
    if (path === "/health") return json({ ok: true, at: new Date().toISOString() });
    return json({ error: "Not found" }, 404);
  } catch (error) {
    // Never leak internals to the client, but keep them in the Worker log.
    console.error("api error", error);
    return json({ error: "Server error" }, 500);
  }
}

/**
 * Push and pull in a single round trip. Rural wifi makes round trips expensive,
 * and a half-completed two-call sync is harder to reason about than one call that
 * either happened or didn't.
 */
async function sync(request: Request, env: Env, volunteer: string): Promise<Response> {
  const body = (await request.json()) as {
    device_id: string;
    since?: string;
    records?: IncomingRecord[];
  };

  const incoming = (body.records ?? []).slice(0, MAX_RECORDS_PER_SYNC);
  const truncated = (body.records ?? []).length > MAX_RECORDS_PER_SYNC;
  const applied: string[] = [];
  const superseded: string[] = [];

  if (incoming.length) {
    const statements: D1PreparedStatement[] = [];

    for (const record of incoming) {
      // Last-write-wins on the client clock, but only forwards: a device that has
      // been offline cannot overwrite a newer edit made elsewhere.
      statements.push(
        env.DB.prepare(
          `INSERT INTO records
             (id, registration_number, object_name, status, schema_version, values_json,
              captured_by, captured_at, updated_at, device_id, revision)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
           ON CONFLICT(id) DO UPDATE SET
             registration_number = excluded.registration_number,
             object_name         = excluded.object_name,
             status              = excluded.status,
             values_json         = excluded.values_json,
             updated_at          = excluded.updated_at,
             device_id           = excluded.device_id,
             revision            = records.revision + 1,
             synced_at           = datetime('now')
           WHERE excluded.updated_at > records.updated_at`
        ).bind(
          record.id,
          record.registration_number,
          record.object_name,
          record.status,
          record.schema_version,
          record.values_json,
          record.captured_by,
          record.captured_at,
          record.updated_at,
          body.device_id,
          record.revision
        )
      );

      // The revision goes in unconditionally, even when the upsert above is
      // rejected as stale. That losing version is exactly what you want to still
      // have when someone asks why a field changed.
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO record_revisions
             (record_id, revision, values_json, status, captured_by, updated_at, device_id)
           VALUES (?1,?2,?3,?4,?5,?6,?7)`
        ).bind(
          record.id,
          record.revision,
          record.values_json,
          record.status,
          record.captured_by,
          record.updated_at,
          body.device_id
        )
      );
    }

    try {
      await env.DB.batch(statements);
    } catch (error) {
      // Record the failure where a human can find it. Previously this threw, the
      // client swallowed it, and the only symptom was an empty database.
      const message = error instanceof Error ? error.message : String(error);
      await env.DB.prepare(
        `INSERT INTO sync_errors (device_id, volunteer, record_id, stage, message)
         VALUES (?1, ?2, ?3, 'upsert', ?4)`
      )
        .bind(body.device_id, volunteer, incoming[0]?.id ?? null, message)
        .run()
        .catch(() => undefined); // never let logging mask the original error
      throw error;
    }

    // Report back which pushes actually took effect, so the client can show a
    // volunteer that their edit lost rather than silently dropping it.
    const ids = incoming.map((r) => r.id);
    const check = await env.DB.prepare(
      `SELECT id, updated_at FROM records WHERE id IN (${ids.map(() => "?").join(",")})`
    )
      .bind(...ids)
      .all<{ id: string; updated_at: string }>();

    const server = new Map(check.results.map((r) => [r.id, r.updated_at]));
    for (const record of incoming) {
      if (server.get(record.id) === record.updated_at) applied.push(record.id);
      else superseded.push(record.id);
    }
  }

  // Pull everything changed since the client last heard from us.
  const since = body.since ?? "1970-01-01T00:00:00Z";
  const changed = await env.DB.prepare(
    `SELECT id, registration_number, object_name, status, schema_version, values_json,
            captured_by, captured_at, updated_at, revision, deleted_at
     FROM records
     WHERE synced_at > ?1
     ORDER BY synced_at
     LIMIT 100`
  )
    .bind(since)
    .all();

  await env.DB.prepare(
    `INSERT INTO sync_log (device_id, volunteer, action, detail) VALUES (?1,?2,'push',?3)`
  )
    .bind(body.device_id, volunteer, `${applied.length} applied, ${superseded.length} superseded`)
    .run();

  return json({
    applied,
    superseded,
    truncated,
    records: changed.results,
    server_time: new Date().toISOString(),
  });
}

/**
 * Photo upload. The client sends the sha256 it computed; if we already hold that
 * hash the bytes aren't stored twice — which matters on a metered connection when
 * a volunteer re-syncs a record whose photos already went up.
 */
async function putPhoto(request: Request, env: Env, path: string, volunteer: string): Promise<Response> {
  const photoId = path.split("/")[2];
  const recordId = request.headers.get("X-Record-Id");
  const sha256 = request.headers.get("X-Sha256");
  const isPrimary = request.headers.get("X-Primary") === "1";

  if (!photoId || !recordId) return json({ error: "Missing photo or record id" }, 400);

  if (sha256) {
    const existing = await env.DB.prepare(
      `SELECT id, r2_key FROM photos WHERE sha256 = ?1 AND deleted_at IS NULL LIMIT 1`
    )
      .bind(sha256)
      .first<{ id: string; r2_key: string }>();
    if (existing) return json({ id: existing.id, r2_key: existing.r2_key, deduplicated: true });
  }

  const key = `photos/${recordId}/${photoId}.jpg`;
  const body = await request.arrayBuffer();
  await env.PHOTOS.put(key, body, {
    httpMetadata: { contentType: request.headers.get("Content-Type") ?? "image/jpeg" },
  });

  await env.DB.prepare(
    `INSERT INTO photos (id, record_id, r2_key, sha256, bytes, is_primary, added_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7)
     ON CONFLICT(id) DO UPDATE SET r2_key=excluded.r2_key, sha256=excluded.sha256, bytes=excluded.bytes`
  )
    .bind(photoId, recordId, key, sha256, body.byteLength, isPrimary ? 1 : 0, new Date().toISOString())
    .run();

  await env.DB.prepare(
    `INSERT INTO sync_log (volunteer, action, record_id, detail) VALUES (?1,'photo_upload',?2,?3)`
  )
    .bind(volunteer, recordId, key)
    .run();

  return json({ id: photoId, r2_key: key, deduplicated: false });
}

async function getPhoto(env: Env, path: string): Promise<Response> {
  const photoId = path.split("/")[2];
  const row = await env.DB.prepare(
    `SELECT r2_key, content_type FROM photos WHERE id = ?1 AND deleted_at IS NULL`
  )
    .bind(photoId)
    .first<{ r2_key: string; content_type: string }>();

  if (!row) return json({ error: "Not found" }, 404);

  const object = await env.PHOTOS.get(row.r2_key);
  if (!object) return json({ error: "Image missing from storage" }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type ?? "image/jpeg",
      // Photo bytes never change for a given id, so this is safe to cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
