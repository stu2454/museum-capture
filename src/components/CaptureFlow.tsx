/**
 * The capture flow: record number, photograph, then one screen per capture
 * group, then review.
 *
 * Step order comes from the schema's capture_groups, NOT the paper field order.
 * Paper order is filing order. Capture order is the order a person actually
 * handles an object - and that starts with reading the number off the tag that
 * is already tied to it.
 */

import { useEffect, useMemo, useState } from "react";
import { fieldsInGroup, captureGroups } from "../schema";
import { records } from "../db";
import { knownNumbers } from "../sync";
import type { ArtefactRecord, CaptureGroup, FieldValue, PhotoMeta } from "../types";
import type { Person } from "../identity";
import { AccessionTag } from "./AccessionTag";
import { WhoBadge } from "./WhoBadge";
import { FieldInput } from "./FieldInput";
import { PhotoStep } from "./PhotoStep";
import { ReviewSheet } from "./ReviewSheet";

interface Props {
  record: ArtefactRecord;
  /** Who is using the app, for the corner badge. Null until the app knows. */
  cataloguer: Person | null;
  onExit: () => void;
}

type Step =
  | { kind: "group"; group: CaptureGroup }
  | { kind: "photos" }
  | { kind: "review" };

/**
 * Photographs come straight after the first group (the record number) rather
 * than at the very start: knowing which record you are on before you shoot
 * stops photographs being filed against the wrong object.
 */
function buildSteps(): Step[] {
  const steps: Step[] = [];
  captureGroups.forEach((group, index) => {
    steps.push({ kind: "group", group });
    if (index === 0) steps.push({ kind: "photos" });
  });
  steps.push({ kind: "review" });
  return steps;
}

export function CaptureFlow({ record: initial, cataloguer, onExit }: Props) {
  const [record, setRecord] = useState<ArtefactRecord>(initial);
  const [step, setStep] = useState(0);
  const [clash, setClash] = useState<string | null>(null);

  const steps = useMemo(buildSteps, []);
  const current = steps[step];

  // Autosave. A volunteer who loses twenty minutes of work does not come back
  // next Saturday, so every change goes to disk immediately.
  useEffect(() => {
    void records.put(record);
  }, [record]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [step]);

  // Two volunteers cataloguing the same object, or a mistyped digit, both show
  // up as a number already on the device. Say so early, but don't block - the
  // museum's registers are the authority here, not this app.
  useEffect(() => {
    const number = record.registrationNumber?.trim();
    if (!number) {
      setClash(null);
      return;
    }
    void records.all().then((all) => {
      const other = all.find(
        (r) => r.id !== record.id && r.registrationNumber?.trim() === number
      );
      if (other) {
        setClash(
          `${number} is already used by another record on this device` +
            (other.values.object_name?.value ? ` (${other.values.object_name.value}).` : ".")
        );
        return;
      }

      // Numbers the museum already holds anywhere — other devices, and the
      // records already in eHive. Cached at the last sync so this still answers
      // in a store room with no signal.
      setClash(
        knownNumbers().has(number)
          ? `${number} is already used by an object in the museum's catalogue.`
          : null
      );
    });
  }, [record.registrationNumber, record.id]);

  function setValue(fieldId: string, value: FieldValue) {
    setRecord((currentRecord) => {
      const values = { ...currentRecord.values, [fieldId]: value };
      const registration = values.registration_number?.value;
      return {
        ...currentRecord,
        values,
        registrationNumber: typeof registration === "string" ? registration.trim() || null : currentRecord.registrationNumber,
      };
    });
  }

  function setPhotos(next: PhotoMeta[]) {
    setRecord((currentRecord) => ({ ...currentRecord, photos: next }));
  }

  async function confirm() {
    await records.put({ ...record, status: "review" });
    onExit();
  }

  return (
    <div className="app">
      <div className="who-row">
        <WhoBadge person={cataloguer} />
      </div>

      <AccessionTag
        registrationNumber={record.registrationNumber}
        objectName={(record.values.object_name?.value as string) ?? ""}
      />

      <div
        className="step-track"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={steps.length}
      >
        {steps.map((_, i) => (
          <span
            key={i}
            className={`step-mark ${i < step ? "is-done" : ""} ${i === step ? "is-current" : ""}`}
          />
        ))}
      </div>

      {current.kind === "photos" && <PhotoStep items={record.photos} onChange={setPhotos} />}

      {current.kind === "group" && (
        <div>
          <h2 className="question">{current.group.title}</h2>
          {current.group.voice_prompt && (
            <p className="question-note">{current.group.voice_prompt}</p>
          )}
          {current.group.id === "number" && clash && (
            <div className="notice notice-problem" role="alert">
              {clash} Check the register before carrying on - if this is the same object, open the
              existing record instead.
            </div>
          )}
          {fieldsInGroup(current.group.id).map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={record.values[field.id]}
              onChange={setValue}
            />
          ))}
        </div>
      )}

      {current.kind === "review" && <ReviewSheet record={record} />}

      <div className="actions">
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => (step === 0 ? onExit() : setStep(step - 1))}
        >
          {step === 0 ? "Save and close" : "Back"}
        </button>
        {current.kind === "review" ? (
          <button type="button" className="btn" onClick={() => void confirm()}>
            Save for review
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
