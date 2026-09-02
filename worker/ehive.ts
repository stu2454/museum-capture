/**
 * Building the eHive import spreadsheet.
 *
 * WHAT THIS PRODUCES, AND WHY IT IS A FILE RATHER THAN AN API CALL. eHive has no
 * write API - theirs returns public fields for reading and publishing, and imports
 * are run by Vernon Systems staff against a test server from a spreadsheet sent by
 * email or Dropbox. So the end of this pipeline is a person attaching a file, and
 * no amount of code changes that.
 *
 * Output is CSV in the workbook's own column order, including the columns this
 * museum has nothing for, so it can be pasted into the official spreadsheet
 * without anything sliding sideways.
 *
 * NOTHING HERE KNOWS A FIELD NAME. The column order, the eHive field for each
 * column, and which of our fields feeds it all come from ehive_export in the
 * schema. If the mapping is wrong, it is wrong in the schema, which is where a
 * person can see it and where it is version controlled next to the reasoning.
 */

import yaml from "js-yaml";

interface SchemaField {
  id: string;
  type?: string;
  display_label?: string;
  options?: Array<{ value: string; label: string }> | null;
  subfields?: SchemaField[] | null;
}

interface ColumnSpec {
  col?: string;
  ehive: string;
  label: string | null;
  from: string | null;
}

interface EhiveExport {
  constants: Record<string, string>;
  pick_list_fields: string[];
  columns: ColumnSpec[];
  extra_columns: ColumnSpec[];
}

interface Schema {
  fields: SchemaField[];
  ehive_export: EhiveExport;
}

export interface ExportRecord {
  id: string;
  registration_number: string | null;
  object_name: string | null;
  values_json: string;
  /** Set when this object came from eHive. Sends it back as an update, not a copy. */
  ehive_record_id?: string | null;
  photos: Array<{ id: string; is_primary: number }>;
}

/** A value a volunteer typed, checked against the terms eHive already holds. */
export interface PickListWarning {
  field: string;
  ehive: string;
  value: string;
  count: number;
  /**
   * True when this exact term is already in the museum's eHive account. False
   * means importing it CREATES a new term - which is sometimes right and
   * sometimes a misspelling, and only a person can tell which.
   */
  known: boolean;
  /** Terms already in eHive that look like this one. Usually the intended spelling. */
  similar: string[];
}

/** Existing eHive terms, by our field id. Empty when nothing has been imported. */
export type KnownTerms = Record<string, string[]>;

/**
 * Loose match, for suggesting what someone probably meant: case, punctuation and
 * spacing removed. "Butter Churn", "butter churn" and "butter-churn" all collapse
 * to the same key, which is exactly the confusion eHive's pick lists punish.
 */
