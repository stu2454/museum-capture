/**
 * Record explorer and user administration.
 *
 * SECURITY MODEL — read this before changing anything here.
 *
 * Authentication is done by Cloudflare Access, in front of this Worker. By the
 * time a request arrives, Access has already verified the person's email via a
 * one-time PIN or an identity provider, and put it in a header. There are no
 * passwords in this application and none should ever be added.
 *
 * This file does AUTHORISATION: given a verified email, what is this person
 * allowed to do? Every handler calls requireUser() first. A verified email that
 * isn't in the users table gets nothing — being able to receive a PIN is not the
 * same as being allowed into the collection.
 *
 * The header can only be trusted because Access sits in front. If the Worker is
 * ever exposed without Access, anyone could set that header themselves. That is
 * the single assumption the whole model rests on.
 */

import yaml from "js-yaml";
import { buildEhiveBundle, buildImportedRecords, type KnownTerms } from "./ehive";

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
}

export type Role = "admin" | "volunteer" | "viewer";

interface User {
  email: string;
  display_name: string | null;
  role: Role;
  status: string;
  /** A palette name such as "sage", never a colour value. May be unset. */
  avatar_colour: string | null;
}

/**
 * The badge palette, by name. Keep in step with SWATCHES in src/avatars.ts.
 *
 * Checked rather than trusted: what arrives here ends up as a class name on a
 * page, and an allowlist of ten known words is a cheaper guarantee than any
 * amount of escaping downstream.
 */
const COLOURS = new Set([
  "ink",
  "indigo",
  "teal",
  "sage",
  "moss",
  "ochre",
  "umber",
  "oxide",
  "plum",
  "slate",
]);

const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";

/**
 * Identify the caller and check they're allowed in.
 *
 * Returns null when the person should be refused — the caller turns that into a
 * 403 with a message telling them who to ask, rather than a bare rejection.
 */
async function requireUser(request: Request, env: Env): Promise<User | null> {
  const raw = request.headers.get(ACCESS_EMAIL_HEADER);
  if (!raw) return null;
  const email = raw.trim().toLowerCase();

  const existing = await env.DB.prepare(
    `SELECT email, display_name, role, status, avatar_colour FROM users WHERE email = ?1`
  )
    .bind(email)
    .first<User>();

  if (existing) {
    if (existing.status !== "active") return null;
    // Fire and forget — a failed timestamp update must not block someone's work.
    await env.DB.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE email = ?1`)
      .bind(email)
      .run()
      .catch(() => undefined);
    return existing;
  }

  // Bootstrap: the very first person to arrive becomes the admin, and only while
  // the table is empty. This avoids a permanent back door in the code, but it
  // does mean whoever sets this up must be the first through the door.
  const { total } = (await env.DB.prepare(`SELECT total FROM user_summary`).first<{ total: number }>()) ?? {
    total: 1,
  };

  if (total === 0) {
    await env.DB.prepare(
      `INSERT INTO users (email, display_name, role, note)
       VALUES (?1, ?1, 'admin', 'First user — promoted automatically at setup.')`
    )
      .bind(email)
      .run();
    await log(env, email, "add_user", email, "Bootstrap admin");
    return { email, display_name: email, role: "admin", status: "active", avatar_colour: null };
  }

  await log(env, email, "denied", null, "Not in the user list");
  return null;
}

async function log(env: Env, actor: string, action: string, target?: string | null, detail?: string) {
  await env.DB.prepare(
    `INSERT INTO access_log (actor, action, target, detail) VALUES (?1, ?2, ?3, ?4)`
  )
    .bind(actor, action, target ?? null, detail ?? null)
    .run()
    .catch(() => undefined);
}

export async function handleExplorer(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");

  const user = await requireUser(request, env);
  if (!user) {
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

  try {
    if (path === "/me") {
      // The one thing a person may change without an admin: their own name and
      // colour. Nothing else, and nobody else's.
      if (request.method === "PATCH") return await updateMe(request, env, user);
      return json({ user });
    }

    // The registered roster, for the capture app's "who is cataloguing" picker.
    //
    // Readable by any authorised user, not just admins: these are the names and
    // addresses of people who already work together, and the picker is useless
    // without them. What stays behind the admin check is everything that isn't
    // needed to attribute a record — roles, sign-in times, who added whom, and
    // suspended accounts. Those live in /users.
    if (path === "/people" && request.method === "GET") {
      const rows = await env.DB.prepare(
        `SELECT email, display_name, avatar_colour FROM users
         WHERE status = 'active'
         ORDER BY COALESCE(NULLIF(TRIM(display_name), ''), email)`
      ).all();
      return json({ people: rows.results });
    }

    // The eHive import file. Admins only: it is the whole collection in one
    // download, and preparing an import is a committee job, not a cataloguing one.
    if (path === "/export/ehive" && request.method === "GET") {
      if (user.role !== "admin") return json({ error: "admins_only" }, 403);
      return await ehiveExport(env);
    }

    // Bring the reference copy into the collection proper.
    if (path === "/import/ehive" && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "admins_only" }, 403);
      return await ehiveImport(env, user);
    }

    if (path === "/removed" && request.method === "GET") {
      if (user.role !== "admin") return json({ error: "admins_only" }, 403);
      const rows = await env.DB.prepare(`SELECT * FROM removed_records LIMIT 100`).all();
      return json({ records: rows.results });
    }

    if (path.startsWith("/records/") && path.endsWith("/remove") && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "admins_only" }, 403);
      return await removeRecord(request, env, path, user);
    }

    if (path.startsWith("/records/") && path.endsWith("/restore") && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "admins_only" }, 403);
      return await restoreRecord(env, path, user);
    }
    if (path === "/records" && request.method === "GET") return await listRecords(request, env, url);
    if (path.startsWith("/records/") && request.method === "GET") return await getRecord(env, path);
    if (path.startsWith("/photo/") && request.method === "GET") return await getPhoto(env, path);

    if (path === "/users") {
      if (user.role !== "admin") return json({ error: "admins_only" }, 403);
      if (request.method === "GET") return await listUsers(env);
      if (request.method === "POST") return await addUser(request, env, user);
      if (request.method === "DELETE") return await removeUser(request, env, user);
    }

    return json(
      {
        error: "unknown_endpoint",
        message:
          `This app asked for something the server doesn't recognise (${request.method} ${path}). ` +
          `The server may be running an older version — try again in a minute, or reload the page.`,
      },
      404
    );
  } catch (error) {
    console.error("explorer error", error);
    return json({ error: "server_error" }, 500);
  }
}

