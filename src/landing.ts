/**
 * Which half of the app a fresh visit should open.
 *
 * The two halves are for two different jobs on two different devices. A phone is
 * carried around a store room by someone holding an object: it should open on the
 * capture flow, and the museum does not want volunteers browsing records on it. A
 * laptop is sat at a desk by someone looking something up: it should open on the
 * catalogue. Both live under one sign-in, and until now both landed on capture,
 * so every desktop visit began by going somewhere it wasn't wanted.
 *
 * THE GUESS IS A DEFAULT, NOT A RULE. Screen size and pointer type are decent
 * evidence and poor proof - an iPad with a keyboard looks like a desktop, a small
 * laptop window looks like a phone. So the moment anyone crosses between the two
 * halves deliberately, that choice is remembered for that device and beats the
 * guess from then on. Nobody has to keep correcting it, and nobody is stuck.
 */

const KEY = "landing";

export type Section = "capture" | "explore";

function saved(): Section | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "capture" || v === "explore" ? v : null;
  } catch {
    return null;
  }
}

/**
 * A desktop: room for a collection, and a mouse rather than a finger. Both
 * conditions, because a phone held in landscape is wide but still a phone.
 */
function looksLikeADesk(): boolean {
  try {
    return window.matchMedia("(pointer: fine) and (min-width: 900px)").matches;
  } catch {
    return false;
  }
}

/** Should a visit to "/" open the catalogue instead of the capture flow? */
export function opensOnCatalogue(): boolean {
  const choice = saved();
  if (choice) return choice === "explore"; // a deliberate choice always wins
  return looksLikeADesk();
}

/** Remember a deliberate crossing, so the guess stops applying on this device. */
export function rememberSection(section: Section): void {
  try {
    localStorage.setItem(KEY, section);
  } catch {
    // A device that won't remember still works; it just guesses each time.
  }
}

/** Cross to the other half, remembering the choice. */
export function goTo(section: Section): void {
  rememberSection(section);
  window.location.href = section === "explore" ? "/explore" : "/";
}
