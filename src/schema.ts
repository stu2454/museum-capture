/**
 * Loads the worksheet schema and exposes it to the UI.
 *
 * Nothing in the app hardcodes a field name. If you need to change what is
 * asked, or in what order, edit schema/worksheet.v2.yaml — not a component.
 */

import yaml from "js-yaml";
import rawSchema from "../schema/worksheet.v2.yaml?raw";
import type { CaptureGroup, FieldValue, SchemaField, WorksheetSchema } from "./types";

export const schema = yaml.load(rawSchema) as WorksheetSchema;

/** Groups a volunteer actually walks through. Restricted groups are not among them. */
export const captureGroups: CaptureGroup[] = schema.capture_groups
  .filter((g) => !g.restricted)
  .sort((a, b) => a.order - b.order);

export function fieldsInGroup(groupId: string): SchemaField[] {
  return schema.fields
    .filter((f) => f.capture_group === groupId && f.type !== "image" && f.type !== "audio")
    .sort((a, b) => (a.capture_order ?? 0) - (b.capture_order ?? 0));
}

export function fieldById(id: string): SchemaField | undefined {
  return schema.fields.find((f) => f.id === id);
}

/**
 * Fields a volunteer is asked about, in flow order. Restricted fields (donor
 * name, address, email, phone, tax number) are excluded by construction, not by
 * a check at render time — they should never reach a component.
 */
export function volunteerFields(): SchemaField[] {
  return captureGroups.flatMap((g) => fieldsInGroup(g.id)).filter((f) => f.sensitivity !== "restricted");
}

/**
 * Ids of every restricted field — donor name, address, email, phone, tax number.
 *
 * Anything that leaves the device filters through this: the JSON export and the
 * sync payload. One definition rather than a copy per exit path, because the
 * failure mode is silent — a new exit path that forgets to strip looks like it
 * works, and the leak is only visible to whoever receives the file.
 */
export const restrictedFieldIds: ReadonlySet<string> = new Set(
  schema.fields.filter((f) => f.sensitivity === "restricted").map((f) => f.id)
);

/** Values with every restricted field removed. Use on any path off the device. */
export function withoutRestricted(
  values: Record<string, FieldValue>
): Record<string, FieldValue> {
  const kept: Record<string, FieldValue> = {};
  for (const [fieldId, held] of Object.entries(values)) {
    if (restrictedFieldIds.has(fieldId)) continue;
    kept[fieldId] = held;
  }
  return kept;
}

export const restrictedFieldCount = restrictedFieldIds.size;

/** Sections in paper order, used by the review sheet to echo the printed form. */
export function printedSections() {
  return schema.sections.filter((s) => s.page > 0).sort((a, b) => a.order - b.order);
}

export function printedFieldsInSection(sectionId: string): SchemaField[] {
  return schema.fields
    .filter((f) => f.section === sectionId && f.source !== "app_added" && f.sensitivity !== "restricted")
    .sort((a, b) => a.order - b.order);
}
