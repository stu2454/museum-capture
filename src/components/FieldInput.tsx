/**
 * Renders one schema field. Every branch here corresponds to a type in the
 * schema's vocabulary — adding a type means adding a branch, and updating the
 * extractor spec, the Pydantic model and the extraction prompt to match.
 */

import type { FieldValue, SchemaField } from "../types";

interface Props {
  field: SchemaField;
  value: FieldValue | undefined;
  onChange: (fieldId: string, value: FieldValue) => void;
}

const typed = (value: unknown, raw?: string): FieldValue => ({ value, raw, origin: "typed" });

export function FieldInput({ field, value, onChange }: Props) {
  const held = value?.value;
  const set = (next: unknown, raw?: string) => onChange(field.id, typed(next, raw));

  return (
    <div className="field">
      <label className="field-label" htmlFor={field.id}>
        {field.display_label}
        {field.required ? " *" : ""}
      </label>
      {field.hint && <span className="field-hint">{field.hint}</span>}
      {renderControl()}
    </div>
  );

  function renderControl() {
    switch (field.type) {
      case "longtext":
        return (
          <textarea
            id={field.id}
            className="field-area"
            value={(held as string) ?? ""}
            onChange={(e) => set(e.target.value)}
          />
        );

      case "number":
        return (
          <input
            id={field.id}
            className="field-control"
            type="number"
            inputMode="decimal"
            value={(held as string) ?? ""}
            onChange={(e) => set(e.target.value)}
          />
        );

      case "date":
        return (
          <input
            id={field.id}
            className="field-control"
            type="date"
            value={(held as string) ?? ""}
            onChange={(e) => set(e.target.value)}
          />
        );

      // Not a date picker, deliberately. "c. 1890" and "1920s" are real answers,
      // and a picker would force someone to invent precision they don't have.
      case "fuzzy_date":
        return (
          <>
            <input
              id={field.id}
              className="field-control"
              type="text"
              placeholder="1923, about 1890, 1920s, unknown"
              value={(held as string) ?? ""}
              onChange={(e) => set(e.target.value)}
            />
            <span className="field-hint">An approximate date is fine. Write it how you'd say it.</span>
          </>
        );

      case "boolean":
        return (
          <label className={`choice ${held ? "is-chosen" : ""}`}>
            <input type="checkbox" checked={Boolean(held)} onChange={(e) => set(e.target.checked)} />
            <span>{field.display_label}</span>
          </label>
        );

      case "enum":
        return (
          <div role="radiogroup" aria-labelledby={field.id}>
            {(field.options ?? []).map((option) => (
              <label key={option.value} className={`choice ${held === option.value ? "is-chosen" : ""}`}>
                <input
                  type="radio"
                  name={field.id}
                  value={option.value}
                  checked={held === option.value}
                  onChange={() => set(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        );

      case "multi_enum": {
        const chosen = Array.isArray(held) ? (held as string[]) : [];
        return (
          <div>
            {(field.options ?? []).map((option) => (
              <label key={option.value} className={`choice ${chosen.includes(option.value) ? "is-chosen" : ""}`}>
                <input
                  type="checkbox"
                  checked={chosen.includes(option.value)}
                  onChange={(e) =>
                    set(
                      e.target.checked
                        ? [...chosen, option.value]
                        : chosen.filter((v) => v !== option.value)
                    )
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        );
      }

      case "measurement": {
        const parts = (held as Record<string, string>) ?? {};
        return (
          <div className="field-inline">
            {(field.subfields ?? []).map((sub) =>
              sub.type === "enum" ? (
                <select
                  key={sub.id}
                  className="field-control"
                  style={{ flex: "0 0 96px" }}
                  aria-label={sub.display_label}
                  value={parts[sub.id] ?? ""}
                  onChange={(e) => set({ ...parts, [sub.id]: e.target.value })}
                >
                  <option value="">unit</option>
                  {(sub.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  key={sub.id}
                  className="field-control"
                  type="number"
                  inputMode="decimal"
                  placeholder={sub.display_label}
                  aria-label={sub.display_label}
                  value={parts[sub.id] ?? ""}
                  onChange={(e) => set({ ...parts, [sub.id]: e.target.value })}
                />
              )
            )}
          </div>
        );
      }

      default: {
        // text, and anything repeatable, which is really a list (materials, tags)
        if (field.repeatable) return <ListInput field={field} held={held} set={set} />;
        return (
          <input
            id={field.id}
            className="field-control"
            type="text"
            value={(held as string) ?? ""}
            onChange={(e) => set(e.target.value)}
          />
        );
      }
    }
  }
}

function ListInput({
  field,
  held,
  set,
}: {
  field: SchemaField;
  held: unknown;
  set: (next: unknown) => void;
}) {
  const items = Array.isArray(held) ? (held as string[]) : [];

  const add = (text: string) => {
    const entry = text.trim();
    if (entry && !items.includes(entry)) set([...items, entry]);
  };

  return (
    <div>
      <input
        id={field.id}
        className="field-control"
        type="text"
        placeholder="Type one, then press Enter"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(e.currentTarget.value);
            e.currentTarget.value = "";
          }
        }}
        onBlur={(e) => {
          add(e.currentTarget.value);
          e.currentTarget.value = "";
        }}
      />
      {items.length > 0 && (
        <div className="chips">
          {items.map((item) => (
            <span key={item} className="chip">
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => set(items.filter((v) => v !== item))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
