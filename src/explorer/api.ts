/**
 * Explorer data access. Every call goes through Cloudflare Access, so a signed
 * -out user gets redirected to the login page by the browser before we see a
 * response — there is no login form in this app to maintain.
 */

export type Role = "admin" | "volunteer" | "viewer";

export interface Me {
  email: string;
  display_name: string | null;
  role: Role;
}

export interface RecordSummary {
  id: string;
  registration_number: string | null;
  object_name: string | null;
  status: string;
  captured_by: string | null;
  updated_at: string;
  photo_count: number;
  primary_photo_id: string | null;
}

export interface PhotoSummary {
  id: string;
  is_primary: number;
  caption: string | null;
  added_at: string;
}

export interface RecordDetail {
  record: {
    id: string;
    registration_number: string | null;
    object_name: string | null;
    status: string;
    values_json: string;
    captured_by: string | null;
    captured_at: string | null;
    updated_at: string;
    revision: number;
  };
  photos: PhotoSummary[];
  revisions: Array<{ revision: number; status: string; captured_by: string; updated_at: string }>;
  schema_yaml: string | null;
}

export interface UserRow {
  email: string;
  display_name: string | null;
  role: Role;
  status: string;
  added_by: string | null;
  added_at: string;
  last_seen_at: string | null;
}

export class NotAuthorised extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (response.status === 403) {
    const body = await response.json().catch(() => ({}));
    throw new NotAuthorised(
      (body as { message?: string }).message ??
        "You don't have access to the collection yet."
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export interface RemovedRecord {
  id: string;
  registration_number: string | null;
  object_name: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deletion_reason: string | null;
  photo_count: number;
  revision_count: number;
}

export const api = {
  me: () => call<{ user: Me }>("/me").then((r) => r.user),

  records: (query: string, offset = 0) =>
    call<{ records: RecordSummary[]; total: number }>(
      `/records?q=${encodeURIComponent(query)}&offset=${offset}`
    ),

  record: (id: string) => call<RecordDetail>(`/records/${encodeURIComponent(id)}`),

  users: () => call<{ users: UserRow[] }>("/users").then((r) => r.users),

  addUser: (email: string, display_name: string, role: Role) =>
    call<{ ok: true }>("/users", {
      method: "POST",
      body: JSON.stringify({ email, display_name, role }),
    }),

  removeRecord: (id: string, reason: string, confirm: string) =>
    call<{ ok: true }>(`/records/${encodeURIComponent(id)}/remove`, {
      method: "POST",
      body: JSON.stringify({ reason, confirm }),
    }),

  restoreRecord: (id: string) =>
    call<{ ok: true }>(`/records/${encodeURIComponent(id)}/restore`, { method: "POST" }),

  removed: () => call<{ records: RemovedRecord[] }>("/removed").then((r) => r.records),

  removeUser: (email: string) =>
    call<{ ok: true }>("/users", { method: "DELETE", body: JSON.stringify({ email }) }),
};

export const photoUrl = (id: string) => `/api/photo/${encodeURIComponent(id)}`;
