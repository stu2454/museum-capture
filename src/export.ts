/**
 * Record export.
 *
 * JSON export works now. eHive export does NOT, and is blocked on purpose:
 * every mapping.ehive value in the schema is still UNVERIFIED. Shipping a
 * half-correct field mapping produces an import that looks like it worked, which
 * is a worse outcome than no export at all. Confirm the mappings against eHive's
 * own import spreadsheet, then build it.
 */

import { restrictedFieldIds, schema } from "./schema";
import type { ArtefactRecord } from "./types";

export interface ExportBundle {
  exportedAt: string;
  schemaVersion: number;
  sourceForm: string;
  targetSystem: string;
  /** Restricted fields are never included. Donor details travel separately. */
  containsPersonalInformation: false;
  records: Array<Record<string, unknown>>;
}

export function toBundle(list: ArtefactRecord[]): ExportBundle {
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: schema.schema_version,
    sourceForm: schema.source_form,
    targetSystem: schema.target_system,
    containsPersonalInformation: false,
    records: list.map((record) => {
      const values: Record<string, unknown> = {};
      for (const [fieldId, held] of Object.entries(record.values)) {
        if (restrictedFieldIds.has(fieldId)) continue;
        if (held.value === "" || held.value == null) continue;
        values[fieldId] = held.value;
      }
      return {
        id: record.id,
        registrationNumber: record.registrationNumber,
        status: record.status,
        capturedBy: record.capturedBy,
        capturedAt: record.capturedAt,
        photoCount: record.photos.length,
        values,
      };
    }),
  };
}

export const ehiveExportReady = false;

export const ehiveBlockedReason =
  "Field mappings to eHive are unverified. Check each one against the eHive import " +
  "spreadsheet and set mapping.ehive in the schema before this is switched on.";
