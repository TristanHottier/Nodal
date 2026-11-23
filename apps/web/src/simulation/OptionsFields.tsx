// Solver options. Empty means the engine default, shown as a hint.
import type { SimOptions } from "@nodal/schema";
import { SelectField } from "../editor/inspector/Field";
import { NumberField } from "./numberField";

type NumericKey = "reltol" | "abstol" | "vntol" | "gmin" | "chgtol" | "trtol";

const NUMERIC: { key: NumericKey; fallback: string }[] = [
  { key: "reltol", fallback: "0.001" },
  { key: "abstol", fallback: "1e-12" },
  { key: "vntol", fallback: "1e-6" },
  { key: "gmin", fallback: "1e-12" },
  { key: "chgtol", fallback: "1e-14" },
  { key: "trtol", fallback: "7" },
];

export function OptionsFields({
  options,
  onChange,
}: {
  options: SimOptions;
  onChange: (next: SimOptions) => void;
}) {
  // The schema keeps cleared options as explicit undefined; JSON drops them.
  const without = (key: keyof SimOptions): SimOptions => ({ ...options, [key]: undefined });
  return (
    <fieldset className="nodal-model nodal-rows" aria-label="Options">
      <SelectField
        label="method"
        value={options.method ?? ""}
        options={[
          { value: "", text: "default" },
          { value: "trap", text: "trap" },
          { value: "gear", text: "gear" },
        ]}
        onChange={(v) => {
          onChange(v === "trap" || v === "gear" ? { ...options, method: v } : without("method"));
        }}
      />
      {NUMERIC.map(({ key, fallback }) => (
        <NumberField
          key={key}
          label={key}
          optional
          emptyHint={`Engine default ${fallback}`}
          value={options[key]}
          check={(n) => (n > 0 ? null : "Must be greater than 0")}
          onSet={(n) => {
            onChange(n === undefined ? without(key) : { ...options, [key]: n });
          }}
        />
      ))}
    </fieldset>
  );
}
