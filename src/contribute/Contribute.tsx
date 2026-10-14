/**
 * /contribute — "What do you know about this?"
 *
 * The trial of spreading the knowledge work beyond the two people who do the
 * accessioning (October 2026). Any volunteer picks an object that has been
 * photographed and says or types what they know. Admins read it all on
 * /contribute?view=review. Nothing here edits a record.
 *
 * Three screens, each in the address so Back works and a link can be sent:
 *   /contribute                 the objects, fewest answers first
 *   /contribute?object=<id>     one object and its questions
 *   /contribute?view=review     everything people have said (admins)
 *
 * On a shared museum iPad, whoever is signed in may not be the person talking.
 * The "Answering as" choice records who the screen says it is, separately from
 * the signed-in account — a claim, not proof, kept apart for that reason.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, NotAuthorised, photoUrl, type Me } from "../explorer/api";
import { contributeApi, type ObjectSummary, type Person } from "./api";
import { ObjectScreen } from "./ObjectScreen";
import { Review } from "./Review";

const PAGE = 24;

type View = { name: "list" } | { name: "object"; id: string } | { name: "review" };

function viewFromAddress(): View {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("object");
  if (id) return { name: "object", id };
  if (params.get("view") === "review") return { name: "review" };
  return { name: "list" };
}

function addressFor(view: View): string {
  if (view.name === "object") return `/contribute?object=${encodeURIComponent(view.id)}`;
  if (view.name === "review") return "/contribute?view=review";
  return "/contribute";
}

export function Contribute() {
  const [me, setMe] = useState<Me | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [view, setView] = useState<View>(viewFromAddress);

  const [people, setPeople] = useState<Person[]>([]);
  // Null = the signed-in person. Deliberately not remembered between visits: on
  // a shared iPad, yesterday's choice is the wrong default for today's volunteer.
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [choosingSpeaker, setChoosingSpeaker] = useState(false);

  const [query, setQuery] = useState("");
  const [objects, setObjects] = useState<ObjectSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listProblem, setListProblem] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((error) => {
        setDenied(
          error instanceof NotAuthorised ? error.message : "Couldn't reach the collection. Try again in a moment."
        );
      });
    contributeApi
      .people()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    const onPop = () => setView(viewFromAddress());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const open = (next: View) => {
    window.history.pushState(null, "", addressFor(next));
    setView(next);
  };

  const load = useCallback(async (q: string, offset: number) => {
    const request = ++latest.current;
    setLoading(true);
    setListProblem(false);
    try {
      const page = await contributeApi.objects(q, offset, PAGE);
      if (request !== latest.current) return;
      setObjects((previous) => (offset === 0 ? page.objects : [...previous, ...page.objects]));
      setTotal(page.total);
    } catch {
      if (request === latest.current) setListProblem(true);
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, []);

  // A new search, or coming back to the list (counts may have changed).
  useEffect(() => {
    if (view.name !== "list" || !me) return;
    const timer = window.setTimeout(() => void load(query, 0), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [query, view, me, load]);

  const nameOf = (email: string | null) => {
    if (!email) return me?.display_name || me?.email || "you";
    const person = people.find((p) => p.email === email);
    return person?.display_name || email;
  };

  if (denied) {
    return (
      <div className="app">
        <header className="masthead">
          <p className="eyebrow">Dorrigo Museum</p>
          <h1>What do you know about this?</h1>
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
        <p className="muted" style={{ paddingTop: 40 }}>
          Signing you in…
        </p>
      </div>
    );
  }

  if (choosingSpeaker) {
    return (
      <div className="app">
        <header className="masthead">
          <p className="eyebrow">Dorrigo Museum</p>
          <h1>Who is answering?</h1>
        </header>
        <p className="question-note">
          Signed in as {me.display_name || me.email}. If someone else is telling us what they know, choose them, so
          their answers carry their name.
        </p>
        <button
          type="button"
          className="record-link"
          onClick={() => {
            setSpeaker(null);
            setChoosingSpeaker(false);
          }}
        >
          <strong>{me.display_name || me.email}</strong> <span className="record-ref">(signed in)</span>
        </button>
        {people
          .filter((p) => p.email !== me.email)
          .map((p) => (
            <button
              type="button"
              key={p.email}
              className="record-link"
              onClick={() => {
                setSpeaker(p.email);
                setChoosingSpeaker(false);
              }}
            >
              <strong>{p.display_name || p.email}</strong>
            </button>
          ))}
        <p className="small muted">
          Not on the list? An administrator can add them under “Manage who has access” in the collection.
        </p>
      </div>
    );
  }

  if (view.name === "object") {
    return (
      <ObjectScreen
        key={view.id}
        recordId={view.id}
        speakingFor={speaker}
        speakerName={nameOf(speaker)}
        onChangeSpeaker={() => setChoosingSpeaker(true)}
        onBack={() => {
          if (window.history.length > 1 && viewFromAddress().name === "object") window.history.back();
          else open({ name: "list" });
        }}
      />
    );
  }

  if (view.name === "review") {
    if (me.role !== "admin") {
      return (
        <div className="app">
          <div className="notice notice-problem" style={{ marginTop: 24 }}>
            Only administrators can read everyone&apos;s answers.
          </div>
        </div>
      );
    }
    return <Review onBack={() => open({ name: "list" })} onOpenObject={(id) => open({ name: "object", id })} />;
  }

  const remaining = total - objects.length;

  return (
    <div className="app app-wide contribute">
      <header className="masthead masthead-bar">
        <div>
          <p className="eyebrow">Dorrigo Museum</p>
          <h1>What do you know about this?</h1>
        </div>
        <div className="signed-in">
          <span className="muted small">
            Answering as <strong>{nameOf(speaker)}</strong>
          </span>
          <button type="button" className="btn btn-quiet" onClick={() => setChoosingSpeaker(true)}>
            Not you?
          </button>
        </div>
      </header>

      <p className="question-note" style={{ marginTop: 8 }}>
        Pick any object below. You&apos;ll see its photographs and a few questions. Tell us whatever you know —
        typing or talking, a sentence or a story. “I think” and “I was told” are fine.
      </p>

      <nav className="toolbar" aria-label="Other places">
        <button type="button" className="btn btn-quiet" onClick={() => (window.location.href = "/explore")}>
          Back to the collection
        </button>
        {me.role === "admin" && (
          <button type="button" className="btn btn-quiet" onClick={() => open({ name: "review" })}>
            Read everyone&apos;s answers
          </button>
        )}
      </nav>

      <input
        className="field-control"
        type="search"
        placeholder="Looking for something? Type a name or number"
        aria-label="Search the objects"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />

      <p className="eyebrow" style={{ margin: "16px 0 10px" }} aria-live="polite">
        {loading && objects.length === 0
          ? "Loading…"
          : query
            ? `${total} ${total === 1 ? "object" : "objects"} found`
            : `${total} photographed ${total === 1 ? "object" : "objects"} — the ones with fewest answers come first`}
      </p>

      {listProblem && (
        <div className="notice notice-problem" role="alert">
          <p style={{ margin: "0 0 12px" }}>Couldn&apos;t reach the collection. Check the connection, then try again.</p>
          <button type="button" className="btn btn-quiet" onClick={() => void load(query, 0)}>
            Try again
          </button>
        </div>
      )}

      {!loading && !listProblem && objects.length === 0 && (
        <div className="empty">
          <p>{query ? "Nothing matched that." : "No photographed objects yet."}</p>
        </div>
      )}

      <div className="object-grid">
        {objects.map((o) => (
          <button type="button" key={o.id} className="object-tile" onClick={() => open({ name: "object", id: o.id })}>
            {o.primary_photo_id ? (
              <img src={photoUrl(o.primary_photo_id, "thumb")} alt="" loading="lazy" />
            ) : (
              <span className="photo-none" aria-hidden="true">
                no photo
              </span>
            )}
            <span className="object-tile-text">
              <strong>{o.object_name || "Untitled object"}</strong>
              <span className="record-ref">{o.registration_number || "no number"}</span>
              <span className="object-tile-count">
                {o.mine > 0
                  ? `✓ You've answered · ${answers(o.contribution_count)}`
                  : o.contribution_count === 0
                    ? "No answers yet"
                    : answers(o.contribution_count)}
              </span>
            </span>
          </button>
        ))}
      </div>

      {remaining > 0 && objects.length > 0 && (
        <button
          type="button"
          className="btn btn-quiet btn-wide show-more"
          disabled={loading}
          onClick={() => void load(query, objects.length)}
        >
          {loading ? "Loading…" : `Show more (${remaining} to go)`}
        </button>
      )}
    </div>
  );
}

function answers(n: number): string {
  return n === 1 ? "1 answer so far" : `${n} answers so far`;
}
