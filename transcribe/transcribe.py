#!/usr/bin/env python3
"""
Transcribe recorded contributions, on this computer.

    python3 transcribe/transcribe.py --setup            # once: install and download (~500 MB)
    python3 transcribe/transcribe.py --remote           # the live site's new recordings
    python3 transcribe/transcribe.py --local            # the local copy (npm run dev:local)

Run from the repository folder. It uses your existing `npx wrangler` sign-in to
read recordings and save transcripts, so there is no new password or key.

WHAT IT DOES, for each recording that doesn't have a transcript yet:
  1. Copies the recording from R2 to a temporary folder (deleted afterwards).
  2. Transcribes it with Parakeet TDT 0.6B v3 (NVIDIA's model, run offline through
     sherpa-onnx). Nothing is sent anywhere: the recordings may name living people.
  3. Checks capitalised words against transcribe/vocabulary.txt, so "Doriga"
     becomes "Dorrigo" — with "Doriga" kept beside it, never silently replaced.
  4. Marks noticeably quieter stretches: "possibly another voice — listen".
  5. Saves a new row in the `transcripts` table (migration 0011). Never edits one.

WHY PARAKEET. Compared with Whisper on the first three real recordings (Scotty,
14 Oct 2026), both misheard "Dorrigo", but Whisper silently dropped a second
person's words while Parakeet kept them. Parakeet also keeps "um"s, which is what
an oral-history record wants. Three clips is not a benchmark: see D-012.

ABOUT THE QUIETER-STRETCH FLAG. The person holding the device is loud; someone
across the room is not. On the first recordings this caught the background voice,
and also once flagged the speaker trailing off. It is a prompt for a reviewer to
listen, never a statement about who spoke. The thresholds are below, in one place,
to be retuned as real museum recordings come in.

Re-running: bump METHOD_VERSION (or pass --redo) and every recording gets a new,
additional transcript. Old ones are kept; the review page shows the newest.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import uuid
import wave
from pathlib import Path

METHOD_VERSION = "parakeet-v3-vocab-faint-1"

HERE = Path(__file__).resolve().parent
MODELS = HERE / "models"
VOCABULARY = HERE / "vocabulary.txt"

DATABASE = "artefact-catalogue"
BUCKET = "artefact-photos"

PARAKEET = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
MODEL_URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{PARAKEET}.tar.bz2"

SAMPLE_RATE = 16000

# ---- quieter-stretch flag. Calibrated on three clips; expect to retune. ----------
FRAME_S = 0.05        # loudness is measured in 50 ms slices
FAINT_BELOW_DB = 14   # this much quieter than the speaker's usual level...
ABOVE_FLOOR_DB = 12   # ...but clearly louder than the room's background hiss
FAINT_MIN_S = 0.25    # and lasting at least this long
WORD_LEAD_S = 0.2     # the engine time-stamps words slightly early

# ---- word-list corrections -------------------------------------------------------
MATCH_AT_LEAST = 0.75  # how alike a heard word must be to a listed one (0-1)
GENERIC = {"street", "falls", "harbour", "point", "lookout", "plateau", "river"}


# ----------------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe recorded contributions.")
    where = parser.add_mutually_exclusive_group()
    where.add_argument("--remote", action="store_true", help="the live site's database and storage")
    where.add_argument("--local", action="store_true", help="the local copy used by npm run dev:local")
    parser.add_argument("--setup", action="store_true", help="install the speech engine and download the model")
    parser.add_argument("--redo", action="store_true", help="transcribe again even if already done")
    parser.add_argument("--limit", type=int, default=50, help="most recordings in one run (default 50)")
    parser.add_argument("--file", help="just transcribe one audio file and print the result (for testing)")
    args = parser.parse_args()

    if args.setup:
        setup()
        return

    recogniser = load_recogniser()
    vocabulary = load_vocabulary()

    if args.file:
        with tempfile.TemporaryDirectory() as tmp:
            wav = to_wav(Path(args.file), Path(tmp))
            result = transcribe(recogniser, wav, vocabulary)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    if not (args.remote or args.local):
        sys.exit("Say which copy to work on: --remote (the live site) or --local.")

    target = ["--remote"] if args.remote else ["--local"]
    pending = find_pending(target, args.redo, args.limit)
    if not pending:
        print("Nothing to do: every recording already has a transcript.")
        return

    print(f"{len(pending)} recording(s) to transcribe.")
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        rows = []
        for item in pending:
            key = item["audio_r2_key"]
            audio = tmpdir / Path(key).name
            fetch(key, audio, args.local)
            wav = to_wav(audio, tmpdir)
            result = transcribe(recogniser, wav, vocabulary)
            rows.append((item["id"], result))
            flagged = len(result["notes"]["quieter"])
            print(f"  {item['id']}: {result['text'][:70]!r}"
                  + (f"  [{flagged} quieter stretch(es)]" if flagged else ""))
        save(rows, target, tmpdir, vocabulary)
    print("Done. Transcripts show on the review page.")


# ---- setup -------------------------------------------------------------------------
def setup() -> None:
    print("Installing the speech engine (sherpa-onnx) and numpy…")
    subprocess.run([sys.executable, "-m", "pip", "install", "--user", "--upgrade", "sherpa-onnx", "numpy"], check=True)
    MODELS.mkdir(exist_ok=True)
    if (MODELS / PARAKEET / "encoder.int8.onnx").exists():
        print("Model already downloaded.")
    else:
        archive = MODELS / f"{PARAKEET}.tar.bz2"
        print("Downloading Parakeet (about 490 MB, once)…")
        urllib.request.urlretrieve(MODEL_URL, archive)
        with tarfile.open(archive) as tar:
            tar.extractall(MODELS)
        archive.unlink()
    if not (shutil.which("ffmpeg") or shutil.which("afconvert")):
        print("Note: neither ffmpeg nor afconvert was found. On a Mac, afconvert is built in;"
              " elsewhere install ffmpeg.")
    print("Ready.")


# ---- the database and storage, through wrangler -----------------------------------
def wrangler(*args: str) -> str:
    npx = "npx.cmd" if os.name == "nt" else "npx"
    done = subprocess.run([npx, "wrangler", *args], capture_output=True, text=True)
    if done.returncode != 0:
        # wrangler's own message, which never contains our data or a credential.
        sys.exit(f"wrangler failed: {' '.join(args[:3])}\n{done.stderr.strip()[-800:]}")
    return done.stdout


def query(sql: str, target: list[str]) -> list[dict]:
    out = wrangler("d1", "execute", DATABASE, *target, "--json", "--command", sql)
    # Wrangler sometimes prints a notice (an update hint, a proxy note) before the JSON.
    start = out.find("[")
    if start < 0:
        sys.exit(f"wrangler gave no results for the query:\n{out.strip()[-400:]}")
    return json.loads(out[start:])[0]["results"]


def find_pending(target: list[str], redo: bool, limit: int) -> list[dict]:
    already = "" if redo else (
        f"AND NOT EXISTS (SELECT 1 FROM transcripts t WHERE t.contribution_id = c.id "
        f"AND t.method_version = '{METHOD_VERSION}')"
    )
    return query(
        f"SELECT c.id, c.audio_r2_key FROM contributions c "
        f"WHERE c.audio_r2_key IS NOT NULL AND c.deleted_at IS NULL {already} "
        f"ORDER BY c.created_at LIMIT {int(limit)}",
        target,
    )


def fetch(key: str, dest: Path, local: bool) -> None:
    # Wrangler 3 reads the live bucket unless told --local. (Wrangler 4 reverses
    # that default; add "--remote" here after upgrading.)
    wrangler("r2", "object", "get", f"{BUCKET}/{key}", "--file", str(dest), *(["--local"] if local else []))


def save(rows: list[tuple[str, dict]], target: list[str], tmpdir: Path, vocabulary: list[str]) -> None:
    vocab_hash = hashlib.sha256("\n".join(vocabulary).encode()).hexdigest()[:12]
    machine = platform.node() or "unknown"
    statements = []
    for contribution_id, r in rows:
        values = [
            f"tr_{uuid.uuid4().hex[:20]}", contribution_id, r["engine"], METHOD_VERSION, vocab_hash,
            r["raw_text"], r["text"], json.dumps(r["words"], ensure_ascii=False),
            json.dumps(r["notes"], ensure_ascii=False), r["seconds"], machine,
        ]
        statements.append(
            "INSERT INTO transcripts (id, contribution_id, engine, method_version, vocabulary_hash, "
            "raw_text, text, words_json, notes_json, audio_seconds, made_on) VALUES ("
            + ", ".join(sql_value(v) for v in values) + ");"
        )
    sql_file = tmpdir / "transcripts.sql"
    sql_file.write_text("\n".join(statements), encoding="utf-8")
    wrangler("d1", "execute", DATABASE, *target, "--file", str(sql_file))


def sql_value(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(round(v, 2)) if isinstance(v, float) else str(v)
    return "'" + str(v).replace("'", "''") + "'"


# ---- audio ---------------------------------------------------------------------------
def to_wav(src: Path, tmpdir: Path) -> Path:
    """16 kHz mono 16-bit WAV, which the model wants. ffmpeg if present, else the Mac's own afconvert."""
    out = tmpdir / (src.stem + ".wav")
    if shutil.which("ffmpeg"):
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ar", str(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", str(out)]
    elif shutil.which("afconvert"):
        # afconvert reads the iPhone/iPad .m4a recordings. It can't read Chrome's .webm;
        # for those, install ffmpeg (brew install ffmpeg).
        cmd = ["afconvert", "-f", "WAVE", "-d", f"LEI16@{SAMPLE_RATE}", "-c", "1", str(src), str(out)]
    else:
        sys.exit("Need ffmpeg or afconvert to read the recordings.")
    if subprocess.run(cmd, capture_output=True).returncode != 0:
        sys.exit(f"Couldn't convert {src.name}. If it's a .webm file, install ffmpeg (brew install ffmpeg).")
    return out


