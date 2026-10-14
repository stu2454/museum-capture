/**
 * One object: its photographs, three questions, and — once the person has had
 * their say — what the computer makes of the photographs.
 *
 * THE ORDER IS THE POINT. People are asked what they know before they are shown
 * the machine's guess, because a guess read first gets agreed with, and
 * agreement looks exactly like knowledge in the record unless something says
 * otherwise. Every answer carries ai_seen so a reviewer can tell. The button to
 * reveal it is still there from the start: someone who knows nothing about the
 * object shouldn't be made to type "don't know" three times to get to it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { photoUrl } from "../explorer/api";
import { aiSeen as seenStore, contributeApi, type MachineDescription, type ObjectDetail } from "./api";
import { AnswerBox } from "./AnswerBox";
import { AI_CHECK, QUESTIONS } from "./questions";

interface Props {
  recordId: string;
  speakingFor: string | null;
  speakerName: string;
  onChangeSpeaker: () => void;
  onBack: () => void;
}

export function ObjectScreen({ recordId, speakingFor, speakerName, onChangeSpeaker, onBack }: Props) {
  const [detail, setDetail] = useState<ObjectDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  const [revealed, setRevealed] = useState(() => seenStore.has(recordId));
  const [description, setDescription] = useState<MachineDescription | null>(null);
  const [describing, setDescribing] = useState(false);
  const [describeProblem, setDescribeProblem] = useState<string | null>(null);

  // Which boxes hold words not yet saved. Leaving with any of them filled asks first.
  const dirty = useRef(new Set<string>());
  const onDirty = useCallback((key: string, isDirty: boolean) => {
    if (isDirty) dirty.current.add(key);
    else dirty.current.delete(key);
  }, []);

  const load = useCallback(() => {
    contributeApi
      .object(recordId)
      .then(setDetail)
      .catch((error: Error) => setProblem(error.message || "Couldn't open this object."));
  }, [recordId]);

  useEffect(load, [load]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // Seen on an earlier visit: show it again straight away, without another call.
  useEffect(() => {
    if (revealed && !description && !describing) void reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  async function reveal() {
    setDescribing(true);
    setDescribeProblem(null);
    seenStore.add(recordId);
    setRevealed(true);
    try {
      const existing = await contributeApi.description(recordId);
      const result = existing.description ?? (await contributeApi.makeDescription(recordId)).description;
      setDescription(result);
    } catch (error) {
      setDescribeProblem(
        error instanceof Error && error.message ? error.message : "The computer's description isn't available just now."
      );
    } finally {
      setDescribing(false);
    }
  }

  function leave() {
    if (dirty.current.size > 0 && !window.confirm("You have an answer that isn't saved yet. Leave anyway?")) return;
    onBack();
  }

  if (problem) {
    return (
      <div className="app">
        <div className="notice notice-problem" role="alert" style={{ marginTop: 24 }}>
          <p style={{ margin: "0 0 12px" }}>{problem}</p>
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            Back to the objects
          </button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="app">
        <p className="muted" style={{ paddingTop: 40 }}>
          Opening…
        </p>
      </div>
    );
  }

  const { object, photos, mine } = detail;
  const photo = photos[Math.min(photoIndex, photos.length - 1)];
  const countFor = (key: string) => mine.filter((m) => m.question === key).length;

  return (
    <div className="app contribute">
      <button type="button" className="btn btn-quiet back-link" onClick={leave}>
        ← All the objects
      </button>

      <header className="masthead">
        <p className="eyebrow">{object.registration_number || "No number yet"}</p>
        <h1>{object.object_name || "An object without a name yet"}</h1>
      </header>

      {photo && (
        <figure className="contribute-photo">
          <a href={photoUrl(photo.id)} target="_blank" rel="noreferrer" title="Open the full-size photograph">
            <img src={photoUrl(photo.id)} alt={`Photograph ${photoIndex + 1} of ${photos.length}`} />
          </a>
          {photos.length > 1 && (
            <figcaption className="small muted">
              Photograph {photoIndex + 1} of {photos.length}. Tap a small one to see it here; tap the big one to
              open it full size.
            </figcaption>
          )}
        </figure>
      )}

      {photos.length > 1 && (
        <div className="contribute-thumbs" role="list">
          {photos.map((p, i) => (
            <button
              type="button"
              role="listitem"
              key={p.id}
              className={i === photoIndex ? "is-current" : undefined}
              aria-label={`Show photograph ${i + 1}`}
              aria-pressed={i === photoIndex}
              onClick={() => setPhotoIndex(i)}
            >
              <img src={photoUrl(p.id, "thumb")} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="speaker-line">
        <span>
          Answering as <strong>{speakerName}</strong>
        </span>
        <button type="button" className="btn btn-quiet" onClick={onChangeSpeaker}>
          Not you?
        </button>
      </div>

      <div className="notice notice-open">
        <h4>Who sees what you tell us</h4>
        Only the museum&apos;s administrators. Names of people, families and places are welcome — that&apos;s often
        the most valuable part. Nothing you say changes the catalogue until someone has checked it.
      </div>

      {!detail.can_contribute ? (
        <div className="notice">Your account can look at objects but not add to them. Ask a museum administrator.</div>
      ) : (
        QUESTIONS.map((question) => (
          <AnswerBox
            key={question.key}
            recordId={recordId}
            question={question}
            aiSeen={revealed}
            speakingFor={speakingFor}
            savedCount={countFor(question.key)}
            onSaved={load}
            onDirty={onDirty}
          />
        ))
      )}

      {detail.ai_available && (
        <section className="card machine" aria-labelledby="machine-heading">
          <p className="eyebrow">A computer&apos;s guess</p>
          <h2 className="question" id="machine-heading">
            What the computer sees in the photographs
          </h2>

          {!revealed && (
            <>
              <p className="question-note">
                Have your say above first, if you can — then see what the computer makes of it. It only has the
                photographs to go on, and it is often wrong about local things.
              </p>
              <button type="button" className="btn btn-quiet btn-wide" onClick={() => void reveal()}>
                Show me what the computer sees
              </button>
            </>
          )}

          {revealed && describing && (
            <p className="muted" role="status">
              Looking at the photographs… this can take half a minute.
            </p>
          )}

          {revealed && describeProblem && (
            <div className="notice notice-problem" role="alert">
              <p style={{ margin: "0 0 12px" }}>{describeProblem}</p>
              <button type="button" className="btn btn-quiet" onClick={() => void reveal()}>
                Try again
              </button>
            </div>
          )}

          {revealed && description && <Description d={description} />}
        </section>
      )}

      {revealed && description && detail.can_contribute && (
        <AnswerBox
          recordId={recordId}
          question={AI_CHECK}
          aiSeen={true}
          speakingFor={speakingFor}
          savedCount={countFor(AI_CHECK.key)}
          onSaved={load}
          onDirty={onDirty}
        />
      )}

      <button type="button" className="btn btn-wide" style={{ marginTop: 10 }} onClick={leave}>
        I&apos;ve finished with this one
      </button>
    </div>
  );
}

function Description({ d }: { d: MachineDescription }) {
  const list = (items?: string[]) =>
    items && items.length ? (
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className="muted" style={{ margin: 0 }}>
        Nothing noted.
      </p>
    );

  return (
    <div className="machine-body">
      <p className="machine-lead">{d.what_it_might_be ?? "No suggestion."}</p>
      {d.description && <p>{d.description}</p>}

      {d.alternatives && d.alternatives.length > 0 && (
        <>
          <h3>It could also be</h3>
          {list(d.alternatives)}
        </>
      )}

      <h3>Possible materials</h3>
      {list(d.materials)}

      {d.possible_date && (
        <>
          <h3>Possible date</h3>
          <p style={{ margin: 0 }}>
            {d.possible_date.range ?? "Unknown"}
            {d.possible_date.confidence && (
              <span className="muted"> — {confidenceWords(d.possible_date.confidence)}</span>
            )}
          </p>
          {d.possible_date.reason && <p className="small muted">{d.possible_date.reason}</p>}
        </>
      )}

      <h3>Writing or marks it can read</h3>
      {list(d.visible_marks)}

      {d.condition && (
        <>
          <h3>Condition</h3>
          <p>{d.condition}</p>
        </>
      )}

      <h3>What it isn&apos;t sure about</h3>
      {list(d.unsure_about)}

      {d.questions_for_volunteers && d.questions_for_volunteers.length > 0 && (
        <>
          <h3>Things you might know that it can&apos;t</h3>
          {list(d.questions_for_volunteers)}
        </>
      )}

      <p className="small muted" style={{ marginTop: 14 }}>
        Made by a computer from the photographs only. Not checked by anyone.
      </p>
    </div>
  );
}

function confidenceWords(level: string): string {
  if (level === "high") return "fairly sure";
  if (level === "medium") return "a reasonable guess";
  return "a rough guess";
}