function loose(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export interface EhiveBundle {
  csv: string;
  /** Image filenames the spreadsheet references, which must be sent alongside it. */
  photos: Array<{ filename: string; photo_id: string; record: string }>;
  pick_lists: PickListWarning[];
  record_count: number;
  extra_columns: string[];
}

/** A held value, as the app stores it. */
type Held = { value?: unknown } | undefined;

function held(values: Record<string, Held>, id: string): unknown {
  return values[id]?.value;
}

/**
 * One field, rendered as eHive wants to read it.
 *
 * Never invents and never rounds: a measurement with only a height gives a height,
 * an unrecognised enum falls back to the stored value rather than a blank. Losing a
 * volunteer's answer silently at the last step would be the worst place to do it.
 */
function render(field: SchemaField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  if (Array.isArray(value)) return value.filter(Boolean).join(", ");

  if (field?.type === "measurement" && typeof value === "object") {
    const parts = value as Record<string, string>;
    const numbers = (field.subfields ?? [])
      .filter((s) => s.type !== "enum")
      .map((s) => parts[s.id])
      .filter((v) => v !== undefined && v !== "");
    const unitField = (field.subfields ?? []).find((s) => s.type === "enum");
    const unit = unitField && parts[unitField.id] ? ` ${parts[unitField.id]}` : "";
    return numbers.length ? `${numbers.join(" x ")}${unit}` : "";
  }

  if (field?.type === "enum" && field.options) {
    return field.options.find((o) => o.value === value)?.label ?? String(value);
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "object") {
    // A composite with no special handling: keep whatever is in it rather than
    // dropping the lot.
    return Object.values(value as Record<string, unknown>)
      .filter((v) => v !== "" && v != null)
      .join(" ");
  }

  return String(value);
}

/**
 * A filename for a photograph, derived from the registration number.
 *
 * It has to survive being an actual file on someone's desktop and then being typed
 * into a spreadsheet cell, so anything that isn't a letter, digit, dot or dash goes.
 * A record with no number falls back to its id - ugly, but unique, and the
 * alternative is two objects claiming the same filename.
 */
export function photoFilename(record: ExportRecord, index: number): string {
  const base = (record.registration_number || record.id)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || record.id}_${index + 1}.jpg`;
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildEhiveBundle(
  records: ExportRecord[],
  schemaYaml: string,
  known: KnownTerms = {}
): EhiveBundle {
  const schema = yaml.load(schemaYaml) as Schema;
  const spec = schema.ehive_export;
  if (!spec) throw new Error("This schema version has no ehive_export block.");

  const byId = new Map(schema.fields.map((f) => [f.id, f]));
  const columns = [...spec.columns, ...spec.extra_columns];

  // Distinct values per pick-list field, so the report can say how many records a
  // stray spelling would affect rather than just that it exists.
  const seen = new Map<string, Map<string, number>>();
  const photos: EhiveBundle["photos"] = [];

  const lines: string[] = [columns.map((c) => csvCell(c.ehive)).join(",")];

  for (const record of records) {
    let values: Record<string, Held> = {};
    try {
      values = JSON.parse(record.values_json || "{}") as Record<string, Held>;
    } catch {
      // A record whose values won't parse still gets a row, so it shows up in the
      // import as an object with a number and nothing else, rather than vanishing.
    }

    // Primary first: the workbook's first image column is the primary reference.
    const ordered = [...record.photos].sort((a, b) => b.is_primary - a.is_primary);
    const filenames = ordered.map((p, i) => {
      const filename = photoFilename(record, i);
      photos.push({
        filename,
        photo_id: p.id,
        record: record.registration_number || record.id,
      });
      return filename;
    });

    const row = columns.map((column) => {
      const from = column.from;
      if (!from) return "";

      // The id eHive gave this record, for objects that came from there. Empty for
      // anything catalogued here, which is what tells eHive to create it.
      if (from === "=ehive_id") return record.ehive_record_id ?? "";

      if (from.startsWith("=constant:")) return spec.constants[from.slice(10)] ?? "";

      if (from.startsWith("=photo:")) return filenames[Number(from.slice(7))] ?? "";

      if (from.startsWith("=join:")) {
        return from
          .slice(6)
          .split(",")
          .map((id) => render(byId.get(id), held(values, id)))
          .filter(Boolean)
          .join("; ");
      }

      if (from.startsWith("=subfield:")) {
        const [parentId, subId] = from.slice(10).split(".");
        const parent = held(values, parentId);
        if (parent && typeof parent === "object") {
          const v = (parent as Record<string, unknown>)[subId];
          return v == null ? "" : String(v);
        }
        return "";
      }

      const text = render(byId.get(from), held(values, from));

      if (text && spec.pick_list_fields.includes(from)) {
        const bucket = seen.get(from) ?? new Map<string, number>();
        bucket.set(text, (bucket.get(text) ?? 0) + 1);
        seen.set(from, bucket);
      }

      return text;
    });

    lines.push(row.map(csvCell).join(","));
  }

  // Checked against what eHive actually holds, where we know it. Without an import
  // every value reads as new, which is honest: we genuinely don't know.
  const pick_lists: PickListWarning[] = [];
  for (const [field, bucket] of seen) {
    const column = columns.find((c) => c.from === field);
    const terms = known[field] ?? [];
    const byLoose = new Map(terms.map((t) => [loose(t), t]));

    for (const [value, count] of [...bucket].sort((a, b) => b[1] - a[1])) {
      const exact = terms.includes(value);
      const near = byLoose.get(loose(value));
      pick_lists.push({
        field,
        ehive: column?.ehive ?? field,
        value,
        count,
        known: exact,
        // A near match only helps when it isn't the value itself.
        similar: !exact && near ? [near] : [],
      });
    }
  }

  // Unknown terms first: those are the ones somebody has to look at.
  pick_lists.sort((a, b) => Number(a.known) - Number(b.known) || b.count - a.count);

  return {
    csv: lines.join("\r\n"),
    photos,
    pick_lists,
    record_count: records.length,
    extra_columns: spec.extra_columns.map((c) => c.ehive),
  };
}


/* ------------------------------------------------------------------ import --
 *
 * The other direction: eHive's records into ours.
 *
 * This is the reverse of the mapping above, and reversing is lossier than going
 * forwards. Several of our fields feed one eHive field - dimensions and weight
 * both become measurement_description, maker and secondary_maker both become
 * primary_creator_maker - and no honest rule splits one string back into two. So
 * the inverse takes the FIRST of our fields that claims each eHive field, skips
 * the ones whose shape can't hold text, and leaves the rest alone.
 *
 * Nothing is discarded by that. The verbatim eHive record stays in
 * ehive_records.fields_json, linked by object_record_id, so what the mapping
 * can't carry is still there to read. The alternative - parsing "420 x 300 mm"
 * back into height and width - would invent a precision the source doesn't have,
 * which is the same mistake as a date picker.
 */

/** Types that hold a plain string. A measurement or an image cannot. */
const TEXT_LIKE = new Set(["text", "longtext", "fuzzy_date", "date", "enum", "number"]);

export interface EhiveSourceRecord {
  object_record_id: string;
  fields_json: string;
}

export interface ImportedRecord {
  ehive_record_id: string;
  registration_number: string | null;
  object_name: string | null;
  values_json: string;
  captured_by: string | null;
  captured_at: string | null;
  /** eHive field names we had nowhere to put. Reported, never silently dropped. */
  unmapped: string[];
}

export function buildImportedRecords(
  rows: EhiveSourceRecord[],
  schemaYaml: string
): { records: ImportedRecord[]; unmapped: Record<string, number> } {
  const schema = yaml.load(schemaYaml) as Schema;

  // eHive field name -> our field. First claimant wins, and only if it can hold
  // the text eHive gives us.
  const inverse = new Map<string, SchemaField>();
  for (const field of schema.fields) {
    const target = (field as SchemaField & { mapping?: { ehive?: string } | null }).mapping?.ehive;
    if (!target || target === "NOT_EXPORTED") continue;
    if (!TEXT_LIKE.has(field.type ?? "")) continue;
    if (!inverse.has(target)) inverse.set(target, field);
  }

  const unmapped: Record<string, number> = {};
  const records: ImportedRecord[] = [];

  for (const row of rows) {
    let fields: Record<string, string> = {};
    try {
      fields = JSON.parse(row.fields_json || "{}") as Record<string, string>;
    } catch {
      // A record we can't read still gets imported, carrying its id, so it shows
      // up as something to look at rather than going missing.
    }

    const values: Record<string, { value: unknown; raw?: string; origin: string }> = {};
    const missed: string[] = [];

    for (const [ehiveName, value] of Object.entries(fields)) {
      if (!value) continue;
      const field = inverse.get(ehiveName);
      if (!field) {
        missed.push(ehiveName);
        unmapped[ehiveName] = (unmapped[ehiveName] ?? 0) + 1;
        continue;
      }

      // An enum only accepts one of its own options. Anything else keeps the eHive
      // wording as raw rather than being forced into the nearest choice.
      if (field.type === "enum" && field.options) {
        const match = field.options.find(
          (o) => o.label.toLowerCase() === value.toLowerCase() || o.value === value
        );
        values[field.id] = match
          ? { value: match.value, origin: "imported" }
          : { value: "", raw: value, origin: "imported" };
        continue;
      }

      // A date field only holds a real date. eHive's accession dates include bare
      // years like "2016", which a date input cannot show and which would appear
      // blank -- so the text is kept as raw and flagged, the same way a value that
      // won't parse is kept anywhere else in this app.
      if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        values[field.id] = { value: "", raw: value, origin: "imported" };
        continue;
      }

      values[field.id] = { value, origin: "imported" };
    }

    records.push({
      ehive_record_id: row.object_record_id,
      registration_number: fields.object_number ?? null,
      object_name: fields.name ?? null,
      values_json: JSON.stringify(values),
      captured_by: fields.cataloguer ?? null,
      captured_at: fields.catalogued_date ?? null,
      unmapped: missed,
    });
  }

  return { records, unmapped };
}
