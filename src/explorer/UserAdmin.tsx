/**
 * Who can see the collection.
 *
 * Adding someone here does two things in the volunteer's eyes and one thing in
 * reality: it puts their email on the list this app checks. They still sign in
 * through Cloudflare, which sends them a code by email — there is no password to
 * issue, reset, or forget.
 */

import { useEffect, useState } from "react";
import { api, type Me, type Role, type UserRow } from "./api";

const ROLE_HELP: Record<Role, string> = {
  viewer: "Can search and read records.",
  volunteer: "Can also see who catalogued each object.",
  admin: "Can also add and remove people.",
};

export function UserAdmin({ me, onBack }: { me: Me; onBack: () => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("volunteer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = () => api.users().then(setUsers).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setBusy(true);
    setProblem(null);
    setMessage(null);
    try {
      await api.addUser(email.trim(), name.trim(), role);
      setMessage(
        `${email.trim()} can now sign in. They'll be sent a code by email the first time — ` +
          `there's no password to give them.`
      );
      setEmail("");
      setName("");
      await load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't add that person.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: UserRow) {
    if (!window.confirm(`Remove access for ${target.display_name || target.email}?`)) return;
    try {
      await api.removeUser(target.email);
      await load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't remove that person.");
    }
  }

  const active = users.filter((u) => u.status === "active");

  return (
    <div className="app">
      <button type="button" className="btn btn-quiet" onClick={onBack} style={{ marginTop: 12 }}>
        Back to the collection
      </button>

      <header className="masthead">
        <p className="eyebrow">Administration</p>
        <h1>Who has access</h1>
      </header>

      <div className="notice notice-open">
        <h4>There are no passwords</h4>
        <p style={{ margin: 0 }}>
          Add someone&apos;s email below and they can sign in straight away. Cloudflare emails them
          a short code each time — nothing to remember, nothing to reset.
        </p>
      </div>

      <section className="card">
        <h3 style={{ marginTop: 0, fontWeight: 500 }}>Add someone</h3>

        <div className="field">
          <label className="field-label" htmlFor="new-email">
            Their email address
          </label>
          <input
            id="new-email"
            className="field-control"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="new-name">
            Their name
          </label>
          <input
            id="new-name"
            className="field-control"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <span className="field-label">What they can do</span>
          {(["viewer", "volunteer", "admin"] as Role[]).map((option) => (
            <label key={option} className={`choice ${role === option ? "is-chosen" : ""}`}>
              <input
                type="radio"
                name="role"
                checked={role === option}
                onChange={() => setRole(option)}
              />
              <span>
                <strong style={{ textTransform: "capitalize" }}>{option}</strong>
                <br />
                <span className="small muted">{ROLE_HELP[option]}</span>
              </span>
            </label>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-wide"
          disabled={busy || !email.includes("@")}
          onClick={() => void add()}
        >
          {busy ? "Adding…" : "Add this person"}
        </button>
      </section>

      {message && <div className="notice notice-ok">{message}</div>}
      {problem && <div className="notice notice-problem">{problem}</div>}

      <p className="eyebrow" style={{ margin: "24px 0 10px" }}>
        {active.length} {active.length === 1 ? "person" : "people"} with access
      </p>

      {active.map((user) => (
        <div key={user.email} className="card">
          <div className="card-row">
            <strong>{user.display_name || user.email}</strong>
            <span className="status">{user.role}</span>
          </div>
          <p className="record-ref" style={{ margin: "4px 0 0" }}>
            {user.email}
            {user.last_seen_at
              ? ` · last here ${new Date(user.last_seen_at).toLocaleDateString("en-AU")}`
              : " · not signed in yet"}
          </p>
          {user.email !== me.email && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginTop: 12 }}
              onClick={() => void remove(user)}
            >
              Remove access
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
