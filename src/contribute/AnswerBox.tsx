/**
 * One question, and the volunteer's answer to it: typed, spoken, or both.
 *
 * Nothing is discarded. If sending fails the words and the recording stay
 * exactly where they were, with a plain message and the same button to try
 * again. Only a confirmed save clears the box.
 */

import { useEffect, useState } from "react";
import { contributeApi } from "./api";
import { Recorder, type Recording } from "./Recorder";
import type { Question } from "./questions";

interface Props {
  recordId: string;
  question: Question;
  /** Shown the machine description already? Recorded with the answer. */
  aiSeen: boolean;
  /** Email of the person the screen says is talking, when not the signed-in one. */
  speakingFor: string | null;
  /** How many answers this person has already saved to this question. */
  savedCount: number;
  onSaved: () => void;
  onDirty: (key: string, dirty: boolean) => void;
}

export function AnswerBox({ recordId, question, aiSeen, speakingFor, savedCount, onSaved, onDirty }: Props) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const hasSomething = text.trim().length > 0 || recording !== null;

  useEffect(() => {
    onDirty(question.key, hasSomething);
  }, [hasSomething, question.key, onDirty]);

  async function send() {
    setSending(true);
    setProblem(null);
    const form = new FormData();
    form.set("question", question.key);
    form.set("question_text", question.ask);
    form.set("body", text.trim());
    form.set("ai_seen", aiSeen ? "1" : "0");
    if (speakingFor) form.set("speaking_for", speakingFor);
    if (recording) {
      const ext = recording.blob.type.includes("mp4") ? "m4a" : recording.blob.type.includes("ogg") ? "ogg" : "webm";
      form.set("audio", new File([recording.blob], `answer.${ext}`, { type: recording.blob.type }));
      form.set("audio_seconds", String(recording.seconds));
    }
    try {
      await contributeApi.send(recordId, form);
      setText("");
      setRecording(null);
      setJustSaved(true);
      onSaved();
    } catch (error) {
      setProblem(
        (error instanceof Error && error.message && !error.message.startsWith("Request failed")
          ? error.message
          : "That didn't save — probably the connection.") +
          " Nothing is lost: your answer is still here. Try again in a moment."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card answer" aria-labelledby={`q-${question.key}`}>
      <h2 className="question answer-question" id={`q-${question.key}`}>
        {question.ask}
      </h2>
      <p className="question-note">{question.hint}</p>

      {savedCount > 0 && (
        <p className="answer-saved" role={justSaved ? "status" : undefined}>
          <span aria-hidden="true">✓ </span>
          {savedCount === 1 ? "You've answered this." : `You've answered this ${savedCount} times.`} You can add more
          below.
        </p>
      )}

      <label className="field-label" htmlFor={`a-${question.key}`}>
        Type your answer
      </label>
      <textarea
        id={`a-${question.key}`}
        className="field-area"
        value={text}
        disabled={sending}
        onChange={(e) => {
          setText(e.target.value);
          setJustSaved(false);
        }}
      />

      <p className="answer-or" aria-hidden="true">
        or
      </p>
      <Recorder
        recording={recording}
        disabled={sending}
        onChange={(next) => {
          setRecording(next);
          setJustSaved(false);
        }}
      />

      {problem && (
        <div className="notice notice-problem" role="alert" style={{ margin: "14px 0 0" }}>
          {problem}
        </div>
      )}

      <button
        type="button"
        className="btn btn-wide"
        style={{ marginTop: 14 }}
        disabled={!hasSomething || sending}
        onClick={() => void send()}
      >
        {sending ? "Saving…" : "Save this answer"}
      </button>
    </section>
  );
}
