/**
 * Photograph step.
 *
 * Two separate inputs, not one. iOS Safari ignores the `capture` attribute when
 * `multiple` is also set, so a single combined input silently degrades to the
 * photo library on iPhone and iPad - exactly the wrong default for someone
 * standing in front of the object. One input for the camera (capture, no
 * multiple), one for the library (multiple, no capture).
 */

import { useEffect, useRef, useState } from "react";
import { newId, photos } from "../db";
import { prepareImage } from "../media";
import type { PhotoMeta } from "../types";

interface Props {
  items: PhotoMeta[];
  onChange: (next: PhotoMeta[]) => void;
}

export function PhotoStep({ items, onChange }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];

    Promise.all(
      items.map(async (item) => {
        const blob = await photos.get(item.id);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        made.push(url);
        return [item.id, url] as const;
      })
    ).then((pairs) => {
      if (cancelled) return;
      setUrls(Object.fromEntries(pairs.filter(Boolean) as (readonly [string, string])[]));
    });

    return () => {
      cancelled = true;
      made.forEach(URL.revokeObjectURL);
    };
  }, [items]);

  async function accept(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setProblem(null);
    const added: PhotoMeta[] = [];

    for (const file of Array.from(files)) {
      try {
        const id = newId("img");
        await photos.put(id, await prepareImage(file));
        added.push({
          id,
          caption: "",
          primary: items.length === 0 && added.length === 0,
          addedAt: new Date().toISOString(),
        });
      } catch {
        setProblem(
          `Couldn't read ${file.name}. Take the photo again, or check there is space left on the device.`
        );
      }
    }

    if (added.length) onChange([...items, ...added]);
    setBusy(false);
  }

  async function remove(id: string) {
    await photos.remove(id);
    const kept = items.filter((p) => p.id !== id);
    if (kept.length && !kept.some((p) => p.primary)) kept[0].primary = true;
    onChange(kept);
  }

  return (
    <div>
      <h2 className="question">Photograph the object</h2>
      <p className="question-note">
        An overall view first. Then close-ups of any maker&apos;s marks, labels, signatures or
        damage. Tap a photo to make it the main one.
      </p>

      <div className="button-pair">
        <button type="button" className="btn" disabled={busy} onClick={() => cameraRef.current?.click()}>
          {busy ? "Adding..." : "Take a photo"}
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
          void accept(e.target.files);
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
          void accept(e.target.files);
          e.target.value = "";
        }}
      />

      {problem && (
        <div className="notice notice-problem" role="alert">
          {problem}
        </div>
      )}

      {items.length > 0 && (
        <div className="photo-grid">
          {items.map((item) => (
            <div key={item.id} className="photo">
              {urls[item.id] && (
                <img
                  src={urls[item.id]}
                  alt={item.caption || "Artefact photograph"}
                  onClick={() => onChange(items.map((p) => ({ ...p, primary: p.id === item.id })))}
                />
              )}
              {item.primary && <span className="photo-primary-flag">Main</span>}
              <button
                type="button"
                className="photo-remove"
                aria-label="Remove photo"
                onClick={() => void remove(item.id)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <p className="muted small" style={{ marginTop: 14 }}>
          You can carry on without a photo and add one later, but a record with no image is much
          harder for anyone else to check.
        </p>
      )}
    </div>
  );
}
