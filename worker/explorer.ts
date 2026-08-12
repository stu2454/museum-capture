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
}

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
    `SELECT email, display_name, role, status FROM users WHERE email = ?1`
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
    return { email, display_name: email, role: "admin", status: "active" };
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
    if (path === "/me") return json({ user });
    if (path === "/records" && request.method === "GET") return await listRecords(request, env, url);
    if (path.startsWith("/records/") && request.method === "GET") return await getRecord(env, path);
    if (path.startsWith("/photo/") && request.method === "GET") return await getPhoto(env, path);

    if (path === "/users") {
      if (user.role !== "admin") return json({ error: "admins_only" }, 403);
      if (request.method === "GET") return await listUsers(env);
      if (request.method === "POST") return await addUser(request, env, user);
      if (request.method === "DELETE") return await removeUser(request, env, user);
    }

    return json({ error: "not_found" }, 404);
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

  const record = await env.DB.prepare(
    `SELECT id, registration_number, object_name, status, schema_version, values_json,
            captured_by, captured_at, updated_at, revision
     FROM records WHERE id = ?1 AND deleted_at IS NULL`
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
      `SELECT revision, status, captured_by, updated_at FROM record_revisions
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
