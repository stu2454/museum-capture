/**
 * The record explorer.
 *
 * Written for someone who wants to find an object, not operate a database.
 * One search box, results as cards with photographs, tap for the full record.
 * No filters, facets, query syntax or column pickers — those are for people who
 * already know what they're looking for.
 *
 * Built to stay usable as the collection grows past a screenful:
 *
 * - The tools sit above the list. They used to sit below it, where every object
 *   catalogued pushed them further out of reach.
 * - Records arrive fifty at a time, with a button for more and a count that says
 *   how many are showing. The server has always sent at most fifty, and the list
 *   used to stop there silently while claiming to show the whole collection.
 * - The address follows the screen. Opening a record adds a history entry, so the
 *   browser's own Back button returns to the list instead of leaving the app, and
 *   a record can be linked to. The search is kept in the address too.
 * - Coming back to the list puts you where you were: the same records loaded, at
 *   the same scroll position. Losing your place among three hundred objects is how
 *   people give up on a list.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, NotAuthorised, photoUrl, type Me, type RecordSummary } from "./api";
import { RecordView } from "./RecordView";
import { UserAdmin } from "./UserAdmin";
import { EhiveExport } from "./EhiveExport";
import { goTo } from "../landing";

/** Records per request, and per press of "show more". Matches the server's default. */
const PAGE = 50;

type View =
  | { name: "list" }
  | { name: "record"; id: string }
  | { name: "users" }
  | { name: "ehive" };

/** What the address asks for, so a reload, a link and the Back button all land right. */
function viewFromAddress(): View {
  const params = new URLSearchParams(window.location.search);
  const record = params.get("record");
  if (record) return { name: "record", id: record };
  const view = params.get("view");
  if (view === "users" || view === "ehive") return { name: view };
  return { name: "list" };
}

