/**
 * Contributions — the /contribute trial (October 2026).
 *
 * Any volunteer can pick an object that has already been photographed and add
 * what they know about it, typed or spoken. A machine description of the photos
 * can be revealed afterwards, and corrected. Admins read everything on a review
 * page.
 *
 * Read migrations/0010_contributions.sql first. The rules that matter:
 *
 *  - A contribution never changes a record. It is evidence beside the record.
 *  - Contributions may name donors and other living people, so they are
 *    RESTRICTED: a volunteer can read back only their own; only admins read
 *    everyone's; nothing here goes into an export or the weekly snapshot.
 *  - Who sent it comes from the Access header (contributed_by). Who the screen
 *    said was speaking is a separate, weaker claim (speaking_for).
 *  - Whether the machine description had been shown is recorded on every
 *    contribution (ai_seen), so a reviewer can tell independent knowledge from
 *    agreement with a guess.
 *  - The machine description costs money per call. It is made once per object
 *    and stored; showing it again is free. With no ANTHROPIC_API_KEY set, the
 *    feature simply isn't offered.
 */

import { requireUser, type User } from "./explorer";

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  /** Set with `npx wrangler secret put ANTHROPIC_API_KEY`. Never in the repo. */
  ANTHROPIC_API_KEY?: string;
  /** Optional override of the model used for descriptions. */
  AI_MODEL?: string;
}

const DEFAULT_MODEL = "claude-sonnet-5-5";
const PROMPT_VERSION = "describe-v1";

/** Recordings longer than this are refused rather than silently cut. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_TEXT = 20_000;
/** The API refuses images over 5 MB; leave headroom for base64 overhead. */
const MAX_IMAGE_BYTES = 3_700_000;
const MAX_IMAGES = 4;

const QUESTIONS = new Set(["use", "origin", "story", "other", "ai_check"]);

export async function handleContribute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/contribute/, "");

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
    if (path === "/objects" && request.method === "GET") return await listObjects(env, url, user);

    const objectMatch = path.match(/^\/objects\/([^/]+)$/);
    if (objectMatch && request.method === "GET") {
      return await getObject(env, decodeURIComponent(objectMatch[1]), user);
    }

    const sendMatch = path.match(/^\/objects\/([^/]+)\/contributions$/);
    if (sendMatch && request.method === "POST") {
      if (user.role === "viewer") return json({ error: "read_only", message: readOnly }, 403);
      return await addContribution(request, env, decodeURIComponent(sendMatch[1]), user);
    }

    const aiMatch = path.match(/^\/objects\/([^/]+)\/ai$/);
    if (aiMatch && request.method === "GET") {
      return await getDescription(env, decodeURIComponent(aiMatch[1]));
    }
    if (aiMatch && request.method === "POST") {
      if (user.role === "viewer") return json({ error: "read_only", message: readOnly }, 403);
      const redo = url.searchParams.get("redo") === "1";
      if (redo && user.role !== "admin") return json({ error: "admins_only" }, 403);
      return await makeDescription(env, decodeURIComponent(aiMatch[1]), user, redo);
    }

    const audioMatch = path.match(/^\/audio\/([^/]+)$/);
    if (audioMatch && request.method === "GET") {
      return await getAudio(env, decodeURIComponent(audioMatch[1]), user);
    }

    if (path === "/review" && request.method === "GET") {
      if (user.role !== "admin") return json({ error: "admins_only" }, 403);
      return await review(env, url);
    }

    return json({ error: "unknown_endpoint" }, 404);
  } catch (error) {
    console.error("contribute error", error);
    return json({ error: "server_error" }, 500);
  }
}

const readOnly =
  "Your account can look at the collection but not add to it. Ask a museum administrator.";

/**
 * Objects worth contributing to: anything with at least one photograph, since
 * people can't remember an object they can't see.
 *
 * Default order puts the objects with the fewest contributions first, so the
 * trial spreads across the collection instead of piling onto the interesting
 * ones. A search box overrides it for someone looking for a particular thing.
 *
 * Counts of other people's contributions are shown; their contents are not.
 */
