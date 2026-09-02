/**
 * Who is cataloguing, on the home screen.
 *
 * The old version of this was a text box asking for a name. It sat here because
 * a login screen between a volunteer and twenty minutes of useful work is a
 * barrier that costs more than it saves — and that reasoning still holds. What
 * changed is that the sign-in now happens anyway, at the front door, so the app
 * already knows who this is. Asking a second time would be a form for the sake
 * of a form.
 *
 * So the normal case is not a question at all: it states who it thinks you are
 * and gets out of the way. Two things sit behind that, each behind its own quiet
 * button:
 *
 *   picking   For the museum's shared devices, where the person signed in is the
 *             iPad and the person cataloguing is whoever picked it up.
 *   editing   Your own name and badge colour. Offered ONLY when the person
 *             cataloguing is the person signed in — on a shared device "your
 *             details" would mean the iPad's, which is not what anyone would
 *             expect the button to do.
 */

import { useState } from "react";
import { nameOf, rememberCataloguer, saveMe, type Identity, type Person } from "../identity";
import { SWATCHES, swatchFor } from "../avatars";
import { Avatar } from "./WhoBadge";

interface Props {
  identity: Identity;
  /** Switch which registered person the records are filed under. */
  onChange: (person: Person) => void;
  /** Your own name or colour changed. */
  onUpdate: (person: Person) => void;
}

type Mode = "view" | "picking" | "editing";