def read_wav(path: Path):
    import numpy as np

    with wave.open(str(path)) as w:
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768


# ---- transcription ---------------------------------------------------------------------
def load_recogniser():
    try:
        import sherpa_onnx
    except ImportError:
        sys.exit("The speech engine isn't installed. Run: python3 transcribe/transcribe.py --setup")
    folder = MODELS / PARAKEET
    if not (folder / "encoder.int8.onnx").exists():
        sys.exit("The model isn't downloaded. Run: python3 transcribe/transcribe.py --setup")
    return sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=str(folder / "encoder.int8.onnx"),
        decoder=str(folder / "decoder.int8.onnx"),
        joiner=str(folder / "joiner.int8.onnx"),
        tokens=str(folder / "tokens.txt"),
        model_type="nemo_transducer",
        num_threads=4,
    )


def transcribe(recogniser, wav: Path, vocabulary: list[str]) -> dict:
    audio = read_wav(wav)
    stream = recogniser.create_stream()
    stream.accept_waveform(SAMPLE_RATE, audio)
    recogniser.decode_stream(stream)
    result = stream.result

    words = to_words(result.tokens, result.timestamps)
    corrections = apply_vocabulary(words, vocabulary)
    quieter = mark_quieter(words, audio)

    return {
        "engine": f"sherpa-onnx {PARAKEET.replace('sherpa-onnx-nemo-', '')}",
        "raw_text": result.text.strip(),
        "text": " ".join(w["w"] for w in words),
        "words": words,
        "notes": {"corrections": corrections, "quieter": quieter},
        "seconds": round(len(audio) / SAMPLE_RATE, 2),
    }


