/**
 * Photographs taken against a record that lives on the server.
 *
 * The capture app owns its records: it writes to IndexedDB and syncs when it can.
 * The explorer owns none of them — it reads the collection from the server. So a
 * photograph taken here has nowhere local to belong, and the obvious design is to
 * upload it straight away.
 *
 * That obvious design is wrong in this building. A volunteer photographing objects
 * on display is inside a museum with thick walls, and the whole premise of this app
 * is that a person who loses twenty minutes of work does not come back next
 * Saturday. Worse than in the capture app, in fact: a record being catalogued can
 * be resumed, but a photograph of an object already put back on its shelf cannot be
 * retaken without fetching it down again.
 *
 * So every photograph is written to IndexedDB first and uploaded afterwards, on
 * whatever schedule the network allows. The same order as everything else here.
 */

import { newId, pending, photos, type PendingPhoto } from "../db";
import { prepareImage } from "../media";
import { sendThumbnail } from "../thumbnail";

async function sha256(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null; // needs a secure context; not worth failing an upload over
  }
}

/** Take a file from the camera or the library and hold it for this record. */
export async function queuePhoto(
  recordId: string,
  file: File,
  primary: boolean
): Promise<PendingPhoto> {
  // Same pipeline as the capture app: downscaled, EXIF rotation applied, HEIC
  // re-encoded. An imported photograph and a volunteer's should be the same kind
  // of thing.
  const blob = await prepareImage(file);
  const item: PendingPhoto = {
    id: newId("img"),
    recordId,
    primary,
    addedAt: new Date().toISOString(),
    attempts: 0,
  };
  await photos.put(item.id, blob);
  await pending.put(item);
  return item;
}

export interface FlushResult {
  uploaded: number;
  waiting: number;
  offline: boolean;
}

/**
 * Try to send everything waiting.
 *
 * A failure is never destructive: the photograph stays queued and is tried again.
 * The only thing removed is a queue entry whose blob has vanished, which cannot be
 * uploaded however many times it is attempted.
 */
export async function flushPhotos(): Promise<FlushResult> {
  const queue = await pending.all();
  let uploaded = 0;
  let offline = false;

  for (const item of queue) {
    const blob = await photos.get(item.id);
    if (!blob) {
      await pending.remove(item.id);
      continue;
    }

    try {
      const digest = await sha256(blob);
      const response = await fetch(`/api/photos/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
          "X-Record-Id": item.recordId,
          "X-Primary": item.primary ? "1" : "0",
          ...(digest ? { "X-Sha256": digest } : {}),
        },
        body: blob,
      });

      // A redirect means the Access session has expired: the photograph is safe
      // where it is, and signing in again will send it.
      if (response.redirected || !response.ok) {
        offline = true;
        await pending.put({ ...item, attempts: item.attempts + 1 });
        continue;
      }

      // Before the blob goes, since the thumbnail is made from it. The server may
      // already hold these bytes under another id, and says which.
      const saved = (await response.json().catch(() => null)) as { id?: string } | null;
      await sendThumbnail(saved?.id ?? item.id, blob);

      await pending.remove(item.id);
      await photos.remove(item.id);
      uploaded += 1;
    } catch {
      offline = true;
      await pending.put({ ...item, attempts: item.attempts + 1 });
    }
  }

  return { uploaded, waiting: (await pending.all()).length, offline };
}

/** What is still waiting, for this record or for all of them. */
export async function waitingFor(recordId?: string): Promise<PendingPhoto[]> {
  const all = await pending.all();
  return recordId ? all.filter((p) => p.recordId === recordId) : all;
}