/**
 * Search and browse. Deliberately one endpoint: volunteers don't distinguish
 * between "browsing" and "searching", they just type something or don't.
 */
async function listRecords(request: Request, env: Env, url: URL): Promise<Response> {
  const query = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  const where: string[] = ["r.deleted_at IS NULL"];
  const binds: unknown[] = [];

  if (query) {
    // Search the whole answer set, not just the name. A volunteer looking for
    // "Cherry & Sons" is searching a maker's mark buried in values_json, and an
    // exact-name-only search would find nothing and look broken.
    where.push(
      `(LOWER(r.object_name) LIKE ?${binds.length + 1}
        OR LOWER(r.registration_number) LIKE ?${binds.length + 1}
        OR LOWER(r.values_json) LIKE ?${binds.length + 1})`
    );
    binds.push(`%${query.toLowerCase()}%`);
  }

  if (status) {
    where.push(`r.status = ?${binds.length + 1}`);
    binds.push(status);
  }

  const sql = `
    SELECT r.id, r.registration_number, r.object_name, r.status, r.captured_by, r.updated_at,
           (SELECT COUNT(*) FROM photos p WHERE p.record_id = r.id AND p.deleted_at IS NULL) AS photo_count,
           (SELECT p.id FROM photos p WHERE p.record_id = r.id AND p.deleted_at IS NULL
             ORDER BY p.is_primary DESC, p.added_at LIMIT 1) AS primary_photo_id
    FROM records r
    WHERE ${where.join(" AND ")}
    ORDER BY r.registration_number IS NULL, r.registration_number, r.updated_at DESC
    LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`;

  const rows = await env.DB.prepare(sql).bind(...binds, limit, offset).all();

  const counted = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM records r WHERE ${where.join(" AND ")}`
  )
    .bind(...binds)
    .first<{ n: number }>();

  return json({ records: rows.results, total: counted?.n ?? 0, limit, offset });
}

async function getRecord(env: Env, path: string): Promise<Response> {
  const id = decodeURIComponent(path.split("/")[2] ?? "");

  // captured_by holds an email for anything catalogued since the identity change,
  // and a typed name for everything before it. The join resolves the former to a
  // person; the latter simply doesn't match a row, which is the honest outcome.
  const record = await env.DB.prepare(
    `SELECT r.id, r.registration_number, r.object_name, r.status, r.schema_version,
            r.values_json, r.captured_by, r.synced_by, r.captured_at, r.updated_at,
            r.revision, u.display_name AS captured_by_name
     FROM records r
     LEFT JOIN users u ON u.email = r.captured_by
     WHERE r.id = ?1 AND r.deleted_at IS NULL`
  )
    .bind(id)
    .first();

  if (!record) return json({ error: "not_found" }, 404);

  const [photos, revisions, schema] = await Promise.all([
    env.DB.prepare(
      `SELECT id, is_primary, caption, bytes, added_at FROM photos
       WHERE record_id = ?1 AND deleted_at IS NULL ORDER BY is_primary DESC, added_at`
    )
      .bind(id)
      .all(),
    env.DB.prepare(
      `SELECT revision, status, captured_by, synced_by, updated_at FROM record_revisions
       WHERE record_id = ?1 ORDER BY revision DESC`
    )
      .bind(id)
      .all(),
    // Send the field definitions with the record so the explorer can label and
    // order fields without hardcoding any of them.
    env.DB.prepare(`SELECT yaml FROM schema_versions WHERE version = ?1`)
      .bind((record as { schema_version: number }).schema_version)
      .first<{ yaml: string }>(),
  ]);

  return json({
    record,
    photos: photos.results,
    revisions: revisions.results,
    schema_yaml: schema?.yaml ?? null,
  });
}

async function getPhoto(env: Env, path: string): Promise<Response> {
  const photoId = decodeURIComponent(path.split("/")[2] ?? "");
  const row = await env.DB.prepare(
    `SELECT r2_key, content_type FROM photos WHERE id = ?1 AND deleted_at IS NULL`
  )
    .bind(photoId)
    .first<{ r2_key: string; content_type: string }>();

  if (!row) return json({ error: "not_found" }, 404);

  const object = await env.PHOTOS.get(row.r2_key);
  if (!object) return json({ error: "image_missing" }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type ?? "image/jpeg",
      // Private: this is behind Access, so no shared cache should hold it.
      "Cache-Control": "private, max-age=86400",
    },
  });
}

/**
 * Remove a record from the collection.
 *
 * Soft delete only — the row, its revision history and its photographs all stay.
 * A record that turns out to have been removed by mistake, or removed by someone
 * who misunderstood, can be brought back with nothing lost.
 *
 * A reason is required. Six months later "why is 1994.017 missing" needs an
 * answer better than someone's memory.
 */
async function removeRecord(request: Request, env: Env, path: string, actor: User): Promise<Response> {
  const id = decodeURIComponent(path.split("/")[2] ?? "");
  const body = (await request.json()) as { reason?: string; confirm?: string };
  const reason = (body.reason ?? "").trim();

  if (reason.length < 4) {
    return json(
      { error: "reason_required", message: "Please say why this record is being removed." },
      400
    );
  }

  const record = await env.DB.prepare(
    `SELECT registration_number, object_name FROM records WHERE id = ?1 AND deleted_at IS NULL`
  )
    .bind(id)
    .first<{ registration_number: string | null; object_name: string | null }>();

  if (!record) {
    return json(
      {
        error: "record_not_found",
        message: "That record no longer exists, or it has already been removed. Try reloading.",
      },
      404
    );
  }

  // The confirmation must match what's on the record. Typing the number is a
  // deliberate speed bump — it makes removing the wrong record much harder than
  // a mis-tapped button does.
  const expected = (record.registration_number || record.object_name || "").trim();
  if ((body.confirm ?? "").trim() !== expected) {
    return json(
      {
        error: "confirm_mismatch",
        message: `Type "${expected}" exactly to confirm.`,
      },
      400
    );
  }

  await env.DB.prepare(
    `UPDATE records
     SET deleted_at = datetime('now'), deleted_by = ?2, deletion_reason = ?3
     WHERE id = ?1`
  )
    .bind(id, actor.email, reason)
    .run();

  await log(env, actor.email, "remove_record", id, `${expected} — ${reason}`);
  return json({ ok: true });
}

async function restoreRecord(env: Env, path: string, actor: User): Promise<Response> {
  const id = decodeURIComponent(path.split("/")[2] ?? "");

  await env.DB.prepare(
    `UPDATE records SET deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL WHERE id = ?1`
  )
    .bind(id)
    .run();

  await log(env, actor.email, "restore_record", id);
  return json({ ok: true });
}

/**
 * A person editing their own row.
 *
 * Scoped to the caller by construction rather than by checking: the WHERE clause
 * binds their own verified email, so there is no request that could reach someone
 * else's record. Role and status aren't writable here at all — self-service that
 * can grant permissions isn't self-service, it's a privilege escalation with a
 * friendly form on top.
 */
async function updateMe(request: Request, env: Env, actor: User): Promise<Response> {
  const body = (await request.json()) as { display_name?: string; avatar_colour?: string };

  const name =
    typeof body.display_name === "string" ? body.display_name.trim().slice(0, 60) : undefined;
  const colour = typeof body.avatar_colour === "string" ? body.avatar_colour.trim() : undefined;

  if (name !== undefined && name === "") {
    return json(
      {
        error: "empty_name",
        message: "Your name can't be blank — it's what appears on every record you catalogue.",
      },
      400
    );
  }

  if (colour !== undefined && !COLOURS.has(colour)) {
    return json({ error: "unknown_colour", message: "That isn't one of the colours." }, 400);
  }

  // COALESCE so that sending only one field leaves the other alone.
  await env.DB.prepare(
    `UPDATE users
        SET display_name  = COALESCE(?2, display_name),
            avatar_colour = COALESCE(?3, avatar_colour)
      WHERE email = ?1`
  )
    .bind(actor.email, name ?? null, colour ?? null)
    .run();

  await log(env, actor.email, "update_profile", actor.email, [
    name !== undefined ? `name=${name}` : null,
    colour !== undefined ? `colour=${colour}` : null,
  ]
    .filter(Boolean)
    .join(" "));

  const updated = await env.DB.prepare(
    `SELECT email, display_name, role, status, avatar_colour FROM users WHERE email = ?1`
  )
    .bind(actor.email)
    .first<User>();

  return json({ user: updated });
}

/**
 * Build the eHive import file for the whole collection.
 *
 * Reads the schema stored alongside the records rather than any current version:
 * a record catalogued last year must export under the mapping it was written
 * against, which is the same reason the explorer reads labels from there.
 *
 * Records are exported whatever their status. Deciding that only confirmed records
 * should go is the museum's call, and one they haven't been asked yet - so the file
 * carries everything and the screen says so, rather than quietly omitting work
 * somebody did.
 */
async function ehiveExport(env: Env): Promise<Response> {
  const [records, photos, schema] = await Promise.all([
    env.DB.prepare(
      `SELECT id, registration_number, object_name, values_json, schema_version, ehive_record_id
       FROM records WHERE deleted_at IS NULL
       ORDER BY registration_number IS NULL, registration_number`
    ).all<{
      id: string;
      registration_number: string | null;
      object_name: string | null;
      values_json: string;
      schema_version: number;
      ehive_record_id: string | null;
    }>(),
    env.DB.prepare(
      `SELECT id, record_id, is_primary FROM photos
       WHERE deleted_at IS NULL ORDER BY is_primary DESC, added_at`
    ).all<{ id: string; record_id: string; is_primary: number }>(),
    env.DB.prepare(`SELECT version, yaml FROM schema_versions ORDER BY version DESC LIMIT 1`)
      .first<{ version: number; yaml: string }>(),
  ]);

  if (!schema?.yaml) {
    return json(
      {
        error: "no_schema",
        message:
          "The field definitions aren't loaded in the database, so there is nothing to map " +
          "the records against. Run the schema seed and try again.",
      },
      409
    );
  }

  const byRecord = new Map<string, Array<{ id: string; is_primary: number }>>();
  for (const p of photos.results) {
    const list = byRecord.get(p.record_id) ?? [];
    list.push({ id: p.id, is_primary: p.is_primary });
    byRecord.set(p.record_id, list);
  }

  // What eHive already holds, so a value can be reported as new rather than merely
  // unfamiliar. Absent until an XML report has been imported, and that is fine.
  const terms = await env.DB.prepare(`SELECT field, term FROM ehive_terms`)
    .all<{ field: string; term: string }>()
    .catch(() => ({ results: [] as Array<{ field: string; term: string }> }));

  // ehive_terms is keyed by eHive's field name; the builder wants ours.
  const schemaFields = (yaml.load(schema.yaml) as {
    fields?: Array<{ id: string; mapping?: { ehive?: string } | null }>;
  }).fields ?? [];

  const known: KnownTerms = {};
  for (const row of terms.results) {
    for (const f of schemaFields) {
      if (f.mapping?.ehive === row.field) {
        (known[f.id] ??= []).push(row.term);
      }
    }
  }

  const bundle = buildEhiveBundle(
    records.results.map((r) => ({ ...r, photos: byRecord.get(r.id) ?? [] })),
    schema.yaml,
    known
  );

  return json({ ...bundle, schema_version: schema.version });
}

/**
 * Turn the eHive reference copy into records in the collection.
 *
 * Idempotent by eHive's own record id: running it twice updates the same rows
 * rather than making a second set. That matters because the obvious failure here
 * is a duplicate collection, and the obvious human behaviour is to click a button
 * again when unsure whether the first click worked.
 *
 * Imported records are marked 'exported', which is the truthful status: they are
 * already in eHive. That also means the next export sends them back as updates,
 * carrying their id in column C, rather than as new objects.
 *
 * A record catalogued here that has since been given the same eHive id is left
 * alone - the volunteer's work wins over a re-import of the source it came from.
 */
async function ehiveImport(env: Env, actor: User): Promise<Response> {
  const [source, schema] = await Promise.all([
    env.DB.prepare(`SELECT object_record_id, fields_json FROM ehive_records`).all<{
      object_record_id: string;
      fields_json: string;
    }>(),
    env.DB.prepare(`SELECT version, yaml FROM schema_versions ORDER BY version DESC LIMIT 1`)
      .first<{ version: number; yaml: string }>(),
  ]);

  if (!source.results.length) {
    return json(
      {
        error: "nothing_to_import",
        message:
          "No eHive records have been loaded yet. Import an eHive XML report first with " +
          "scripts/import-ehive-xml.mjs.",
      },
      409
    );
  }

  if (!schema?.yaml) {
    return json({ error: "no_schema", message: "The field definitions aren't loaded." }, 409);
  }

  const { records, unmapped } = buildImportedRecords(source.results, schema.yaml);
  const now = new Date().toISOString();

  // D1 allows 50 queries per invocation on the free plan; batching keeps one
  // statement per record well inside it for a collection of this size.
  const statements = records.map((r) =>
    env.DB.prepare(
      `INSERT INTO records
         (id, registration_number, object_name, status, schema_version, values_json,
          captured_by, captured_at, updated_at, device_id, revision, synced_by, ehive_record_id)
       VALUES (?1,?2,?3,'exported',?4,?5,?6,?7,?8,'ehive-import',1,?9,?10)
       ON CONFLICT(id) DO UPDATE SET
         registration_number = excluded.registration_number,
         object_name         = excluded.object_name,
         values_json         = excluded.values_json,
         updated_at          = excluded.updated_at,
         synced_at           = datetime('now'),
         revision            = records.revision + 1`
    ).bind(
      `ehive_${r.ehive_record_id}`,
      r.registration_number,
      r.object_name,
      schema.version,
      r.values_json,
      r.captured_by,
      r.captured_at,
      now,
      actor.email,
      r.ehive_record_id
    )
  );

  await env.DB.batch(statements);
  await log(env, actor.email, "import_ehive", null, `${records.length} records`);

  return json({
    imported: records.length,
    unmapped_fields: Object.entries(unmapped)
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count),
  });
}

async function listUsers(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT email, display_name, role, status, added_by, added_at, last_seen_at
     FROM users ORDER BY role, email`
  ).all();
  return json({ users: rows.results });
}

