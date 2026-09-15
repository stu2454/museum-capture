/**
 * Sending a photograph's thumbnail, straight after the photograph itself.
 *
 * Both upload paths call this: the capture app's sync and the catalogue's photo
 * queue. The thumbnail is made from the copy already held on the device at the
 * moment of sending, so a photograph taken before thumbnails existed, and still
 * waiting for a signal, gets one too.
 *
 * NOTHING HERE MAY FAIL AN UPLOAD. The photograph is what matters. A thumbnail only
 * makes the collection quicker to load, and the server shows the original wherever
 * one is missing. So every error is swallowed, and a photograph that missed out can
 * be given a thumbnail later with scripts/make-thumbnails.mjs.
 */

import { makeThumbnail } from "./media";

export async function sendThumbnail(photoId: string, photo: Blob): Promise<void> {
  try {
    const thumbnail = await makeThumbnail(photo);
    if (!thumbnail) return;
    await fetch(`/api/photos/${encodeURIComponent(photoId)}/thumb`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: thumbnail,
    });
  } catch {
    // Never a reason for an upload to fail. See above.
  }
}