def to_words(tokens, timestamps) -> list[dict]:
    """Join sub-word pieces into words, each with the time it starts (seconds)."""
    words: list[dict] = []
    for token, time in zip(tokens, timestamps):
        if token.startswith((" ", "▁")) or not words:
            words.append({"w": token.strip(" ▁"), "t": round(float(time), 2)})
        else:
            words[-1]["w"] += token
    return [w for w in words if w["w"]]


# ---- word list ---------------------------------------------------------------------------
def load_vocabulary() -> list[str]:
    lines = VOCABULARY.read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def english_words() -> set[str]:
    """The Mac's own dictionary, if there is one: a word in it is never 'corrected'."""
    path = Path("/usr/share/dict/words")
    if not path.exists():
        return set()
    return {w.strip().lower() for w in path.read_text(errors="ignore").splitlines()}


def apply_vocabulary(words: list[dict], vocabulary: list[str]) -> list[dict]:
    """
    A capitalised word that sounds like a listed one but isn't spelled like it is
    shown as the listed word, with what was heard kept in "heard". Only capitalised
    words, and never the first word of a sentence, so ordinary English is left alone.
    """
    targets = sorted({part for term in vocabulary for part in term.split()
                      if len(part) >= 4 and part.lower() not in GENERIC})
    dictionary = english_words()
    corrections = []
    sentence_start = True
    for word in words:
        core = word["w"].strip(".,?!;:\"'")
        tail = word["w"][len(word["w"].rstrip(".,?!;:\"'")):]
        if (not sentence_start and len(core) >= 4 and core[:1].isupper()
                and core.lower() not in dictionary
                and core.lower() not in {t.lower() for t in targets}):
            best = max(targets, key=lambda t: difflib.SequenceMatcher(None, core.lower(), t.lower()).ratio())
            score = difflib.SequenceMatcher(None, core.lower(), best.lower()).ratio()
            if score >= MATCH_AT_LEAST:
                word["heard"] = core
                word["w"] = best + tail
                corrections.append({"t": word["t"], "heard": core, "as": best, "likeness": round(score, 2)})
        sentence_start = word["w"].endswith((".", "?", "!"))
    return corrections


