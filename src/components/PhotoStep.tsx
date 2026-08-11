/**
 * Photograph step. This comes first because it is the one thing the paper
 * worksheet could never do, and because a volunteer holding the object should
 * shoot it before they put it down.
 */

import { useEffect, useState } from "react";
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
    const added: PhotoMeta[] = [];
    for (const file of Array.from(files)) {
      const id = newId("img");
      await photos.put(id, await prepareImage(file));
      added.push({
        id,
        caption: "",
        primary: items.length === 0 && added.length === 0,
        addedAt: new Date().toISOString(),
      });
    }
    onChange([...items, ...added]);
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
        An overall view first. Then close-ups of any maker's marks, labels, signatures or damage.
        Tap a photo to make it the main one.
      </p>

      <label className="btn btn-wide" style={{ display: "block", textAlign: "center" }}>
        {busy ? "Adding…" : items.length ? "Add another photo" : "Take a photo"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            void accept(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

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
                ×
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
