// A labelled text input with a local draft. Commits on blur and Enter, Esc restores
// the stored value. Select fields commit on change and have no draft.
import { useId, useState } from "react";

export interface FieldProps {
  label: string;
  /** The stored value shown when there is no draft. */
  value: string;
  unit?: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  /** Error for the displayed text, computed live. */
  validate?: (text: string) => string | null;
  /**
   * Called when the draft differs from `value`. Returning a message reverts the
   * input and shows it until the next edit.
   */
  onCommit: (text: string) => string | undefined;
}

/** Callers must key this component by item id and field key. */
export function Field({
  label,
  value,
  unit,
  placeholder,
  hint,
  multiline,
  validate,
  onCommit,
}: FieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const hintId = useId();
  const shown = draft ?? value;
  const error = rejected ?? validate?.(shown) ?? null;

  const commit = () => {
    if (draft !== null && draft !== value) setRejected(onCommit(draft) ?? null);
    setDraft(null);
  };

  const common = {
    "aria-label": label,
    "aria-invalid": error !== null,
    "aria-describedby": hint ? hintId : undefined,
    value: shown,
    placeholder,
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value);
      setRejected(null);
    },
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(null);
        setRejected(null);
        e.stopPropagation();
      } else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
        e.preventDefault();
        commit();
      }
    },
  };

  return (
    <div className="nodal-field">
      <span className="nodal-field-label">{label}</span>
      <div className="nodal-field-row">
        {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
        {unit ? <span className="nodal-unit">{unit}</span> : null}
      </div>
      {hint ? (
        <small id={hintId} className="nodal-hint">
          {hint}
        </small>
      ) : null}
      {error ? (
        <div role="alert" className="nodal-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly { value: string; text: string }[];
  onChange: (value: string) => void;
}

export function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <div className="nodal-field">
      <span className="nodal-field-label">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
    </div>
  );
}
