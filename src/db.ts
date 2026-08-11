/**
 * Offline storage. IndexedDB rather than localStorage because photographs are
 * far too big for localStorage, and because a volunteer in a store room with no
 * signal still needs to be able to work.
 *
 * Two stores: `records` (the catalogue data) and `photos` (image blobs, keyed by
 * the ids held in record.photos).
 */

import type { ArtefactRecord } from "./types";

const DB_NAME = "artefact-catalogue";
const DB_VERSION = 1;
const RECORDS = "records";
const PHOTOS = "photos";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS)) {
        db.createObjectStore(RECORDS, { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(PHOTOS)) {
        db.createObjectStore(PHOTOS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export const records = {
  all: () =>
    tx<ArtefactRecord[]>(RECORDS, "readonly", (s) => s.getAll()).then((rows) =>
      rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    ),
  get: (id: string) => tx<ArtefactRecord | undefined>(RECORDS, "readonly", (s) => s.get(id)),
  put: (record: ArtefactRecord) =>
    tx<IDBValidKey>(RECORDS, "readwrite", (s) => s.put({ ...record, updatedAt: new Date().toISOString() })),
  remove: (id: string) => tx<undefined>(RECORDS, "readwrite", (s) => s.delete(id)),
};

export const photos = {
  put: (id: string, blob: Blob) => tx<IDBValidKey>(PHOTOS, "readwrite", (s) => s.put(blob, id)),
  get: (id: string) => tx<Blob | undefined>(PHOTOS, "readonly", (s) => s.get(id)),
  remove: (id: string) => tx<undefined>(PHOTOS, "readwrite", (s) => s.delete(id)),
};

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Rough storage headroom, so a volunteer finds out before a device fills up
 * rather than after losing a morning's photographs.
 */
export async function storageEstimate(): Promise<{ usedMb: number; quotaMb: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usedMb: usage / 1048576, quotaMb: quota / 1048576 };
}