async function listObjects(env: Env, url: URL, user: User): Promise<Response> {
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 24, 1), 60);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const where = [
    "r.deleted_at IS NULL",
    "EXISTS (SELECT 1 FROM photos p WHERE p.record_id = r.id AND p.deleted_at IS NULL)",
  ];
  const binds: unknown[] = [];
  if (query) {
    where.push(`(LOWER(r.object_name) LIKE ?1 OR LOWER(r.registration_number) LIKE ?1)`);
    binds.push(`%${query}%`);
  }

  const n = binds.length;
  const rows = await env.DB.prepare(
    `SELECT r.id, r.registration_number, r.object_name,
            (SELECT p.id FROM photos p WHERE p.record_id = r.id AND p.deleted_at IS NULL
              ORDER BY p.is_primary DESC, p.added_at LIMIT 1) AS primary_photo_id,
            (SELECT COUNT(*) FROM contributions c
              WHERE c.record_id = r.id AND c.deleted_at IS NULL) AS contribution_count,
            (SELECT COUNT(*) FROM contributions c
              WHERE c.record_id = r.id AND c.deleted_at IS NULL
                AND c.contributed_by = ?${n + 1}) AS mine
     FROM records r
     WHERE ${where.join(" AND ")}
     ORDER BY contribution_count, r.registration_number IS NULL, r.registration_number, r.id
     LIMIT ?${n + 2} OFFSET ?${n + 3}`
  )
    .bind(...binds, user.email, limit, offset)
    .all();

  const counted = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM records r WHERE ${where.join(" AND ")}`
  )
    .bind(...binds)
    .first<{ n: number }>();

  return json({ objects: rows.results, total: counted?.n ?? 0, limit, offset });
}

/**
 * One object: its number, name and photographs, and what THIS person has
 * already said about it. Deliberately not the record's catalogue text — the
 * point is to hear what people know, not have them check what's written.
 */
async function getObject(env: Env, recordId: string, user: User): Promise<Response> {
  const record = await env.DB.prepare(
    `SELECT id, registration_number, object_name FROM records WHERE id = ?1 AND deleted_at IS NULL`
  )
    .bind(recordId)
    .first();
  if (!record) return json({ error: "not_found" }, 404);

  const [photos, mine, described] = await Promise.all([
    env.DB.prepare(
      `SELECT id, is_primary FROM photos WHERE record_id = ?1 AND deleted_at IS NULL
       ORDER BY is_primary DESC, added_at`
    )
      .bind(recordId)
      .all(),
    env.DB.prepare(
      `SELECT id, question, question_text, body, audio_r2_key IS NOT NULL AS has_audio,
              audio_seconds, ai_seen, created_at
       FROM contributions
       WHERE record_id = ?1 AND contributed_by = ?2 AND deleted_at IS NULL
       ORDER BY created_at`
    )
      .bind(recordId, user.email)
      .all(),
    env.DB.prepare(`SELECT 1 AS yes FROM ai_descriptions WHERE record_id = ?1 LIMIT 1`)
      .bind(recordId)
      .first(),
  ]);

  return json({
    object: record,
    photos: photos.results,
    mine: mine.results,
    // Offered when a description exists already (free to show) or can be made.
    ai_available: Boolean(described) || Boolean(env.ANTHROPIC_API_KEY),
    can_contribute: user.role !== "viewer",
  });
}

/**
 * Save one contribution. Multipart form: question, question_text, body,
 * ai_seen, speaking_for, and optionally `audio` (a file) with `audio_seconds`.
 *
 * The audio goes to R2 first and the row second, so a row never points at a
 * recording that isn't there. If the row write fails after the upload, the
 * recording is orphaned but kept — losing someone's words is worse than a
 * stray file.
 */
async function addContribution(request: Request, env: Env, recordId: string, user: User): Promise<Response> {
  const exists = await env.DB.prepare(`SELECT 1 FROM records WHERE id = ?1 AND deleted_at IS NULL`)
    .bind(recordId)
    .first();
  if (!exists) return json({ error: "not_found" }, 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "bad_request", message: "The contribution didn't arrive in a readable form." }, 400);
  }

  const question = String(form.get("question") ?? "");
  if (!QUESTIONS.has(question)) return json({ error: "bad_question" }, 400);

  const body = String(form.get("body") ?? "").trim();
  if (body.length > MAX_TEXT) {
    return json({ error: "too_long", message: "That's longer than we can save in one go. Please split it." }, 413);
  }

  // Typed as a string by the Workers FormData declarations; a file arrives as a
  // File at run time, so check its shape rather than its declared type.
  const audio = form.get("audio") as unknown as File | string | null;
  const hasAudio = typeof audio === "object" && audio !== null && audio.size > 0;
  if (!body && !hasAudio) {
    return json({ error: "empty", message: "There's nothing to save yet — type something or make a recording." }, 400);
  }

  const id = `con_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

  let audioKey: string | null = null;
  let audioType: string | null = null;
  let audioBytes: number | null = null;
  let audioSeconds: number | null = null;

  if (hasAudio) {
    const file = audio as File;
    if (file.size > MAX_AUDIO_BYTES) {
      return json({ error: "too_long", message: "That recording is too long to send. Please keep recordings under ten minutes." }, 413);
    }
    audioType = (file.type || "audio/webm").split(";")[0];
    if (!audioType.startsWith("audio/")) return json({ error: "bad_audio" }, 400);
    const ext = audioType.includes("mp4") || audioType.includes("m4a") ? "m4a" : audioType.includes("ogg") ? "ogg" : "webm";
    audioKey = `contributions/${recordId}/${id}.${ext}`;
    audioBytes = file.size;
    const seconds = Number(form.get("audio_seconds"));
    audioSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 10) / 10 : null;
    await env.PHOTOS.put(audioKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: audioType },
      customMetadata: { contributed_by: user.email, record_id: recordId },
    });
  }

  const speakingFor = String(form.get("speaking_for") ?? "").trim().toLowerCase();
  const questionText = String(form.get("question_text") ?? "").slice(0, 500) || null;
  const aiSeen = form.get("ai_seen") === "1" ? 1 : 0;

  await env.DB.prepare(
    `INSERT INTO contributions
       (id, record_id, question, question_text, body, audio_r2_key, audio_type, audio_bytes,
        audio_seconds, ai_seen, contributed_by, speaking_for)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  )
    .bind(
      id,
      recordId,
      question,
      questionText,
      body || null,
      audioKey,
      audioType,
      audioBytes,
      audioSeconds,
      aiSeen,
      user.email,
      speakingFor && speakingFor !== user.email ? speakingFor : null
    )
    .run();

  return json({ ok: true, id });
}

/** A recording: to its own contributor, or to an admin. Nobody else. */
async function getAudio(env: Env, contributionId: string, user: User): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT audio_r2_key, audio_type, contributed_by FROM contributions
     WHERE id = ?1 AND deleted_at IS NULL`
  )
    .bind(contributionId)
    .first<{ audio_r2_key: string | null; audio_type: string | null; contributed_by: string }>();

  if (!row || !row.audio_r2_key) return json({ error: "not_found" }, 404);
  if (user.role !== "admin" && row.contributed_by !== user.email) return json({ error: "admins_only" }, 403);

  const object = await env.PHOTOS.get(row.audio_r2_key);
  if (!object) return json({ error: "audio_missing" }, 404);
  return new Response(object.body, {
    headers: { "Content-Type": row.audio_type ?? "audio/webm", "Cache-Control": "private, no-store" },
  });
}

