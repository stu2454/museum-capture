/**
 * Data access for the /contribute trial. Same rules as the explorer: everything
 * goes through Cloudflare Access, so there is no login form here.
 *
 * Nothing on this side is kept in browser storage except a list of object ids
 * whose machine description this device has already shown (see aiSeen below).
 * Contributions may name living people, so their text stays out of IndexedDB and
 * localStorage. If sending fails, the words stay on screen for another try.
 */

import { NotAuthorised } from "../explorer/api";

export { NotAuthorised };

export interface ObjectSummary {
  id: string;
  registration_number: string | null;
  object_name: string | null;
  primary_photo_id: string | null;
  contribution_count: number;
  mine: number;
}

export interface MyContribution {
  id: string;
  question: string;
  question_text: string | null;
  body: string | null;
  has_audio: number;
  audio_seconds: number | null;
  ai_seen: number;
  created_at: string;
}

export interface ObjectDetail {
  object: { id: string; registration_number: string | null; object_name: string | null };
  photos: { id: string; is_primary: number }[];
  mine: MyContribution[];
  ai_available: boolean;
  can_contribute: boolean;
}

export interface MachineDescription {
  id: string;
  model: string;
  created_at: string;
  what_it_might_be?: string;
  alternatives?: string[];
  description?: string;
  materials?: string[];
  possible_date?: { range?: string; confidence?: string; reason?: string };
  visible_marks?: string[];
  condition?: string;
  unsure_about?: string[];
  questions_for_volunteers?: string[];
}

export interface ReviewItem {
  id: string;
  record_id: string;
  question: string;
  question_text: string | null;
  body: string | null;
  has_audio: number;
  audio_seconds: number | null;
  ai_seen: number;
  contributed_by: string;
  contributor_name: string | null;
  speaking_for: string | null;
  speaking_for_name: string | null;
  created_at: string;
  registration_number: string | null;
  object_name: string | null;
  /** The newest machine transcript, if one has been made (transcribe/transcribe.py). */
  transcript_text?: string | null;
  transcript_words?: string | null;
  transcript_notes?: string | null;
  transcript_engine?: string | null;
}

/** One word of a transcript: its text, when it starts, and what the script noticed. */
export interface TranscriptWord {
  w: string;
  t: number;
  /** What the engine actually heard, when the word list replaced it. */
  heard?: string;
  /** In a noticeably quieter stretch: possibly another voice. */
  quieter?: boolean;
}

export interface Person {
  email: string;
  display_name: string | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (response.status === 403) {
    throw new NotAuthorised(body.message ?? "You don't have access to the collection yet.");
  }
  if (!response.ok) throw new Error(body.message ?? `Request failed (${response.status})`);
  return body as T;
}

export const contributeApi = {
  objects: (query: string, offset = 0, limit = 24) =>
    call<{ objects: ObjectSummary[]; total: number }>(
      `/contribute/objects?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`
    ),

  object: (id: string) => call<ObjectDetail>(`/contribute/objects/${encodeURIComponent(id)}`),

  send: (id: string, form: FormData) =>
    call<{ ok: true; id: string }>(`/contribute/objects/${encodeURIComponent(id)}/contributions`, {
      method: "POST",
      body: form,
    }),

  description: (id: string) =>
    call<{ description: MachineDescription | null; can_make?: boolean }>(
      `/contribute/objects/${encodeURIComponent(id)}/ai`
    ),

  makeDescription: (id: string) =>
    call<{ description: MachineDescription }>(`/contribute/objects/${encodeURIComponent(id)}/ai`, {
      method: "POST",
    }),

  review: (offset = 0, limit = 50) =>
    call<{ contributions: ReviewItem[]; total: number; objects: number; people: number }>(
      `/contribute/review?offset=${offset}&limit=${limit}`
    ),

  people: () => call<{ people: Person[] }>("/people").then((r) => r.people),
};

export const audioUrl = (contributionId: string) =>
  `/api/contribute/audio/${encodeURIComponent(contributionId)}`;

/**
 * Objects whose machine description this device has shown. Kept so that
 * someone who comes back to an object later still has their next contribution
 * marked "after seeing the description" — which is what it is. Ids only; no
 * contribution text is ever stored on the device.
 */
const SEEN_KEY = "contribute-ai-seen";

export const aiSeen = {
  has(recordId: string): boolean {
    try {
      return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]).includes(recordId);
    } catch {
      return false;
    }
  },
  add(recordId: string): void {
    try {
      const ids = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
      ids.add(recordId);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
    } catch {
      // A device that won't remember still records the right answer this visit.
    }
  },
};