async function addUser(request: Request, env: Env, actor: User): Promise<Response> {
  const body = (await request.json()) as { email?: string; display_name?: string; role?: Role };
  const email = (body.email ?? "").trim().toLowerCase();
  const role: Role = body.role === "admin" || body.role === "viewer" ? body.role : "volunteer";

  if (!email.includes("@") || email.length < 5) {
    return json({ error: "invalid_email", message: "That doesn't look like an email address." }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO users (email, display_name, role, added_by)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(email) DO UPDATE SET
       display_name = excluded.display_name,
       role = excluded.role,
       status = 'active'`
  )
    .bind(email, body.display_name?.trim() || null, role, actor.email)
    .run();

  await log(env, actor.email, "add_user", email, `role=${role}`);
  return json({ ok: true, email, role });
}

async function removeUser(request: Request, env: Env, actor: User): Promise<Response> {
  const body = (await request.json()) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  if (email === actor.email) {
    return json(
      { error: "self_removal", message: "You can't remove your own access." },
      400
    );
  }

  // Never let the last admin be removed — that would lock everyone out of user
  // management permanently, with no way back except editing the database by hand.
  const summary = await env.DB.prepare(`SELECT admins FROM user_summary`).first<{ admins: number }>();
  const target = await env.DB.prepare(`SELECT role FROM users WHERE email = ?1`)
    .bind(email)
    .first<{ role: Role }>();

  if (target?.role === "admin" && (summary?.admins ?? 0) <= 1) {
    return json(
      {
        error: "last_admin",
        message: "This is the only administrator. Make someone else an administrator first.",
      },
      400
    );
  }

  // Suspend rather than delete, so the audit trail still makes sense later.
  await env.DB.prepare(`UPDATE users SET status = 'suspended' WHERE email = ?1`).bind(email).run();
  await log(env, actor.email, "remove_user", email);
  return json({ ok: true });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
