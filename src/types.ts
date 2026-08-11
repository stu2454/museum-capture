/**
 * Types mirroring schema/worksheet.v2.yaml.
 *
 * The YAML is the source of truth. If you change a field type here, change it
 * there first and make sure the extractor's spec still agrees.
 */

export type FieldType =
  | "text"
  | "longtext"
  | "number"
  | "measurement"
  | "date"
  | "fuzzy_date"
  | "enum"
  | "multi_enum"
  | "boolean"
  | "table"
  | "signature"
  | "image"
  | "audio";

export type Sensitivity = "public" | "internal" | "restricted";
export type FieldSource = "printed" | "inferred" | "app_added";

export interface FieldOption {
  value: string;
  label: string;
}

export interface SchemaField {
  id: string;
  label: string;
  display_label: string;
  section: string;
  page: number;
  order: number;
  source: FieldSource;
  type: FieldType;
  required: boolean | null;
  hint: string | null;
  options: FieldOption[] | null;
  units: string | null;
  repeatable: boolean;
  sensitivity: Sensitivity;
  capture_group?: string | null;
  capture_order?: number | null;
  voice_prompt?: string | null;
  autofill?: string | null;
  mapping: Record<string, unknown> | null;
  subfields: SchemaField[] | null;
  example: string | null;
  notes: string | null;
}

export interface CaptureGroup {
  id: string;
  title: string;
  order: number;
  voice_prompt: string | null;
  restricted: boolean;
}

export interface SchemaSection {
  id: string;
  title: string;
  page: number;
  order: number;
  source: FieldSource;
  description: string | null;
  notes: string | null;
}

export interface WorksheetSchema {
  schema_version: number;
  worksheet_title: string;
  source_form: string;
  target_system: string;
  capture_groups: CaptureGroup[];
  sections: SchemaSection[];
  fields: SchemaField[];
  open_questions: string[];
}

/** A single value as captured. `raw` always survives, even when parsing fails. */
export interface FieldValue {
  value: unknown;
  raw?: string;
  /** How this value got here — drives what the review screen highlights. */
  origin: "typed" | "spoken" | "inferred" | "autofilled";
}

export interface PhotoMeta {
  id: string;
  caption: string;
  primary: boolean;
  addedAt: string;
}

export type RecordStatus = "draft" | "review" | "confirmed" | "exported";

export interface ArtefactRecord {
  id: string;
  schemaVersion: number;
  registrationNumber: string | null;
  status: RecordStatus;
  values: Record<string, FieldValue>;
  photos: PhotoMeta[];
  capturedBy: string;
  capturedAt: string;
  updatedAt: string;
}
