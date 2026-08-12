/**
 * A single record, read-only.
 *
 * Field labels and order come from the schema stored alongside the record, not
 * from anything hardcoded here. That means a record catalogued under an older
 * schema still displays with the labels it was written against — which is the
 * whole reason the schema is kept in the database.
 */

import { useEffect, useState } from "react";
import yaml from "js-yaml";
import { api, photoUrl, type RecordDetail } from "./api";

interface FieldDef {
  id: string;
  display_label: string;
  section: string;
  order: number;
  type: string;
  sensitivity: string;
  options?: Array<{ value: string; label: string }> | null;
  subfields?: FieldDef[] | null;
}

interface SectionDef {
  id: string;
  title: string;
  order: number;
  page: number;
}

export function RecordView({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  useEffect(() => {
    api
      .record(id)
      .then(setData)
      .catch(() => setError("Couldn't load that record."));
  }, [id]);

  if (error) {
    return (
      <div className="app">
        <button type="button" className="btn btn-quiet" onClick={onBack}>
          Back
        </button>
        <div className="notice notice-problem" style={{ marginTop: 16 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app">
        <p className="muted" style={{ paddingTop: 40 }}>Loading…</p>
      </div>
    );
  }

  const values = JSON.parse(data.record.values_json || "{}") as Record<string, { value: unknown }>;
  const parsed = data.schema_yaml
    ? (yaml.load(data.schema_yaml) as { fields?: FieldDef[]; sections?: SectionDef[] })
    : null;

  const sections = (parsed?.sections ?? [])
    .filter((s) => s.page > 0)
    .sort((a, b) => a.order - b.order);

  const fieldsFor = (sectionId: string) =>
    (parsed?.fields ?? [])
      .filter((f) => f.section === sectionId && f.sensitivity !== "restricted")
      .sort((a, b) => a.order - b.order);

  return (
    <div className="app">
      <button type="button" className="btn btn-quiet" onClick={onBack} style={{ marginTop: 12 }}>
        Back to the collection
      </button>

      <div className="tag" style={{ marginTop: 16 }}>
        <span className="tag-hole" aria-hidden="true" />
        <span className={`tag-number ${data.record.registration_number ? "" : "is-unassigned"}`}>
          {data.record.registration_number || "no number"}
        </span>
      </div>

      <h1 style={{ fontFamily: "var(--display)", fontWeight: 400, fontSize: "1.6rem", margin: "0 0 16px" }}>
        {data.record.object_name || "Untitled object"}
      </h1>

      {data.photos.length > 0 && (
        <div className="photo-grid">
          {data.photos.map((photo) => (
            <button
              type="button"
              key={photo.id}
              className="photo"
              onClick={() => setZoomed(photoUrl(photo.id))}
              style={{ padding: 0, border: "1px solid var(--rule)", cursor: "zoom-in" }}
            >
              <img src={photoUrl(photo.id)} alt={photo.caption || "Artefact photograph"} loading="lazy" />
              {photo.is_primary === 1 && <span className="photo-primary-flag">Main</span>}
            </button>
          ))}
        </div>
      )}

      {zoomed && (
        <div className="lightbox" onClick={() => setZoomed(null)} role="presentation">
          <img src={zoomed} alt="Artefact photograph, enlarged" />
          <p className="small">Tap anywhere to close</p>
        </div>
      )}

      {sections.map((section) => {
        const fields = fieldsFor(section.id).filter((f) => present(values[f.id]?.value));
        if (fields.length === 0) return null;
        return (
          <section key={section.id} className="sheet" style={{ marginTop: 16 }}>
            <h3>{section.title}</h3>
            <dl>
              {fields.map((field) => (
                <div key={field.id} className="sheet-line">
                  <dt>{field.display_label}</dt>
                  <dd>{display(field, values[field.id]?.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      {!parsed && (
        <div className="notice notice-open" style={{ marginTop: 16 }}>
          <h4>Field labels unavailable</h4>
          <p style={{ margin: 0 }}>
            The field definitions for this record&apos;s schema version aren&apos;t in the database,
            so the raw field names are shown instead.
          </p>
        </div>
      )}

      {!parsed && (
        <section className="sheet" style={{ marginTop: 16 }}>
          <dl>
            {Object.entries(values)
              .filter(([, v]) => present(v?.value))
              .map(([key, v]) => (
                <div key={key} className="sheet-line">
                  <dt>{key}</dt>
                  <dd>{String(Array.isArray(v.value) ? v.value.join(", ") : v.value)}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}

      <section className="sheet" style={{ marginTop: 16 }}>
        <h3>Record history</h3>
        <dl>
          <div className="sheet-line">
            <dt>Catalogued by</dt>
            <dd>{data.record.captured_by || "not recorded"}</dd>
          </div>
          <div className="sheet-line">
            <dt>Status</dt>
            <dd>{data.record.status}</dd>
          </div>
          <div className="sheet-line">
            <dt>Versions kept</dt>
            <dd>{data.revisions.length}</dd>
          </div>
          <div className="sheet-line">
            <dt>Last changed</dt>
            <dd>{new Date(data.record.updated_at).toLocaleString("en-AU")}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function present(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value as object).some((v) => v !== "" && v != null);
  return true;
}

function display(field: FieldDef, value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");

  if (field.type === "measurement" && value && typeof value === "object") {
    const parts = value as Record<string, string>;
    const numbers = (field.subfields ?? [])
      .filter((s) => s.type !== "enum")
      .map((s) => parts[s.id])
      .filter(Boolean);
    const unit = (field.subfields ?? []).find((s) => s.type === "enum");
    const suffix = unit && parts[unit.id] ? ` ${parts[unit.id]}` : "";
    return numbers.length ? `${numbers.join(" × ")}${suffix}` : "";
  }

  if (field.type === "enum" && field.options) {
    return field.options.find((o) => o.value === value)?.label ?? String(value);
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
