/**
 * Review screen, laid out as the printed worksheet it replaces — same sections,
 * same paper order, same wording. Volunteers know the paper form; reading the
 * record back in its shape is how they can tell whether it's right.
 *
 * Note this uses the PAPER order (`order`), not the capture order. Capture order
 * is for doing the work; paper order is for checking it.
 */

import { printedFieldsInSection, printedSections, restrictedFieldCount } from "../schema";
import type { ArtefactRecord, SchemaField } from "../types";

interface Props {
  record: ArtefactRecord;
}

export function ReviewSheet({ record }: Props) {
  return (
    <div>
      <h2 className="question">Check the record</h2>
      <p className="question-note">
        Read it back against the object. Anything blank can be filled in later — nothing here is
        final until someone confirms it.
      </p>

      {printedSections().map((section) => {
        const fields = printedFieldsInSection(section.id);
        if (fields.length === 0) return null;
        return (
          <section key={section.id} className="sheet">
            <h3>{section.title}</h3>
            <dl>
              {fields.map((field) => (
                <div key={field.id} className="sheet-line">
                  <dt>{field.display_label}</dt>
                  <dd className={present(record, field) ? "" : "is-blank"}>
                    {present(record, field) ? display(record, field) : "not recorded"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <div className="notice notice-restricted">
        <h4>Donor details are not part of this record</h4>
        {restrictedFieldCount} fields on the paper form — donor name, address, email, phone and the
        tax incentive number — are personal information about a living person. They belong with the
        deed of gift, entered separately, and they are never included in anything exported from here.
      </div>
    </div>
  );
}

function held(record: ArtefactRecord, field: SchemaField): unknown {
  return record.values[field.id]?.value;
}

function present(record: ArtefactRecord, field: SchemaField): boolean {
  const value = held(record, field);
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value as object).some((v) => v !== "" && v != null);
  return true;
}

function display(record: ArtefactRecord, field: SchemaField): string {
  const value = held(record, field);

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

  if (field.type === "enum") {
    return field.options?.find((o) => o.value === value)?.label ?? String(value);
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  return String(value);
}
