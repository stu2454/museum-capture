/**
 * Who is cataloguing.
 *
 * This replaced a text box that asked for a name. The box was honest about what
 * it was — a label — but a label is not an identity: two volunteers called
 * Margaret were indistinguishable, a typo was permanent, and there was no way to
 * get from a record back to a person the museum could actually ask about it.
 *
 * There are two identities here and they are not the same thing:
 *
 *   account     Who is signed in, according to Cloudflare Access. Verified, and
 *               the device cannot make it say anything else.
 *   cataloguer  Who is doing the work. Usually the same person. On a shared
 *               museum device it is whoever picked their name from the list.
 *
 * Records carry the cataloguer. The server separately stamps the account, so the
 * two can be compared later and a shared device doesn't quietly file everyone's
 * work under one name.
 *
 * OFFLINE IS THE NORMAL CASE, not the exception. The store room has no signal,
 * so everything here answers from a cached copy when the network doesn't reply.
 * A volunteer who has used the app before must never be stopped from working by
 * a lookup that can't complete.
 */

const ACCOUNT_KEY = "identity.account";
const PEOPLE_KEY = "identity.people";
const CATALOGUER_KEY = "identity.cataloguer";

export interface Person {
  email: string;
  display_name: string | null;
  /** Palette name from src/avatars.ts. Unset until the person picks one. */
  avatar_colour?: string | null;
}

export type IdentityState =
  /** Signed in, on the museum's list, ready to catalogue. */
  | "ready"
  /** Cloudflare knows them; the museum's user list doesn't. An admin must add them. */
  | "not_registered"
  /** No answer and nothing cached — first run on this device, with no connection. */
  | "unknown";

export interface Identity {
  state: IdentityState;
  /** Verified sign-in, or the last one this device saw. */
  account: Person | null;
  /** Everyone an admin has registered. The picker's contents. */
  people: Person[];
  /** Who the records being made right now belong to. */
  cataloguer: Person | null;
  /** True when the network didn't answer and this came from the last known copy. */
  fromCache: boolean;
}

/** A person's name if we have one, otherwise their address. Never blank. */
export function nameOf(person: Person | null | undefined): string {
  if (!person) return "";
  const name = (person.display_name ?? "").trim();
  return name || person.email;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or locked store must not stop someone cataloguing.
  }
}

/**
 * One API call, with the two failures that matter told apart.
 *
 * `signed_out` covers the case that looks like success and isn't: when the Access
 * session has expired, the request is redirected to a login page which answers
 * 200 with HTML. Treating that as data would put the words "Sign in with
 * Cloudflare" where a volunteer's name should be.
 */
type Answer<T> = { ok: true; data: T } | { ok: false; why: "offline" | "not_registered" | "signed_out" };

async function ask<T>(path: string): Promise<Answer<T>> {
  try {
    const response = await fetch(`/api${path}`, { headers: { Accept: "application/json" } });

    if (response.redirected) return { ok: false, why: "signed_out" };
    if (response.status === 403) return { ok: false, why: "not_registered" };
    if (!response.ok) return { ok: false, why: "offline" };

    const type = response.headers.get("Content-Type") ?? "";
    if (!type.includes("json")) return { ok: false, why: "signed_out" };

    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, why: "offline" };
  }
}

/**
 * Establish who is cataloguing, preferring a fresh answer and falling back to
 * the last one this device was given.
 */
export async function loadIdentity(): Promise<Identity> {
  const cachedAccount = read<Person>(ACCOUNT_KEY);
  const cachedPeople = read<Person[]>(PEOPLE_KEY) ?? [];
  const cachedChoice = read<Person>(CATALOGUER_KEY);

  const [me, roster] = await Promise.all([
    ask<{ user: Person }>("/me"),
    ask<{ people: Person[] }>("/people"),
  ]);

  if (!me.ok) {
    // Being told "no" is different from not being told anything. A refusal is
    // reported as it stands; silence falls back to what we already knew.
    if (me.why === "not_registered") {
      return { state: "not_registered", account: cachedAccount, people: [], cataloguer: null, fromCache: false };
    }
    if (cachedAccount) {
      return {
        state: "ready",
        account: cachedAccount,
        people: cachedPeople,
        cataloguer: cachedChoice ?? cachedAccount,
        fromCache: true,
      };
    }
    return { state: "unknown", account: null, people: [], cataloguer: null, fromCache: false };
  }

  const account: Person = {
    email: me.data.user.email,
    display_name: me.data.user.display_name,
    avatar_colour: me.data.user.avatar_colour ?? null,
  };
  write(ACCOUNT_KEY, account);

  const people = roster.ok && roster.data.people.length ? roster.data.people : cachedPeople;
  if (roster.ok && roster.data.people.length) write(PEOPLE_KEY, people);

  // A choice only survives while that person is still registered. Someone whose
  // access was removed should stop being an option, not linger on one device.
  const stillRegistered =
    cachedChoice && people.some((p) => p.email === cachedChoice.email) ? cachedChoice : null;

  return {
    state: "ready",
    account,
    people: people.length ? people : [account],
    cataloguer: stillRegistered ?? account,
    fromCache: false,
  };
}

/** Remember who is cataloguing on this device until someone says otherwise. */
export function rememberCataloguer(person: Person): void {
  write(CATALOGUER_KEY, person);
}

/**
 * Change your own name or badge colour.
 *
 * Needs a connection — this is a change to the museum's record of who you are,
 * not a device preference, so there is nothing sensible to do offline except say
 * so. Everything else in this module answers from cache; this one doesn't, on
 * purpose. Returns null when it couldn't be saved, and the caller says so.
 */
export async function saveMe(changes: {
  display_name?: string;
  avatar_colour?: string;
}): Promise<Person | null> {
  try {
    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(changes),
    });

    if (response.redirected || !response.ok) return null;

    const { user } = (await response.json()) as { user: Person };
    const person: Person = {
      email: user.email,
      display_name: user.display_name,
      avatar_colour: user.avatar_colour ?? null,
    };

    // Keep the cached copies honest, or the badge reverts on the next offline open.
    write(ACCOUNT_KEY, person);
    const chosen = read<Person>(CATALOGUER_KEY);
    if (chosen && chosen.email === person.email) write(CATALOGUER_KEY, person);

    return person;
  } catch {
    return null;
  }
}
