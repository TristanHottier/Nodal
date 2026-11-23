// A Field that stores a number: ADR 0009 notation in, engineering notation out.
import { formatValue, parseValue } from "../netlist/value";
import { Field } from "../editor/inspector/Field";

export interface NumberFieldProps {
  /** Also the React key suffix: the parent keys the field by item and this label. */
  label: string;
  value: number | undefined;
  unit?: string;
  hint?: string;
  /** Shown while the field is empty; for optional numbers. */
  emptyHint?: string;
  /** Rejects values: returns a message, or null when acceptable. */
  check?: (n: number) => string | null;
  /** `undefined` means the field was cleared (optional numbers only). */
  onSet: (n: number | undefined) => void;
  optional?: boolean;
}

export function NumberField({
  label,
  value,
  unit,
  hint,
  emptyHint,
  check,
  onSet,
  optional,
}: NumberFieldProps) {
  const error = (text: string): string | null => {
    if (text.trim() === "") return optional ? null : "Enter a number";
    const r = parseValue(text);
    if (!r.ok) return r.error;
    return check?.(r.value) ?? null;
  };
  return (
    <Field
      label={label}
      numeric
      value={value === undefined ? "" : formatValue(value)}
      {...(unit ? { unit } : {})}
      {...(hint ? { hint } : {})}
      {...(emptyHint ? { emptyHint } : {})}
      validate={error}
      onCommit={(text) => {
        const message = error(text);
        if (message) return message;
        const r = parseValue(text);
        onSet(r.ok ? r.value : undefined);
        return undefined;
      }}
    />
  );
}