export function Cataloguer({ identity, onChange, onUpdate }: Props) {
  const [mode, setMode] = useState<Mode>("view");

  if (identity.state === "not_registered") {
    return (
      <div className="notice notice-problem">
        <h4>You&apos;re signed in, but not on the museum&apos;s list yet</h4>
        <p style={{ margin: "0 0 8px" }}>
          Ask a museum administrator to add{" "}
          <strong>{identity.account?.email ?? "your email address"}</strong>. It takes them about
          a minute, and you can start as soon as they have.
        </p>
        <p className="small" style={{ margin: 0 }}>
          Until then your work can&apos;t be filed against a person, so the app won&apos;t start a
          record it has no way to attribute.
        </p>
      </div>
    );
  }

  if (identity.state === "unknown" || !identity.cataloguer) {
    return (
      <div className="notice notice-problem">
        <h4>Sign in before you start</h4>
        <p style={{ margin: "0 0 8px" }}>
          The app needs to know whose work to file these records under. You&apos;ll only be
          asked once on this device.
        </p>
        <p className="small" style={{ margin: "0 0 10px" }}>
          Tapping <strong>Sign in</strong> opens a Cloudflare page headed{" "}
          <em>Log in to Dorrigo Museum Artefact Record</em>. That is the museum&apos;s sign-in
          service, not a different app.
        </p>
        <p className="small" style={{ margin: "0 0 10px" }}>
          On that page, <strong>skip the &ldquo;Sign in with Cloudflare&rdquo; button</strong> —
          that one is only for staff who have a Cloudflare account. Go to the{" "}
          <strong>Email</strong> box below it, type your address, and tap{" "}
          <strong>Send login code</strong>. Type in the code you&apos;re emailed and you&apos;ll
          come straight back here.
        </p>
        <p className="small" style={{ margin: "0 0 14px" }}>
          There is no password to create and none to forget. You need a connection for this one
          step — afterwards the app works offline.
        </p>
        <button
          type="button"
          className="btn btn-wide"
          onClick={() => {
            // The login belongs to Cloudflare Access, not to this app. Going to a
            // path Access covers is what summons it; the Worker sends us back here
            // once there's a session.
            window.location.href = "/api/signin";
          }}
        >
          Sign in
        </button>
      </div>
    );
  }

  const { cataloguer, account, people } = identity;
  const isYou = Boolean(account && account.email === cataloguer.email);

  function choose(person: Person) {
    rememberCataloguer(person);
    onChange(person);
    setMode("view");
  }

  if (mode === "picking") {
    return (
      <section className="card">
        <p className="eyebrow" style={{ margin: "0 0 4px" }}>Who is cataloguing?</p>
        <p className="small muted" style={{ margin: "0 0 12px" }}>
          Pick your own name. Records are filed under whoever is chosen here, so it matters on a
          device other people use too.
        </p>

        {people.map((person) => (
          <label
            key={person.email}
            className={`choice ${person.email === cataloguer.email ? "is-chosen" : ""}`}
          >
            <input
              type="radio"
              name="cataloguer"
              checked={person.email === cataloguer.email}
              onChange={() => choose(person)}
            />
            <span className="choice-person">
              <Avatar person={person} size={34} />
              <span>
                <strong>{nameOf(person)}</strong>
                <br />
                <span className="small muted">{person.email}</span>
              </span>
            </span>
          </label>
        ))}

        <button
          type="button"
          className="btn btn-quiet btn-wide"
          style={{ marginTop: 12 }}
          onClick={() => setMode("view")}
        >
          Cancel
        </button>
      </section>
    );
  }

  if (mode === "editing" && account) {
    return <EditYou person={account} onDone={onUpdate} onClose={() => setMode("view")} />;
  }

  return (
    <section className="cataloguer">
      <div className="cataloguer-head">
        <Avatar person={cataloguer} size={46} />
        <span className="cataloguer-who">
          <span className="eyebrow">Cataloguing as</span>
          <strong className="cataloguer-name">{nameOf(cataloguer)}</strong>
          <span className="record-ref">{cataloguer.email}</span>
        </span>
      </div>

      {!isYou && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          On {nameOf(account)}&apos;s sign-in. Records are filed under {nameOf(cataloguer)}.
        </p>
      )}

      {identity.fromCache && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          Working offline — this is who the app last knew you as.
        </p>
      )}

      <div className="cataloguer-actions">
        {people.length > 1 && (
          <button type="button" className="btn btn-quiet cataloguer-switch" onClick={() => setMode("picking")}>
            Someone else is cataloguing
          </button>
        )}
        {isYou && (
          <button type="button" className="btn btn-quiet cataloguer-switch" onClick={() => setMode("editing")}>
            Change your name or colour
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Your own details. Deliberately only two things — the name that goes on every
 * record you catalogue, and the colour that makes you findable on a shared
 * device. Role and access aren't here and shouldn't be: they belong to whoever
 * administers the museum's list, not to the person they apply to.
 */
function EditYou({
  person,
  onDone,
  onClose,
}: {
  person: Person;
  onDone: (person: Person) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(person.display_name ?? "");
  const [colour, setColour] = useState(swatchFor(person.avatar_colour, person.email).id);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const preview: Person = { ...person, display_name: name.trim() || person.email, avatar_colour: colour };

  async function save() {
    setBusy(true);
    setProblem(null);

    const saved = await saveMe({ display_name: name.trim(), avatar_colour: colour });

    if (!saved) {
      setBusy(false);
      setProblem(
        "Couldn't save that. This is the one thing the app can't do offline — try again " +
          "somewhere with a connection. Nothing else has been affected."
      );
      return;
    }

    onDone(saved);
    onClose();
  }

  return (
    <section className="card">
      <p className="eyebrow" style={{ margin: "0 0 12px" }}>Your details</p>

      <div className="you-preview">
        <Avatar person={preview} size={52} />
        <span>
          <strong>{name.trim() || person.email}</strong>
          <br />
          <span className="small muted">{person.email}</span>
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="your-name">
          Your name
        </label>
        <span className="field-hint">
          This goes on every record you catalogue. Write it the way you&apos;d be asked for.
        </span>
        <input
          id="your-name"
          className="field-control"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <span className="field-label">Your colour</span>
        <span className="field-hint">
          So you can tell at a glance that the app is set to you, not the last person who used
          this device.
        </span>
        <div className="swatches">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.id}
              type="button"
              className={`swatch ${colour === swatch.id ? "is-chosen" : ""}`}
              style={{ background: swatch.hex }}
              aria-label={swatch.label}
              aria-pressed={colour === swatch.id}
              onClick={() => setColour(swatch.id)}
            />
          ))}
        </div>
      </div>

      {problem && <div className="notice notice-problem">{problem}</div>}

      <div className="button-pair" style={{ marginTop: 4 }}>
        <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={() => void save()} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
