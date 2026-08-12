/**
 * Offline shell for the catalogue.
 *
 * Records live in IndexedDB, not here. This caches only the app itself, so a
 * volunteer in a store room with no signal can still open it and work.
 *
 * Two strategies, and the split between them is the whole point:
 *
 * - The page is fetched from the network first, falling back to the cache when
 *   there is no signal. Without this, a deployed fix never reaches a phone that
 *   has already opened the app once: the old page is served from cache forever,
 *   and the only cure in the field is clearing site data, which also destroys
 *   any records that have not been exported.
 *
 * - Files under /assets/ are served from the cache first. Vite puts a content
 *   hash in each filename, so a changed file always arrives under a new name
 *   and a cached one can never be stale. These are the big files; serving them
 *   from disk is what makes the app open instantly.
 *
 * Bump CACHE if this file's caching behaviour changes. Everything under the old
 * name is deleted on activate, which is how a device with a broken cache
 * recovers.
 */

const CACHE = "catalogue-shell-v2";

/**
 * Each deploy adds a new set of hashed filenames, and the previous set is never
 * requested again. Without a cap they accumulate on the device for years.
 */
const MAX_ASSETS = 40;

/** Where the shell is stored, and what a navigation falls back to offline. */
const SHELL = "./index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", SHELL])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Leave other hosts alone, and never serve this file from the cache - the
  // browser needs a straight answer from the network to spot an update.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(request));
  } else {
    // Icons and the manifest: show what we have, quietly refresh it for later.
    event.respondWith(staleWhileRevalidate(request));
  }
});

/** The page. Fresh when there is signal, cached when there isn't. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(SHELL, response.clone());
    return response;
  } catch {
    const hit = await cache.match(SHELL);
    if (hit) return hit;
    return new Response("Offline, and this device has no saved copy yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

/** Content-hashed files. Safe to keep forever; a change arrives as a new name. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimAssets(cache);
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (hit) return hit;
  const response = await fresh;
  if (response) return response;
  return new Response("", { status: 504 });
}

/** Cache.keys() returns entries oldest first, so the excess comes off the front. */
async function trimAssets(cache) {
  const assets = (await cache.keys()).filter((r) =>
    new URL(r.url).pathname.includes("/assets/")
  );
  for (let i = 0; i < assets.length - MAX_ASSETS; i++) {
    await cache.delete(assets[i]);
  }
}
