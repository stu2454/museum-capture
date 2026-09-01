/**
 * Who the app is being used as, in the corner of the screen — and the avatar
 * itself, which the picker and the "You" panel draw too.
 *
 * The home screen says this in full, but the capture flow doesn't, and that is
 * where it matters: on a museum device several volunteers share, you can be six
 * screens into an object with no reminder of whose name the work is going under.
 * A mark in the corner answers that without going back to look.
 *
 * Deliberately not a button. Changing who is cataloguing halfway through a record
 * wouldn't move the record already in progress, so offering it here would promise
 * something it can't do — the switch lives on the home screen, before a record is
 * started. This only ever reports.
 */

import { nameOf, type Person } from "../identity";
import { swatchFor } from "../avatars";

/** "Margaret Doyle" -> MD. Falls back to the address when there's no name. */
export function initials(person: Person): string {
  const name = (person.display_name ?? "").trim();
  if (!name) return person.email.slice(0, 2).toUpperCase();

  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Enough to recognise yourself by, short enough to sit beside a heading. */
export function shortName(person: Person): string {
  const name = (person.display_name ?? "").trim();
  if (name) return name.split(/\s+/)[0];
  return person.email.split("@")[0];
}

/**
 * The coloured disc. Someone who has never chosen a colour still gets a stable
 * one derived from their address, so a shared device shows several different
 * circles rather than a row of identical grey ones.
 *
 * The colour is set inline because it comes from a fixed palette in our own code
 * — ten known values, no user text — and ten CSS classes to express ten hex
 * codes would be more moving parts for no gain.
 */
export function Avatar({ person, size = 38 }: { person: Person; size?: number }) {
  const swatch = swatchFor(person.avatar_colour, person.email);

  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        background: swatch.hex,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
      }}
    >
      {initials(person)}
    </span>
  );
}

export function WhoBadge({ person }: { person: Person | null }) {
  // Nothing to report yet. The home screen explains what to do about it; a
  // half-filled badge in the corner would only be a second, quieter puzzle.
  if (!person) return null;

  const full = nameOf(person);

  return (
    <span
      className="whoami"
      title={`${full} · ${person.email}`}
      aria-label={`Using the app as ${full}, ${person.email}`}
    >
      <Avatar person={person} />
      <span className="whoami-name" aria-hidden="true">
        {shortName(person)}
      </span>
    </span>
  );
}
