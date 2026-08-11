/**
 * The capture flow: photograph, then one screen per capture group, then review.
 *
 * Step order comes from the schema's capture_groups, NOT the paper field order.
 * Paper order is filing order. Capture order is the order a person actually
 * handles an object.
 */

import { useEffect, useState } from "react";
import { fieldsInGroup, captureGroups } from "../schema";
import { records } from "../db";
import type { ArtefactRecord, FieldValue, PhotoMeta } from "../types";
import { AccessionTag } from "./AccessionTag";
import { FieldInput } from "./FieldInput";
import { PhotoStep } from "./PhotoStep";
import { ReviewSheet } from "./ReviewSheet";

interface Props {
  record: ArtefactRecord;
  onExit: () => void;
}

const PHOTO_STEP = 0;

export function CaptureFlow({ record: initial, onExit }: Props) {
  const [record, setRecord] = useState<ArtefactRecord>(initial);
  const [step, setStep] = useState(PHOTO_STEP);

  const lastStep = captureGroups.length + 1; // photos + groups + review
  const group = step > 0 && step <= captureGroups.length ? captureGroups[step - 1] : null;
  const onReview = step === lastStep;

  // Autosave. A volunteer who loses twenty minutes of work does not come back
  // next Saturday, so every change goes to disk immediately.
  useEffect(() => {
    void records.put(record);
  }, [record]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [step]);

  function setValue(fieldId: string, value: FieldValue) {
    setRecord((current) => {
      const values = { ...current.values, [fieldId]: value };
      // Keep the tag in step with what's been entered, so the volunteer can see
      // the record taking shape rather than working into a void.
      const registration = values.registration_number?.value;
      return {
        ...current,
        values,
        registrationNumber:
          typeof registration === "string" && registration ? registration : current.registrationNumber,
      };
    });
  }

  function setPhotos(next: PhotoMeta[]) {
    setRecord((current) => ({ ...current, photos: next }));
  }

  async function confirm() {
    const finished: ArtefactRecord = { ...record, status: "review" };
    await records.put(finished);
    onExit();
  }

  return (
    <div className="app">
      <AccessionTag
        registrationNumber={record.registrationNumber}
        objectName={(record.values.object_name?.value as string) ?? ""}
      />

      <div className="step-track" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={lastStep + 1}>
        {Array.from({ length: lastStep + 1 }, (_, i) => (
          <span
            key={i}
            className={`step-mark ${i < step ? "is-done" : ""} ${i === step ? "is-current" : ""}`}
          />
        ))}
      </div>

      {step === PHOTO_STEP && <PhotoStep items={record.photos} onChange={setPhotos} />}

      {group && (
        <div>
          <h2 className="question">{group.title}</h2>
          {group.voice_prompt && <p className="question-note">{group.voice_prompt}</p>}
          {fieldsInGroup(group.id).map((field) => (
            <FieldInput key={field.id} field={field} value={record.values[field.id]} onChange={setValue} />
          ))}
        </div>
      )}

      {onReview && <ReviewSheet record={record} />}

      <div className="actions">
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => (step === 0 ? onExit() : setStep(step - 1))}
        >
          {step === 0 ? "Save and close" : "Back"}
        </button>
        {onReview ? (
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