function queryFromAddress(): string {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function addressFor(view: View, query: string): string {
  const params = new URLSearchParams();
  if (view.name === "record") params.set("record", view.id);
  else if (view.name !== "list") params.set("view", view.name);
  else if (query) params.set("q", query);
  const search = params.toString();
  return search ? `/explore?${search}` : "/explore";
}

export function Explorer() {
  const [me, setMe] = useState<Me | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [view, setView] = useState<View>(viewFromAddress);

  const [query, setQuery] = useState(queryFromAddress);
  const [results, setResults] = useState<RecordSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  // The newest request for the list. An answer to anything older is dropped:
  // typing quickly can land the results for "jug" after those for "jugs", and more
  // records for a search that has since changed don't belong under the new one.
  const latest = useRef(0);
  // Which search the records on screen answer, and how many are showing.
  const shownFor = useRef<string | null>(null);
  const shownCount = useRef(0);
  shownCount.current = results.length;
  // Where the list was scrolled to, kept while it is the screen in view.
  const listScroll = useRef(0);
  const onList = useRef(view.name === "list");
  onList.current = view.name === "list";

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((error) => {
        if (error instanceof NotAuthorised) setDenied(error.message);
        else setDenied("Couldn't reach the collection. Try again in a moment.");
      });
  }, []);

  // The app decides where the page is scrolled, not the browser. The browser would
  // restore a position before the list has come back, which is exactly when it
  // would be wrong.
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";

    const onScroll = () => {
      if (onList.current) listScroll.current = window.scrollY;
    };
    const onBackOrForward = () => {
      const next = viewFromAddress();
      setView(next);
      if (next.name === "list") setQuery(queryFromAddress());
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onBackOrForward);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onBackOrForward);
    };
  }, []);

  // A record, the user list or the eHive screen opens at its top. The list opens
  // where it was left. Before paint, so the page never visibly jumps.
  useLayoutEffect(() => {
    window.scrollTo(0, view.name === "list" ? listScroll.current : 0);
  }, [view]);

  /**
   * Fetch the list for a search. `count` is how many records to have on screen:
   * one page for a new search, or as many as were showing when someone comes back
   * to the list, so their scroll position still has something to land on.
   */
  const load = useCallback(async (q: string, count: number) => {
    const request = ++latest.current;
    setLoading(true);
    try {
      const collected: RecordSummary[] = [];
      const seen = new Set<string>();
      let found = 0;
      do {
        const page = await api.records(q, collected.length, Math.min(100, count - collected.length));
        if (request !== latest.current) return;
        found = page.total;
        if (page.records.length === 0) break;
        for (const record of page.records) {
          if (!seen.has(record.id)) collected.push(record);
          seen.add(record.id);
        }
      } while (collected.length < Math.min(count, found));

      shownFor.current = q;
      setResults(collected);
      setTotal(found);
      setUnreachable(false);
      setMoreFailed(false);
    } catch {
      if (request === latest.current) setUnreachable(true);
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, []);

  // Debounced so typing doesn't fire a query per keystroke. 300ms is long enough
  // to batch a word, short enough that results feel immediate.
  //
  // Also re-runs on returning to the list, which is not merely a refresh: this
  // screen is where you land after importing records or removing one, and it
  // previously kept showing the counts from before you did it. A collection that
  // says "3 objects" after you have just imported 35 reads as an import that
  // failed, and the natural response is to run it again.
  useEffect(() => {
    if (!me || view.name !== "list") return;
    const count = query === shownFor.current ? Math.max(PAGE, shownCount.current) : PAGE;
    const timer = setTimeout(() => void load(query, count), 300);
    return () => clearTimeout(timer);
  }, [query, me, load, view.name]);

  // Keep the search in the address, so a reload or a shared link finds the same
  // records. Replaced, not pushed: a history entry per keystroke would make the
  // Back button useless.
  useEffect(() => {
    if (view.name !== "list") return;
    const address = addressFor(view, query);
    if (address !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state, "", address);
    }
  }, [view, query]);

  function open(next: View) {
    window.history.pushState({ fromList: true }, "", addressFor(next, query));
    setView(next);
  }

  // Back from a record, the user list or the eHive screen. When the list is behind
  // it in the browser's history, step back through that history, so this button
  // and the browser's Back button do the same thing. Someone who arrived straight
  // on a record from a link has no list behind them: put one there, rather than
  // sending them out of the app.
  function backToList() {
    if ((window.history.state as { fromList?: boolean } | null)?.fromList) {
      window.history.back();
      return;
    }
    const list: View = { name: "list" };
    window.history.replaceState(null, "", addressFor(list, query));
    setView(list);
  }

  async function showMore() {
    const request = latest.current;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await api.records(shownFor.current ?? query, results.length);
      if (request !== latest.current) return;
      setResults((current) => {
        const seen = new Set(current.map((r) => r.id));
        return [...current, ...page.records.filter((r) => !seen.has(r.id))];
      });
      setTotal(page.total);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  if (denied) {
    return (
      <div className="app app-wide">
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
      <div className="app app-wide">
        <p className="muted" style={{ paddingTop: 40 }}>Signing you in…</p>
      </div>
    );
  }

  if (view.name === "record") {
    return <RecordView id={view.id} me={me} onBack={backToList} />;
  }

  if (view.name === "users") {
    return <UserAdmin me={me} onBack={backToList} />;
  }

  if (view.name === "ehive") {
    return <EhiveExport onBack={backToList} />;
  }

  const remaining = total - results.length;

  return (
    <div className="app app-wide">
      <header className="masthead masthead-bar">
        <div>
          <p className="eyebrow">Dorrigo Museum</p>
          <h1>Collection</h1>
        </div>
        <div className="signed-in">
          <span className="muted small">Signed in as {me.display_name || me.email}</span>
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
      </header>

      <nav className="toolbar" aria-label="Collection tools">
        <button type="button" className="btn btn-quiet" onClick={() => goTo("capture")}>
          Catalogue an object
        </button>
        {me.role === "admin" && (
          <>
            <button type="button" className="btn btn-quiet" onClick={() => open({ name: "users" })}>
              Manage who has access
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => open({ name: "ehive" })}>
              Send records to eHive
            </button>
          </>
        )}
      </nav>

      <input
        className="field-control"
        type="search"
        placeholder="Search — name, number, maker, anything"
        aria-label="Search the collection"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />

      <p className="eyebrow" style={{ margin: "16px 0 10px" }} aria-live="polite">
        {/* While a new search waits out the debounce, the records on screen still
            answer the old one. Say so, rather than label them with the new wording:
            "129 objects found" for a search that finds three. */}
        {loading || (query !== shownFor.current && !unreachable)
          ? "Searching…"
          : countLine(query, results.length, total)}
      </p>

      {unreachable && !loading && (
        <div className="notice notice-problem" role="alert">
          <p style={{ margin: "0 0 12px" }}>
            Couldn&apos;t reach the collection. Check the connection, then try again.
          </p>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => void load(query, Math.max(PAGE, results.length))}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !unreachable && results.length === 0 && (
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
          onClick={() => open({ name: "record", id: record.id })}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {record.primary_photo_id ? (
              <img
                src={photoUrl(record.primary_photo_id, "thumb")}
                alt=""
                loading="lazy"
                width={64}
                height={64}
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

      {remaining > 0 && results.length > 0 && (
        <div className="show-more">
          {moreFailed && (
            <p className="small" role="alert" style={{ margin: "0 0 10px" }}>
              Couldn&apos;t load more just now. Check the connection, then try again.
            </p>
          )}
          <button
            type="button"
            className="btn btn-quiet btn-wide"
            disabled={loadingMore}
            onClick={() => void showMore()}
          >
            {loadingMore
              ? "Loading…"
              : remaining > PAGE
                ? `Show the next ${PAGE}`
                : remaining === 1
                  ? "Show the last one"
                  : `Show the last ${remaining}`}
          </button>
        </div>
      )}
    </div>
  );
}

/** "Showing 50 of 212 objects in the collection", or just "212 objects…" when all are showing. */
function countLine(query: string, shown: number, total: number): string {
  const noun = total === 1 ? "object" : "objects";
  const where = query ? "found" : "in the collection";
  if (shown < total) return `Showing ${shown} of ${total} ${noun} ${where}`;
  return `${total} ${noun} ${where}`;
}