# ---- quieter stretches ---------------------------------------------------------------------
def mark_quieter(words: list[dict], audio) -> list[dict]:
    import numpy as np

    size = int(FRAME_S * SAMPLE_RATE)
    if len(audio) < size * 4:
        return []
    levels = np.array([
        20 * np.log10(np.sqrt(np.mean(audio[i:i + size] ** 2)) + 1e-9)
        for i in range(0, len(audio) - size + 1, size)
    ])
    floor, usual = np.percentile(levels, 10), np.percentile(levels, 90)
    faint = (levels > floor + ABOVE_FLOOR_DB) & (levels < usual - FAINT_BELOW_DB)

    stretches = []
    i = 0
    while i < len(faint):
        if faint[i]:
            j = i
            while j < len(faint) and faint[j]:
                j += 1
            if (j - i) * FRAME_S >= FAINT_MIN_S:
                stretches.append((i * FRAME_S, j * FRAME_S))
            i = j
        else:
            i += 1

    notes = []
    for start, end in stretches:
        inside = [w for w in words if start - 0.05 <= w["t"] + WORD_LEAD_S <= end + 0.05]
        if not inside:
            continue  # a quiet noise with no words in it is not worth a reviewer's time
        for w in inside:
            w["quieter"] = True
        notes.append({
            "start": round(start, 2),
            "end": round(end, 2),
            "words": " ".join(w["w"] for w in inside),
            "below_usual_db": round(float(usual - np.median(levels[int(start / FRAME_S):int(end / FRAME_S)])), 1),
        })
    return notes


if __name__ == "__main__":
    main()
