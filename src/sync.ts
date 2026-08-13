/**
 * Client sync.
 *
 * The rule this is built around: IndexedDB stays the working copy, and the app
 * must keep working with no signal at all. Sync is a background convenience, never
 * a precondition for cataloguing. If the network is down, nothing here should
 * surface as an error a volunteer has to act on — they're holding an object, not
 * debugging a connection.
 *
 * Adapt the two imports below to wherever your refactor put them.
 */

import { records, photos } from "./db";
import { withoutRestricted } from "./schema";
import type { ArtefactRecord } from "./types";

const DEVICE_KEY = "deviceId";
const SINCE_KEY = "lastSyncedAt";
const TROUBLE_KEY = "syncFailingSince";
const LAST_OK_KEY = "syncLastOk";
const BATCH = 20; // matches the server cap, which is set by D1's free-plan query limit

export interface SyncOutcome {
  pushed: number;
  pulled: number;
  /** Records removed on the server and taken off this device. */
  removed: number;
  superseded: string[];
  photosUploaded: number;
  offline: boolean;
  error?: string;
  /** Set when sync has been failing continuously. Drives the warning banner. */
  failingSince?: string;
}

/** How long a fault must persist before the volunteer is told. */
export const TROUBLE_THRESHOLD_HOURS = 6;

export function lastSuccessfulSync(): string | null {
  return localStorage.getItem(LAST_OK_KEY);
}

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function sha256(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null; // crypto.subtle needs a secure context; not worth failing a sync over
  }
}

export async function syncNow(): Promise<SyncOutcome> {
  const outcome: SyncOutcome = {
    pushed: 0,
    pulled: 0,
    removed: 0,
    superseded: [],
    photosUploaded: 0,
    offline: false,
  };

  if (!navigator.onLine) {
    outcome.offline = true;
    return outcome;
  }

  const since = localStorage.getItem(SINCE_KEY) ?? undefined;
  const all = await records.all();
  const pending = all.filter((r) => !r.syncedAt || r.updatedAt > r.syncedAt);

  try {
    // Page through, because the server caps a batch at 20 records.
    for (let i = 0; i < Math.max(pending.length, 1); i += BATCH) {
      const slice = pending.slice(i, i + BATCH);

      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId(),
          since,
          records: slice.map(toWire),
        }),
      });

      if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
      const result = await response.json();

      for (const id of result.applied as string[]) {
        const record = await records.get(id);
        if (record) await records.put({ ...record, syncedAt: result.server_time });
      }
      outcome.pushed += (result.applied as string[]).length;
      outcome.superseded.push(...(result.superseded as string[]));

      // What comes back is only what this device captured — the server scopes the
      // pull by device id. Two cases to handle.
      for (const incoming of result.records as WireRecord[]) {
        const local = await records.get(incoming.id);

        // 1. Removed on the server. Take it off the device, and take its photo
        //    blobs with it — otherwise the images sit in IndexedDB forever with
        //    nothing pointing at them. Without this the record lingers in the
        //    capture app and can be pushed back to life by an edit.
        if (incoming.deleted_at) {
          if (local) {
            for (const photo of local.photos) await photos.remove(photo.id).catch(() => undefined);
            await records.remove(local.id);
            outcome.removed += 1;
          }
          continue;
        }

        // 2. Changed elsewhere. Anything edited more recently on this device is
        //    left alone — the local copy is what the volunteer is looking at.
        if (!local || incoming.updated_at > local.updatedAt) {
          await records.put(fromWire(incoming, result.server_time, local));
          outcome.pulled += 1;
        }
      }

      localStorage.setItem(SINCE_KEY, result.server_time);
      if (slice.length === 0) break;
    }

    outcome.photosUploaded = await uploadPhotos(all);
  } catch (error) {
    // A single failure is not worth showing anyone — no signal in a store room is
    // normal and the records are safe locally. But a fault that persists for
    // hours must not stay invisible: that is exactly how an empty database goes
    // unnoticed. Record when trouble started so the UI can escalate.
    outcome.error = error instanceof Error ? error.message : "Sync failed";
    if (!localStorage.getItem(TROUBLE_KEY)) {
      localStorage.setItem(TROUBLE_KEY, new Date().toISOString());
    }
    outcome.failingSince = localStorage.getItem(TROUBLE_KEY) ?? undefined;
    return outcome;
  }

  localStorage.removeItem(TROUBLE_KEY);
  localStorage.setItem(LAST_OK_KEY, new Date().toISOString());

  return outcome;
}

async function uploadPhotos(all: ArtefactRecord[]): Promise<number> {
  let uploaded = 0;
  for (const record of all) {
    for (const photo of record.photos) {
      if (photo.uploadedAt) continue;
      const blob = await photos.get(photo.id);
      if (!blob) continue;

      const response = await fetch(`/api/photos/${photo.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
          "X-Record-Id": record.id,
          "X-Primary": photo.primary ? "1" : "0",
          ...((await sha256(blob)) ? { "X-Sha256": (await sha256(blob)) as string } : {}),
        },
        body: blob,
      });

      if (response.ok) {
        photo.uploadedAt = new Date().toISOString();
        await records.put(record);
        uploaded += 1;
      }
    }
  }
  return uploaded;
}

interface WireRecord {
  id: string;
  deleted_at?: string | null;
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

function toWire(record: ArtefactRecord): WireRecord {
  return {
    id: record.id,
    registration_number: record.registrationNumber,
    object_name: (record.values.object_name?.value as string) ?? null,
    status: record.status,
    schema_version: record.schemaVersion,
    // Restricted fields never leave the device. Nothing captures them today, so
    // this filters an empty set — which is exactly the point. The database is
    // documented as holding no donor details; this is what makes that true in
    // code rather than true by luck.
    values_json: JSON.stringify(withoutRestricted(record.values)),
    captured_by: record.capturedBy,
    captured_at: record.capturedAt,
    updated_at: record.updatedAt,
    revision: record.revision ?? 1,
  };
}

function fromWire(wire: WireRecord, syncedAt: string, local?: ArtefactRecord): ArtefactRecord {
  return {
    id: wire.id,
    schemaVersion: wire.schema_version,
    registrationNumber: wire.registration_number,
    status: wire.status as ArtefactRecord["status"],
    values: JSON.parse(wire.values_json),
    // Photographs are not part of the sync payload yet, so the server has
    // nothing to say about them. Keep whatever this device already holds: an
    // empty list here would leave the blobs sitting in IndexedDB with nothing
    // pointing at them, which to a volunteer reads as their photographs having
    // vanished. A record arriving for the first time correctly has none.
    photos: local?.photos ?? [],
    capturedBy: wire.captured_by ?? "",
    capturedAt: wire.captured_at ?? "",
    updatedAt: wire.updated_at,
    syncedAt,
    revision: wire.revision,
  };
}

/**
 * Sync when the app opens and whenever the connection returns. Not on every
 * keystroke: batching is cheaper on D1's write allowance and kinder to a phone
 * hunting for signal in a tin-roofed store room.
 */
export function startAutoSync(onResult?: (outcome: SyncOutcome) => void) {
  const run = () => void syncNow().then((outcome) => onResult?.(outcome));
  run();
  window.addEventListener("online", run);
  const timer = setInterval(run, 5 * 60 * 1000);
  return () => {
    window.removeEventListener("online", run);
    clearInterval(timer);
  };
}
