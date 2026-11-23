// A labelled text input with a local draft. Commits on blur and Enter, Esc restores
// the stored value. Select fields commit on change and have no draft.
import { useEffect, useId, useRef, useState } from "react";

export interface FieldProps {
  label: string;
  /** The stored value shown when there is no draft. */
  value: string;
  unit?: string;
  placeholder?: string;
  hint?: string;
  /** Shown only while the field is empty. */
  emptyHint?: string;
  multiline?: boolean;
  /** The text is a number (or has a unit): set in mono with tabular figures. */
  numeric?: boolean;
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
  emptyHint,
  multiline,
  numeric,
  validate,
  onCommit,
}: FieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [seen, setSeen] = useState(value);
  // A stored value that changed under us (undo, redo) wins over a pending draft.
  if (seen !== value) {
    setSeen(value);
    setDraft(null);
    setRejected(null);
  }
  // The latest draft, value and commit callback, for the commit on unmount: React
  // never calls onBlur on a node that is removed, e.g. when the selection changes.
  const latest = useRef({ draft, value, onCommit });
  useEffect(() => {
    latest.current = { draft, value, onCommit };
  });
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.draft !== null && l.draft !== l.value) l.onCommit(l.draft);
    },
    [],
  );
  const hintId = useId();
  const shown = draft ?? value;
  const hintText = hint ?? (shown.trim() === "" ? emptyHint : undefined);
  const error = rejected ?? validate?.(shown) ?? null;

  const commit = () => {
    latest.current.draft = null;
    if (draft !== null && draft !== value) setRejected(onCommit(draft) ?? null);
    setDraft(null);
  };

  const common = {
    "aria-label": label,
    "aria-invalid": error !== null,
    "aria-describedby": hintText ? hintId : undefined,
    value: shown,
    placeholder,
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value);
      setRejected(null);
    },
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        latest.current.draft = null;
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
    <div
      className="nodal-field"
      data-unit={unit ? "true" : undefined}
      data-numeric={numeric || unit ? "true" : undefined}
    >
      <span className="nodal-field-label">{label}</span>
      {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
      {unit ? <span className="nodal-unit">{unit}</span> : null}
      {hintText ? (
        <small id={hintId} className="nodal-hint">
          {hintText}
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