/** Every contribution, newest first, for an admin to read and listen to. */
async function review(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  // The newest machine transcript of each recording, if there is one (migration
  // 0011, made by transcribe/transcribe.py). If that migration hasn't been applied
  // yet, the page still works, just without transcripts.
  const base = `SELECT c.id, c.record_id, c.question, c.question_text, c.body,
            c.audio_r2_key IS NOT NULL AS has_audio, c.audio_seconds, c.ai_seen,
            c.contributed_by, c.speaking_for, c.created_at,
            r.registration_number, r.object_name,
            u.display_name AS contributor_name,
            s.display_name AS speaking_for_name`;
  const from = `FROM contributions c
     JOIN records r ON r.id = c.record_id
     LEFT JOIN users u ON u.email = c.contributed_by
     LEFT JOIN users s ON s.email = c.speaking_for`;
  const rest = `WHERE c.deleted_at IS NULL
     ORDER BY c.created_at DESC, c.id
     LIMIT ?1 OFFSET ?2`;

  let rows: D1Result;
  try {
    rows = await env.DB.prepare(
      `${base}, t.text AS transcript_text, t.words_json AS transcript_words,
              t.notes_json AS transcript_notes, t.engine AS transcript_engine
       ${from}
       LEFT JOIN transcripts t ON t.id = (
         SELECT id FROM transcripts WHERE contribution_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1)
       ${rest}`
    )
      .bind(limit, offset)
      .all();
  } catch {
    rows = await env.DB.prepare(`${base} ${from} ${rest}`).bind(limit, offset).all();
  }

  const counted = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT record_id) AS objects, COUNT(DISTINCT contributed_by) AS people
     FROM contributions WHERE deleted_at IS NULL`
  ).first<{ n: number; objects: number; people: number }>();

  return json({
    contributions: rows.results,
    total: counted?.n ?? 0,
    objects: counted?.objects ?? 0,
    people: counted?.people ?? 0,
    limit,
    offset,
  });
}

// ---------------------------------------------------------------- machine description

async function getDescription(env: Env, recordId: string): Promise<Response> {
  const row = await latestDescription(env, recordId);
  if (!row) return json({ description: null, can_make: Boolean(env.ANTHROPIC_API_KEY) });
  return json({ description: row });
}

async function latestDescription(env: Env, recordId: string) {
  const row = await env.DB.prepare(
    `SELECT id, model, created_at, description_json FROM ai_descriptions
     WHERE record_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1`
  )
    .bind(recordId)
    .first<{ id: string; model: string; created_at: string; description_json: string }>();
  if (!row) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(row.description_json);
  } catch {
    /* keep the row; the page shows that it couldn't be read */
  }
  return { id: row.id, model: row.model, created_at: row.created_at, ...((parsed as object) ?? {}) };
}

/**
 * Make (or, for an admin, remake) the description of an object from its
 * photographs. Returns the stored one if it exists and no remake was asked for,
 * so two people opening the panel at once cost one call, mostly.
 */
async function makeDescription(env: Env, recordId: string, user: User, redo: boolean): Promise<Response> {
  if (!redo) {
    const existing = await latestDescription(env, recordId);
    if (existing) return json({ description: existing });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "ai_unavailable", message: "The machine description isn't switched on." }, 503);
  }

  const record = await env.DB.prepare(
    `SELECT registration_number, object_name FROM records WHERE id = ?1 AND deleted_at IS NULL`
  )
    .bind(recordId)
    .first<{ registration_number: string | null; object_name: string | null }>();
  if (!record) return json({ error: "not_found" }, 404);

  const photoRows = await env.DB.prepare(
    `SELECT id, r2_key, content_type, bytes FROM photos WHERE record_id = ?1 AND deleted_at IS NULL
     ORDER BY is_primary DESC, added_at LIMIT ?2`
  )
    .bind(recordId, MAX_IMAGES)
    .all<{ id: string; r2_key: string; content_type: string | null; bytes: number | null }>();

  const images: { id: string; media_type: string; data: string }[] = [];
  for (const photo of photoRows.results) {
    // Prefer the original — marks and labels are unreadable at 400px — and fall
    // back to the thumbnail only when the original is too big to send.
    let object = await env.PHOTOS.get(photo.r2_key);
    let mediaType = photo.content_type ?? "image/jpeg";
    if (!object || object.size > MAX_IMAGE_BYTES) {
      object = await env.PHOTOS.get(`thumbs/${photo.id}.jpg`);
      mediaType = "image/jpeg";
    }
    if (!object) continue;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) continue;
    images.push({ id: photo.id, media_type: mediaType, data: toBase64(await object.arrayBuffer()) });
  }
  if (!images.length) return json({ error: "no_photos", message: "This object has no photographs to describe." }, 422);

  const model = env.AI_MODEL || DEFAULT_MODEL;
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: [DESCRIBE_TOOL],
        tool_choice: { type: "tool", name: DESCRIBE_TOOL.name },
        messages: [
          {
            role: "user",
            content: [
              ...images.map((image) => ({
                type: "image",
                source: { type: "base64", media_type: image.media_type, data: image.data },
              })),
              {
                type: "text",
                text:
                  `These ${images.length} photograph(s) show one object in the Dorrigo Museum, ` +
                  `a volunteer-run local history museum on the Dorrigo Plateau, NSW, Australia. ` +
                  (record.object_name ? `The catalogue currently calls it "${record.object_name}". ` : "") +
                  `Describe what can be seen, using the describe_object tool.`,
              },
            ],
          },
        ],
      }),
    });
  } catch {
    console.error("ai description unreachable");
    return json({ error: "ai_failed", message: "The machine description couldn't be made just now. Try again later." }, 502);
  }

  if (!response.ok) {
    // Log the status only. The API's error body can echo request details, and
    // AGENTS.md has a hard-won rule about printing anything near a credential.
    console.error("ai description failed", response.status);
    return json({ error: "ai_failed", message: "The machine description couldn't be made just now. Try again later." }, 502);
  }

  const result = (await response.json()) as {
    content?: { type: string; name?: string; input?: unknown }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const call = result.content?.find((block) => block.type === "tool_use" && block.name === DESCRIBE_TOOL.name);
  if (!call?.input) return json({ error: "ai_failed", message: "The machine description came back empty." }, 502);

  const id = `aid_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await env.DB.prepare(
    `INSERT INTO ai_descriptions
       (id, record_id, model, photo_ids_json, prompt_version, description_json,
        input_tokens, output_tokens, requested_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  )
    .bind(
      id,
      recordId,
      model,
      JSON.stringify(images.map((image) => image.id)),
      PROMPT_VERSION,
      JSON.stringify(call.input),
      result.usage?.input_tokens ?? null,
      result.usage?.output_tokens ?? null,
      user.email
    )
    .run();

  return json({ description: await latestDescription(env, recordId) });
}

/**
 * The instructions. The museum's principle is that uncertainty is kept, never
 * laundered into confident prose — so the model is told to separate what it can
 * see from what it is guessing, and never to invent who owned or made a thing.
 */
const SYSTEM_PROMPT = `You help volunteers at a small Australian local history museum understand objects in their collection from photographs.

Rules:
- Describe only what the photographs show. Separate what you can see from what you are inferring.
- Never invent provenance: who owned, used, donated or made the object, or where it came from locally. Those are exactly what the volunteers will tell you; leave them to the volunteers.
- Give dates only as ranges, with how confident you are and why. "Unknown" is a good answer.
- Read any visible text, marks, labels or numbers exactly as written. If part is unreadable, say so rather than guessing.
- Use plain Australian English. Avoid jargon; where a technical term is needed, explain it in a few words. The readers are mostly retired, non-specialist volunteers.
- Keep each answer short.`;

const DESCRIBE_TOOL = {
  name: "describe_object",
  description: "Record a cautious description of a museum object from its photographs.",
  input_schema: {
    type: "object",
    properties: {
      what_it_might_be: {
        type: "string",
        description: "One short sentence: the most likely kind of object, hedged as appropriate.",
      },
      alternatives: {
        type: "array",
        items: { type: "string" },
        description: "Other things it could plausibly be, if any. Up to three.",
      },
      description: {
        type: "string",
        description: "Two to four plain sentences describing what is visible: form, colour, decoration, construction.",
      },
      materials: {
        type: "array",
        items: { type: "string" },
        description: "Likely materials, each hedged if unsure, e.g. 'probably cast iron'.",
      },
      possible_date: {
        type: "object",
        properties: {
          range: { type: "string", description: "e.g. 'c. 1920–1950', or 'unknown'." },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          reason: { type: "string", description: "What in the photographs suggests this." },
        },
        required: ["range", "confidence", "reason"],
      },
      visible_marks: {
        type: "array",
        items: { type: "string" },
        description: "Text, maker's marks, labels or numbers visible, transcribed exactly. Note anything unreadable.",
      },
      condition: { type: "string", description: "One sentence on visible wear or damage." },
      unsure_about: {
        type: "array",
        items: { type: "string" },
        description: "Things you cannot tell from the photographs and are unsure about.",
      },
      questions_for_volunteers: {
        type: "array",
        items: { type: "string" },
        description: "Two or three questions a local volunteer might be able to answer that the photos cannot, e.g. about local use or origin.",
      },
    },
    required: [
      "what_it_might_be",
      "description",
      "materials",
      "possible_date",
      "visible_marks",
      "unsure_about",
      "questions_for_volunteers",
    ],
  },
} as const;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
