/**
 * Everything volunteers have said, newest first. Admins only.
 *
 * This is the evidence a reviewer works from, not a record editor: reading an
 * answer here changes nothing in the catalogue. Each answer shows whether it was
 * given before or after the person saw the computer's description, because
 * "yes, it's a butter churn" means something different in each case.
 *
 * Restricted: answers may name donors and other living people. Nothing on this
 * page offers a download or an export.
 */

import { useCallback, useEffect, useState } from "react";
import { audioUrl, contributeApi, type ReviewItem } from "./api";
import { AI_CHECK, QUESTIONS } from "./questions";

const PAGE = 50;

interface Props {
  onBack: () => void;
  onOpenObject: (id: string) => void;
}

export function Review({ onBack, onOpenObject }: Props) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState({ total: 0, objects: 0, people: 0 });
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    setProblem(null);
    try {
      const page = await contributeApi.review(offset, PAGE);
      setItems((previous) => (offset === 0 ? page.contributions : [...previous, ...page.contributions]));
      setSummary({ total: page.total, objects: page.objects, people: page.people });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't load the answers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  return (
    <div className="app app-wide contribute">
      <button type="button" className="btn btn-quiet back-link" onClick={onBack}>
        ← The objects
      </button>
      <header className="masthead">
        <p className="eyebrow">Admins only · may name living people</p>
        <h1>What people have told us</h1>
      </header>

      <p className="question-note" style={{ marginTop: 8 }}>
        {summary.total === 0 && !loading
          ? "No answers yet."
          : `${summary.total} ${summary.total === 1 ? "answer" : "answers"} about ${summary.objects} ${
              summary.objects === 1 ? "object" : "objects"
            }, from ${summary.people} ${summary.people === 1 ? "person" : "people"}. Nothing here has changed the catalogue.`}
      </p>

      {problem && (
        <div className="notice notice-problem" role="alert">
          <p style={{ margin: "0 0 12px" }}>{problem}</p>
          <button type="button" className="btn btn-quiet" onClick={() => void load(0)}>
            Try again
          </button>
        </div>
      )}

      {items.map((item) => (
        <article key={item.id} className="card review-item">
          <div className="card-row">
            <button type="button" className="review-object" onClick={() => onOpenObject(item.record_id)}>
              <strong>{item.object_name || "Untitled object"}</strong>{" "}
              <span className="record-ref">{item.registration_number || "no number"}</span>
            </button>
            <span className={item.ai_seen ? "status" : "status is-confirmed"}>
              {item.ai_seen ? "After seeing the computer's guess" : "Before the computer's guess"}
            </span>
          </div>

          <p className="review-question">{item.question_text || questionWording(item.question)}</p>

          {item.body && <p className="review-body">{item.body}</p>}

          {item.has_audio ? (
            <div style={{ margin: "8px 0" }}>
              <audio controls preload="none" src={audioUrl(item.id)} className="recorder-audio" />
              {item.audio_seconds ? (
                <span className="small muted"> {Math.round(item.audio_seconds)} seconds, not yet transcribed</span>
              ) : null}
            </div>
          ) : null}

          <p className="small muted" style={{ margin: "8px 0 0" }}>
            {item.speaking_for
              ? `${item.speaking_for_name || item.speaking_for} (entered on ${
                  item.contributor_name || item.contributed_by
                }'s sign-in)`
              : item.contributor_name || item.contributed_by}
            {" · "}
            {when(item.created_at)}
          </p>
        </article>
      ))}

      {items.length < summary.total && (
        <button
          type="button"
          className="btn btn-quiet btn-wide show-more"
          disabled={loading}
          onClick={() => void load(items.length)}
        >
          {loading ? "Loading…" : "Show older answers"}
        </button>
      )}
    </div>
  );
}

function questionWording(key: string): string {
  return [...QUESTIONS, AI_CHECK].find((q) => q.key === key)?.ask ?? key;
}

/** The server stores UTC as "YYYY-MM-DD HH:MM:SS"; show it in local time. */
function when(stamp: string): string {
  const date = new Date(stamp.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return stamp;
  return date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}
