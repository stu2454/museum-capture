/**
 * Photographing an object that is already catalogued.
 *
 * Until now a photograph could only be added while the record was being made, on
 * the device that made it. That left no way to improve a poor picture, and no way
 * at all to photograph the 35 objects imported from eHive, which live on the
 * server and reach no phone.
 *
 * This is in the catalogue rather than the capture app on purpose. The volunteer's
 * journey is "I am standing in front of an object whose photograph is poor" — they
 * start by finding the object, which is what the catalogue is for. Pulling those
 * records into the capture app instead would mean every phone slowly accumulating
 * the whole collection, which is the shape the sync scoping exists to prevent.
 *
 * TWO FILE INPUTS, NOT ONE. iOS Safari ignores `capture` when `multiple` is also
 * set, so a combined input silently stops opening the camera — on the devices most
 * likely to be used for this. Same rule as PhotoStep; don't merge them.
 */

import { useEffect, useRef, useState } from "react";
import { queuePhoto, flushPhotos, waitingFor } from "./photoQueue";
import { photos as photoBlobs, type PendingPhoto } from "../db";
import { yieldToBrowser } from "../media";

interface Props {
  recordId: string;
  /** True when the record has no image yet, so the first one taken becomes the main one. */
  hasNoPhotos: boolean;
  /** Something landed on the server; the record view should refetch. */
  onUploaded: () => void;
}

export function AddPhotos({ recordId, hasNoPhotos, onUploaded }: Props) {
  const [queue, setQueue] = useState<PendingPhoto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const items = await waitingFor(recordId);
    setQueue(items);
    const next: Record<string, string> = {};
    for (const item of items) {
      const blob = await photoBlobs.get(item.id);
      if (blob) next[item.id] = URL.createObjectURL(blob);
    }
    setUrls((old) => {
      for (const url of Object.values(old)) URL.revokeObjectURL(url);
      return next;
    });
  }

  // Try the queue on arrival and whenever the connection comes back. A photograph
  // taken in a dead corner of the building lands as soon as there is signal.
  useEffect(() => {
    void send();
    const onOnline = () => void send();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  async function send() {
    const result = await flushPhotos();
    setWaiting(result.waiting > 0);
    await refresh();
    if (result.uploaded > 0) onUploaded();
  }

  async function accept(files: FileList | null, primary: boolean) {
    if (!files?.length) return;
    setBusy(true);
    setProblem(null);

    for (const file of Array.from(files)) {
      try {
        await queuePhoto(recordId, file, primary && queue.length === 0);
        await refresh();
        await yieldToBrowser();
      } catch {
        setProblem(
          `Couldn't read ${file.name}. Take it again, or check there is space left on the device.`
        );
      }
    }

    setBusy(false);
    await send();
  }

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h3 style={{ marginTop: 0, fontWeight: 500 }}>Add photographs</h3>
      <p className="small" style={{ marginTop: 0 }}>
        {hasNoPhotos
          ? "This object has no photograph yet. The first one you take becomes its main image."
          : "Take a better picture of this object. The existing photographs are kept — tap one to make it the main image."}
      </p>

      <div className="button-pair">
        <button type="button" className="btn" disabled={busy} onClick={() => cameraRef.current?.click()}>
          {busy ? "Adding…" : "Take a photo"}
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={busy}
          onClick={() => libraryRef.current?.click()}
        >
          Choose from library
        </button>
      </div>

      {/* Camera: `capture` present, `multiple` absent. Both matter on iOS. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void accept(e.target.files, hasNoPhotos);
          e.target.value = "";
        }}
      />
      {/* Library: `multiple` present, `capture` absent. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void accept(e.target.files, hasNoPhotos);
          e.target.value = "";
        }}
      />

      {problem && (
        <div className="notice notice-problem" role="alert">
          {problem}
        </div>
      )}

      {queue.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: "16px 0 8px" }}>
            {waiting ? "Waiting to be sent" : "Sending…"}
          </p>
          <div className="photo-grid">
            {queue.map((item) => (
              <div key={item.id} className="photo">
                {urls[item.id] && <img src={urls[item.id]} alt="Photograph waiting to be sent" />}
                <span className="photo-pending-flag">waiting</span>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            These are saved on this device and will be sent when there is a connection. You can
            close the app; nothing is lost.
          </p>
        </>
      )}
    </section>
  );
}
