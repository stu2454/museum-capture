/**
 * Removing a record.
 *
 * Two deliberate speed bumps: a reason, and typing the registration number.
 * Removing the wrong record should be harder than a mis-tapped button, and six
 * months later "why is 1994.017 missing?" needs a better answer than someone's
 * memory.
 *
 * Nothing is destroyed. The record, its history and its photographs all remain;
 * it simply stops appearing in the collection and can be brought back.
 */

import { useState } from "react";
import { api } from "./api";

interface Props {
  recordId: string;
  label: string; // registration number, or the object name if it has no number
  onRemoved: () => void;
  onCancel: () => void;
}

export function RemovePanel({ recordId, label, onRemoved, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setProblem(null);
    try {
      await api.removeRecord(recordId, reason, confirm);
      onRemoved();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't remove that record.");
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ borderColor: "var(--alert)" }}>
      <h3 style={{ marginTop: 0, fontWeight: 500 }}>Remove this record</h3>

      <p className="small" style={{ marginTop: 0 }}>
        The record stops appearing in the collection. Nothing is destroyed — its history and
        photographs are kept, and an administrator can bring it back.
      </p>

      <div className="notice notice-open" style={{ marginTop: 14 }}>
        <h4>Removing is not deaccessioning</h4>
        <p style={{ margin: 0 }}>
          If the museum is actually disposing of an object, that decision belongs to the
          committee and needs recording in the museum&apos;s own deaccession process. Use this
          for duplicates, test entries and mistakes.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="remove-reason">
          Why is it being removed?
        </label>
        <span className="field-hint">
          For example: &quot;duplicate of 1994.016&quot; or &quot;test record made during
          training&quot;.
        </span>
        <textarea
          id="remove-reason"
          className="field-area"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="remove-confirm">
          Type <strong>{label}</strong> to confirm
        </label>
        <input
          id="remove-confirm"
          className="field-control"
          type="text"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {problem && <div className="notice notice-problem">{problem}</div>}

      <div className="button-pair" style={{ marginTop: 4 }}>
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy || reason.trim().length < 4 || confirm.trim() !== label}
          onClick={() => void remove()}
        >
          {busy ? "Removing…" : "Remove record"}
        </button>
      </div>
    </section>
  );
}
