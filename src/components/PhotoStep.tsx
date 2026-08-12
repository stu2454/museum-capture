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
import { prepareImage, yieldToBrowser } from "../media";
import type { PhotoMeta } from "../types";

interface Props {
  items: PhotoMeta[];
  onChange: (next: PhotoMeta[]) => void;
}

export function PhotoStep({ items, onChange }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  // Object URLs are cached by photo id and only created once. The previous
  // version rebuilt every thumbnail whenever a single photo was added, so
  // adding the tenth photo did ten times the work of adding the first.
  const urlCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const cache = urlCache.current;
    const missing = items.filter((item) => !cache.has(item.id));

    if (missing.length === 0) {
      // Release URLs for photos that have been removed.
      for (const [id, url] of cache) {
        if (!items.some((item) => item.id === id)) {
          URL.revokeObjectURL(url);
          cache.delete(id);
        }
      }
      return;
    }

    void (async () => {
      for (const item of missing) {
        const blob = await photos.get(item.id).catch(() => undefined);
        if (cancelled || !blob) continue;
        cache.set(item.id, URL.createObjectURL(blob));
        setUrls(Object.fromEntries(cache));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items]);

  // Release every URL when the step unmounts.
  useEffect(() => {
    const cache = urlCache.current;
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  async function accept(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setProblem(null);
    const added: PhotoMeta[] = [];

    const list = Array.from(files);
    setProgress({ done: 0, total: list.length });

    for (const [index, file] of list.entries()) {
      try {
        const id = newId("img");
        await photos.put(id, await prepareImage(file));
        added.push({
          id,
          caption: "",
          primary: items.length === 0 && added.length === 0,
          addedAt: new Date().toISOString(),
        });
        // Show each photo as it lands rather than making the volunteer wait for
        // the whole batch. Yielding lets the browser actually paint the update.
        onChange([...items, ...added]);
        setProgress({ done: index + 1, total: list.length });
        await yieldToBrowser();
      } catch {
        setProblem(
          `Couldn't read ${file.name}. Take the photo again, or check there is space left on the device.`
        );
      }
    }

    setProgress(null);
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
          {busy && progress
            ? progress.total > 1
              ? `Adding ${progress.done + 1} of ${progress.total}...`
              : "Adding..."
            : "Take a photo"}
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

      {busy && progress && progress.total > 1 && (
        <p className="muted small" style={{ marginTop: 10 }}>
          Adding {progress.done} of {progress.total}. Large photos take a few seconds each — you
          can leave this screen open.
        </p>
      )}

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
