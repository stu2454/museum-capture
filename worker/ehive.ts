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
  photos: Array<{ id: string; is_primary: number }>;
}

/** A value a volunteer typed that would create a NEW term in an eHive pick list. */
export interface PickListWarning {
  field: string;
  ehive: string;
  value: string;
  count: number;
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

export function buildEhiveBundle(records: ExportRecord[], schemaYaml: string): EhiveBundle {
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

  const pick_lists: PickListWarning[] = [];
  for (const [field, bucket] of seen) {
    const column = columns.find((c) => c.from === field);
    for (const [value, count] of [...bucket].sort((a, b) => b[1] - a[1])) {
      pick_lists.push({ field, ehive: column?.ehive ?? field, value, count });
    }
  }

  return {
    csv: lines.join("\r\n"),
    photos,
    pick_lists,
    record_count: records.length,
    extra_columns: spec.extra_columns.map((c) => c.ehive),
  };
}
