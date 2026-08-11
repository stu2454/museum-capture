/**
 * Storage durability.
 *
 * The risk this exists to manage: iOS Safari applies a seven-day cap to all
 * script-writeable storage. If someone uses the app in a Safari tab and then
 * doesn't return to the site for seven days of Safari use, IndexedDB can be
 * cleared — taking every unexported record and photograph with it. A volunteer
 * who catalogues on a Saturday and comes back a fortnight later is squarely in
 * range.
 *
 * Two mitigations, in order of how much they help:
 *
 * 1. Add to Home Screen. A home-screen web app is not "in Safari" and keeps its
 *    own use counter, so the seven-day tally doesn't apply. It also raises the
 *    storage quota substantially. This is the one that matters.
 * 2. navigator.storage.persist(). Not formally documented by Apple as beating
 *    ITP, and Safari appears to reset the grant between launches — so request it
 *    on every start, and treat it as a bonus rather than the fix.
 *
 * Neither is a backup. Exporting regularly is still the real safety net, and the
 * app should keep saying so until sync exists.
 */

export interface StorageHealth {
  /** Running from the home screen rather than a Safari tab. */
  installed: boolean;
  /** The browser has granted persistent storage. */
  persisted: boolean;
  /** iOS or iPadOS, where the seven-day cap applies. */
  atRiskOfEviction: boolean;
  usedMb: number | null;
  quotaMb: number | null;
}

function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports as Macintosh, so touch support is the distinguishing signal.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export async function checkStorage(): Promise<StorageHealth> {
  const installed = isInstalled();

  let persisted = false;
  try {
    // Ask every launch: Safari doesn't appear to carry the grant across sessions.
    if (navigator.storage?.persist) {
      persisted = (await navigator.storage.persisted?.()) ?? false;
      if (!persisted) persisted = await navigator.storage.persist();
    }
  } catch {
    persisted = false;
  }

  let usedMb: number | null = null;
  let quotaMb: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) {
      usedMb = Math.round((estimate.usage ?? 0) / 1048576);
      quotaMb = Math.round((estimate.quota ?? 0) / 1048576);
    }
  } catch {
    /* estimate is unavailable on some browsers; not worth surfacing */
  }

  return {
    installed,
    persisted,
    atRiskOfEviction: isAppleMobile() && !installed && !persisted,
    usedMb,
    quotaMb,
  };
}
