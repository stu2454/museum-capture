/**
 * Record a spoken answer.
 *
 * Tap to start, tap to stop — not press-and-hold. Holding a button down while
 * talking is hard for older hands, and an accidental release cuts someone off
 * mid-sentence.
 *
 * The recording lives in memory until it is sent. It is not written to browser
 * storage: answers may name living people (see src/contribute/api.ts). The
 * parent keeps it on screen if sending fails.
 *
 * iPhone and iPad Safari record audio/mp4; Chrome records audio/webm. Both are
 * accepted by the server and played back in the review page.
 */

import { useEffect, useRef, useState } from "react";

/** Ten minutes. Long enough for a real story; short enough to send on museum wifi. */
const MAX_SECONDS = 600;

export interface Recording {
  blob: Blob;
  seconds: number;
}

interface Props {
  recording: Recording | null;
  onChange: (recording: Recording | null) => void;
  disabled?: boolean;
}

function pickType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

export function canRecord(): boolean {
  return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function Recorder({ recording, onChange, disabled }: Props) {
  const [state, setState] = useState<"idle" | "starting" | "recording">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);

  // A playable address for the finished recording, released when it changes.
  useEffect(() => {
    if (!recording) {
      setPlayUrl(null);
      return;
    }
    const url = URL.createObjectURL(recording.blob);
    setPlayUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recording]);

  // Leaving the screen mid-recording must release the microphone.
  useEffect(() => () => stopEverything(), []);

  function stopEverything() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  async function start() {
    setProblem(null);
    setState("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const type = pickType();
      const rec = new MediaRecorder(media, type ? { mimeType: type } : undefined);
      chunks.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        const seconds = (Date.now() - startedAt.current) / 1000;
        const blob = new Blob(chunks.current, { type: rec.mimeType || type || "audio/webm" });
        stopEverything();
        setState("idle");
        if (blob.size > 0) onChange({ blob, seconds });
        else setProblem("Nothing was recorded. Please try again.");
      };
      recorder.current = rec;
      // A slice every second, so a crash mid-story loses a second, not the story.
      rec.start(1000);
      startedAt.current = Date.now();
      setElapsed(0);
      setState("recording");
      timer.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      stopEverything();
      setState("idle");
      setProblem(
        "The microphone couldn't be used. If the device asked for permission, please allow it and try again. You can always type instead."
      );
    }
  }

  function stop() {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  if (!canRecord()) return null;

  if (state === "recording") {
    return (
      <div className="recorder is-recording" role="status" aria-live="polite">
        <span className="recorder-dot" aria-hidden="true" />
        <span className="recorder-time">Recording… {clock(elapsed)}</span>
        <button type="button" className="btn recorder-stop" onClick={stop}>
          Stop
        </button>
      </div>
    );
  }

  if (recording && playUrl) {
    return (
      <div className="recorder">
        <p className="small" style={{ margin: "0 0 6px" }}>
          Your recording ({clock(Math.round(recording.seconds))}). Listen back if you like.
        </p>
        <audio controls src={playUrl} preload="metadata" className="recorder-audio" />
        <div className="button-pair" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-quiet" disabled={disabled} onClick={() => void start()}>
            Record again
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={disabled}
            onClick={() => {
              if (window.confirm("Throw away this recording?")) onChange(null);
            }}
          >
            Throw it away
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="recorder">
      <button
        type="button"
        className="btn btn-quiet btn-wide recorder-start"
        disabled={disabled || state === "starting"}
        onClick={() => void start()}
      >
        <span className="recorder-mic" aria-hidden="true" />
        {state === "starting" ? "Starting the microphone…" : "Tell us out loud instead"}
      </button>
      {problem && (
        <p className="small" role="alert" style={{ margin: "8px 0 0", color: "var(--alert)" }}>
          {problem}
        </p>
      )}
    </div>
  );
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
