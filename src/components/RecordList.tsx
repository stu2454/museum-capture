/**
 * The home screen: what's in progress, and a way to start something new.
 * An empty screen is an invitation to act, so it says what to do next.
 */

import { useState } from "react";
import type { ArtefactRecord } from "../types";
import { StorageNotice } from "./StorageNotice";

interface Props {
  list: ArtefactRecord[];
  unsynced?: number;
  onOpen: (id: string) => void;
  onStart: () => void;
  onExport: () => void;
}

/**
 * Who is cataloguing today. Kept on the device rather than in an account,
 * because a login screen is a barrier between a volunteer and twenty minutes of
 * useful work. Every record carries the name so a question can find its way back
 * to the person who wrote it.
 */
function Volunteer() {
  const [name, setName] = useState(() => localStorage.getItem("volunteerName") ?? "");
  return (
    <div className="field" style={{ marginBottom: 18 }}>
      <label className="field-label" htmlFor="volunteerName">
        Who's cataloguing today?
      </label>
      <input
        id="volunteerName"
        className="field-control"
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          localStorage.setItem("volunteerName", e.target.value);
        }}
      />
    </div>
  );
}

export function RecordList({ list, unsynced = 0, onOpen, onStart, onExport }: Props) {
  return (
    <div className="app">
      <header className="masthead">
        <p className="eyebrow">Collection store</p>
        <h1>Artefact Catalogue</h1>
      </header>

      <Volunteer />

      <StorageNotice />

      {/* Quiet, never an error. A failed sync is not a failed cataloguing
          session, and someone holding a fragile object should not be reading a
          network message. */}
      {list.length > 0 && (
        <p className="eyebrow" style={{ margin: "0 0 14px" }}>
          {unsynced > 0
            ? `${unsynced} ${unsynced === 1 ? "record" : "records"} not yet backed up`
            : "All records backed up"}
        </p>
      )}

      {list.length === 0 ? (
        <div className="empty">
          <p>Nothing recorded on this device yet. Pick up an object and start.</p>
          <button type="button" className="btn" onClick={onStart}>
            Start a record
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn-wide" onClick={onStart}>
            Start a record
          </button>
          <p className="eyebrow" style={{ margin: "26px 0 8px" }}>
            On this device — {list.length}
          </p>
          {list.map((record) => (
            <button
              type="button"
              key={record.id}
              className="record-link"
              onClick={() => onOpen(record.id)}
            >
              <div className="card-row">
                <strong>{(record.values.object_name?.value as string) || "Untitled object"}</strong>
                <span className={`status ${record.status === "confirmed" ? "is-confirmed" : ""}`}>
                  {record.status}
                </span>
              </div>
              <span className="record-ref">
                {record.registrationNumber || "no number yet"} · {record.photos.length}{" "}
                {record.photos.length === 1 ? "photo" : "photos"}
              </span>
            </button>
          ))}
          <button type="button" className="btn btn-quiet btn-wide" style={{ marginTop: 18 }} onClick={onExport}>
            Export all records
          </button>
        </>
      )}
    </div>
  );
}
