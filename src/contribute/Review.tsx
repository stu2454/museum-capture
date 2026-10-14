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

import { useCallback, useEffect, useRef, useState } from "react";
import { audioUrl, contributeApi, type ReviewItem, type TranscriptWord } from "./api";
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

          {item.has_audio ? <Recording item={item} /> : null}

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

/**
 * A recording, and its machine transcript when there is one.
 *
 * Every word is a button: tap it to hear that moment, because the recording is the
 * evidence and the transcript only a reading of it. Words the word list changed show
 * what was actually heard; words in a quieter stretch are marked, since that may be
 * someone else in the room. Neither is a finding until a person has listened.
 */
function Recording({ item }: { item: ReviewItem }) {
  const player = useRef<HTMLAudioElement>(null);
  const words = parse<TranscriptWord[]>(item.transcript_words) ?? [];
  const notes = parse<{
    corrections?: { t: number; heard: string; as: string }[];
    quieter?: { start: number; end: number; words: string }[];
  }>(item.transcript_notes);

  const playFrom = (seconds: number) => {
    const audio = player.current;
    if (!audio) return;
    // Word times run slightly early, so start just before; better a syllable too much.
    audio.currentTime = Math.max(0, seconds - 0.15);
    // A browser may refuse to start playback (no codec, autoplay rules); the player
    // is still at the right spot for the reviewer to press play.
    audio.play().catch(() => undefined);
  };

  return (
    <div style={{ margin: "8px 0" }}>
      <audio ref={player} controls preload="metadata" src={audioUrl(item.id)} className="recorder-audio" />
      {words.length === 0 ? (
        <span className="small muted">
          {" "}
          {item.audio_seconds ? `${Math.round(item.audio_seconds)} seconds, ` : ""}
          {item.transcript_engine ? "no speech recognised — listen to check" : "not yet transcribed"}
        </span>
      ) : (
        <div className="transcript">
          <p className="transcript-label">Machine transcript · not checked · tap a word to hear it</p>
          <p className="transcript-text">
            {words.map((word, i) => (
              <span key={i}>
                <button
                  type="button"
                  className={["transcript-word", word.quieter ? "is-quieter" : "", word.heard ? "is-corrected" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  title={word.heard ? `Heard as "${word.heard}"` : `Play from ${clock(word.t)}`}
                  onClick={() => playFrom(word.t)}
                >
                  {word.w}
                </button>
                {word.heard && <span className="transcript-heard">heard “{word.heard}”</span>}{" "}
              </span>
            ))}
          </p>
          {notes?.quieter?.map((q, i) => (
            <p key={i} className="transcript-note">
              <button type="button" className="transcript-word" onClick={() => playFrom(q.start)}>
                {clock(q.start)}
              </button>{" "}
              Quieter here (“{q.words}”) — possibly another voice. Listen before relying on it or crediting it to
              anyone.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
