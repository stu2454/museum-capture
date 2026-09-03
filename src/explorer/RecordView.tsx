/**
 * A single record, read-only.
 *
 * Field labels and order come from the schema stored alongside the record, not
 * from anything hardcoded here. That means a record catalogued under an older
 * schema still displays with the labels it was written against — which is the
 * whole reason the schema is kept in the database.
 */

import { useCallback, useEffect, useState } from "react";
import yaml from "js-yaml";
import { api, photoUrl, type Me, type RecordDetail } from "./api";
import { RemovePanel } from "./RemovePanel";
import { AddPhotos } from "./AddPhotos";

interface FieldDef {
  id: string;
  display_label: string;
  mapping?: { ehive?: string } | null;
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

export function RecordView({
  id,
  me,
  onBack,
}: {
  id: string;
  me: Me;
  onBack: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [data, setData] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .record(id)
      .then(setData)
      .catch(() => setError("Couldn't load that record."));
  }, [id]);

  useEffect(load, [load]);

  // Choosing which picture represents an object is cataloguing, not admin, so any
  // volunteer may. A viewer is here to read.
  async function makePrimary(photoId: string) {
    if (me.role === "viewer") return;
    await api.setPrimaryPhoto(id, photoId).catch(() => undefined);
    load();
  }

  if (error) {
    return (
      <div className="app app-wide">
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
      <div className="app app-wide">
        <p className="muted" style={{ paddingTop: 40 }}>Loading…</p>
      </div>
    );
  }

  const values = JSON.parse(data.record.values_json || "{}") as Record<
    string,
    { value: unknown; raw?: string }
  >;
  const parsed = data.schema_yaml
    ? (yaml.load(data.schema_yaml) as { fields?: FieldDef[]; sections?: SectionDef[] })
    : null;

  const sections = (parsed?.sections ?? [])
    .filter((s) => s.page > 0)
    .sort((a, b) => a.order - b.order);

  // eHive fields this app has nowhere to put. Everything the schema maps is already
  // displayed above, and the housekeeping eHive keeps for itself is not worth a line.
  const claimed = new Set(
    (parsed?.fields ?? []).map((f) => f.mapping?.ehive).filter(Boolean) as string[]
  );
  const HOUSEKEEPING = new Set([
    "object_number", "name", "dublin_core", "ehive_object_type", "general_flag_admin",
  ]);
  const extras = Object.entries(data.ehive_fields ?? {}).filter(
    ([name, value]) => value && !claimed.has(name) && !HOUSEKEEPING.has(name)
  );

  const fieldsFor = (sectionId: string) =>
    (parsed?.fields ?? [])
      .filter((f) => f.section === sectionId && f.sensitivity !== "restricted")
      .sort((a, b) => a.order - b.order);

  return (
    <div className="app app-wide">
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
            <div key={photo.id} className="photo" style={{ border: "1px solid var(--rule)" }}>
              <img
                src={photoUrl(photo.id)}
                alt={photo.caption || "Artefact photograph"}
                loading="lazy"
                style={{ cursor: "zoom-in" }}
                onClick={() => setZoomed(photoUrl(photo.id))}
              />
              {photo.is_primary === 1 ? (
                <span className="photo-primary-flag">Main</span>
              ) : (
                me.role !== "viewer" && (
                  <button
                    type="button"
                    className="photo-make-primary"
                    onClick={() => void makePrimary(photo.id)}
                  >
                    Make main
                  </button>
                )
              )}
            </div>
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
        const fields = fieldsFor(section.id).filter((f) => present(values[f.id]));
        if (fields.length === 0) return null;
        return (
          <section key={section.id} className="sheet" style={{ marginTop: 16 }}>
            <h3>{section.title}</h3>
            <dl>
              {fields.map((field) => (
                <div key={field.id} className="sheet-line">
                  <dt>{field.display_label}</dt>
                  <dd>
                    {display(field, values[field.id])}
                    {values[field.id]?.value == null && values[field.id]?.raw && (
                      <span className="as-recorded">as recorded</span>
                    )}
                  </dd>
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
              .filter(([, v]) => present(v))
              .map(([key, v]) => (
                <div key={key} className="sheet-line">
                  <dt>{key}</dt>
                  <dd>
                    {v.value == null || v.value === ""
                      ? v.raw
                      : String(Array.isArray(v.value) ? v.value.join(", ") : v.value)}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      )}

      {me.role !== "viewer" && (
        <AddPhotos
          recordId={id}
          hasNoPhotos={data.photos.length === 0}
          onUploaded={load}
        />
      )}

      {me.role === "admin" && !removing && (
        <button
          type="button"
          className="btn btn-danger btn-wide"
          style={{ marginTop: 20 }}
          onClick={() => setRemoving(true)}
        >
          Remove this record from the collection
        </button>
      )}

      {removing && (
        <div style={{ marginTop: 20 }}>
          <RemovePanel
            recordId={id}
            label={(data.record.registration_number || data.record.object_name || "").trim()}
            onRemoved={onBack}
            onCancel={() => setRemoving(false)}
          />
        </div>
      )}

      {extras.length > 0 && (
        <section className="sheet" style={{ marginTop: 16 }}>
          <h3>Also held in eHive</h3>
          <p className="small muted" style={{ margin: "0 0 10px" }}>
            eHive keeps these against this object and this app has no field for them, so they
            are shown as eHive wrote them rather than being left out.
          </p>
          <dl>
            {extras.map(([name, value]) => (
              <div key={name} className="sheet-line">
                <dt>{name.replace(/_/g, " ")}</dt>
                <dd>{value}</dd>
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
            <dd>{cataloguer(data.record)}</dd>
          </div>
          {/* Only worth a line when it says something the line above doesn't:
              a museum device signed in as itself, with a named volunteer using
              it. When one person signed in and did their own work, repeating
              their address twice is noise. */}
          {data.record.synced_by && data.record.synced_by !== data.record.captured_by && (
            <div className="sheet-line">
              <dt>Sent from</dt>
              <dd>{data.record.synced_by}</dd>
            </div>
          )}
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

/**
 * Who catalogued this, in the most useful form available.
 *
 * Records made since the identity change carry an email that resolves to a name.
 * Older ones carry whatever was typed into a box, which resolves to nothing —
 * shown as it stands rather than dressed up as something more certain.
 */
function cataloguer(record: RecordDetail["record"]): string {
  const who = (record.captured_by ?? "").trim();
  if (!who) return "not recorded";
  const name = (record.captured_by_name ?? "").trim();
  return name ? `${name} · ${who}` : who;
}

/**
 * Is there anything to show?
 *
 * `raw` counts. It holds text the app couldn't fit into the field's shape -
 * eHive's measurements are one line of prose where we keep height, width and
 * length apart - and a field that has it is not empty, it is unparsed. Treating
 * those as blank is how the museum's own measurements went missing from the
 * imported records.
 */
function present(held: { value: unknown; raw?: string } | undefined): boolean {
  if (!held) return false;
  if (held.raw && held.raw.trim() !== "") return true;
  const value = held.value;
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value as object).some((v) => v !== "" && v != null);
  return true;
}

function display(field: FieldDef, held: { value: unknown; raw?: string } | undefined): string {
  const value = held?.value;

  // Nothing structured, but something was recorded. Show it exactly as written.
  if ((value == null || value === "") && held?.raw) return held.raw;

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
