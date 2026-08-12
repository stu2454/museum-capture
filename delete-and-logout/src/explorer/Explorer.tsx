/**
 * The record explorer.
 *
 * Written for someone who wants to find an object, not operate a database.
 * One search box, results as cards with photographs, tap for the full record.
 * No filters, facets, query syntax or column pickers — those are for people who
 * already know what they're looking for.
 */

import { useCallback, useEffect, useState } from "react";
import { api, NotAuthorised, photoUrl, type Me, type RecordSummary } from "./api";
import { RecordView } from "./RecordView";
import { UserAdmin } from "./UserAdmin";

type View = { name: "list" } | { name: "record"; id: string } | { name: "users" };

export function Explorer() {
  const [me, setMe] = useState<Me | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: "list" });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecordSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((error) => {
        if (error instanceof NotAuthorised) setDenied(error.message);
        else setDenied("Couldn't reach the collection. Try again in a moment.");
      });
  }, []);

  const search = useCallback((q: string) => {
    setLoading(true);
    api
      .records(q)
      .then((r) => {
        setResults(r.records);
        setTotal(r.total);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  // Debounced so typing doesn't fire a query per keystroke. 300ms is long enough
  // to batch a word, short enough that results feel immediate.
  useEffect(() => {
    if (!me) return;
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, me, search]);

  if (denied) {
    return (
      <div className="app">
        <header className="masthead">
          <p className="eyebrow">Dorrigo Museum</p>
          <h1>Collection</h1>
        </header>
        <div className="notice notice-problem">
          <h4>You don&apos;t have access yet</h4>
          <p style={{ margin: 0 }}>{denied}</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="app">
        <p className="muted" style={{ paddingTop: 40 }}>Signing you in…</p>
      </div>
    );
  }

  if (view.name === "record") {
    return <RecordView id={view.id} me={me} onBack={() => setView({ name: "list" })} />;
  }

  if (view.name === "users") {
    return <UserAdmin me={me} onBack={() => setView({ name: "list" })} />;
  }

  return (
    <div className="app">
      <header className="masthead">
        <p className="eyebrow">Dorrigo Museum</p>
        <h1>Collection</h1>
      </header>

      <input
        className="field-control"
        type="search"
        placeholder="Search — name, number, maker, anything"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />

      <p className="eyebrow" style={{ margin: "16px 0 10px" }}>
        {loading
          ? "Searching…"
          : query
            ? `${total} ${total === 1 ? "object" : "objects"} found`
            : `${total} ${total === 1 ? "object" : "objects"} in the collection`}
      </p>

      {!loading && results.length === 0 && (
        <div className="empty">
          <p>
            {query
              ? "Nothing matched that. Try part of a word, or a registration number."
              : "No records yet. They'll appear here as volunteers catalogue objects."}
          </p>
        </div>
      )}

      {results.map((record) => (
        <button
          type="button"
          key={record.id}
          className="record-link"
          onClick={() => setView({ name: "record", id: record.id })}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {record.primary_photo_id ? (
              <img
                src={photoUrl(record.primary_photo_id)}
                alt=""
                loading="lazy"
                style={{
                  width: 64,
                  height: 64,
                  objectFit: "cover",
                  borderRadius: 4,
                  flex: "0 0 auto",
                  background: "var(--board)",
                }}
              />
            ) : (
              <span className="photo-none" aria-hidden="true">
                no photo
              </span>
            )}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="card-row">
                <strong>{record.object_name || "Untitled object"}</strong>
              </span>
              <span className="record-ref">
                {record.registration_number || "no number"}
                {record.captured_by ? ` · ${record.captured_by}` : ""}
              </span>
            </span>
          </div>
        </button>
      ))}

      {me.role === "admin" && (
        <button
          type="button"
          className="btn btn-quiet btn-wide"
          style={{ marginTop: 24 }}
          onClick={() => setView({ name: "users" })}
        >
          Manage who has access
        </button>
      )}

      <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
        <p className="muted small" style={{ margin: "0 0 10px" }}>
          Signed in as {me.display_name || me.email}.
        </p>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            // Cloudflare Access holds the session, so signing out is its job.
            // Clearing anything locally would leave the person still signed in.
            window.location.href = "/cdn-cgi/access/logout";
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
