// Cursor inputs (A, B) and the readout: one row per probe with A, B and the difference.
import { Field } from "../editor/inspector/Field";
import type { SimResult } from "../engine/results";
import { formatQuantity, formatValue, parseValue } from "../netlist/value";
import { cursorReadout } from "./cursors";
import type { TraceView } from "./traces";

export interface CursorState {
  a: number | null;
  b: number | null;
}

const X_UNIT = { tran: "s", ac: "Hz", dc: "", op: "" } as const;

function fmt(v: number | null, unit: string): string {
  if (v === null) return "–";
  if (unit === "dB" || unit === "°") return `${String(Number(v.toPrecision(4)))} ${unit}`;
  return formatQuantity(v, unit).trim();
}

const unitOf = (key: string) => (key.startsWith("I(") ? "A" : "V");

function CursorInput({
  which,
  value,
  unit,
  onChange,
}: {
  which: "A" | "B";
  value: number | null;
  unit: string;
  onChange: (x: number | null) => void;
}) {
  return (
    <Field
      label={`Cursor ${which}`}
      value={value === null ? "" : formatValue(value, 6)}
      unit={unit}
      placeholder="click the plot"
      onCommit={(text) => {
        if (text.trim() === "") {
          onChange(null);
          return undefined;
        }
        const r = parseValue(text);
        if (!r.ok) return r.error;
        onChange(r.value);
        return undefined;
      }}
    />
  );
}

export function CursorTable({
  result,
  probes,
  cursors,
  onChange,
}: {
  result: SimResult;
  probes: string[];
  cursors: CursorState;
  onChange: (c: CursorState) => void;
}) {
  const ac = result.type === "ac";
  const views: { view: TraceView; suffix: string; unit: (k: string) => string }[] = ac
    ? [
        { view: "mag", suffix: " dB", unit: () => "dB" },
        { view: "phase", suffix: " °", unit: () => "°" },
      ]
    : [{ view: "linear", suffix: "", unit: unitOf }];
  const readouts = views.map((v) => ({
    ...v,
    readout: cursorReadout(result, probes, v.view, cursors.a, cursors.b),
  }));
  const xUnit = X_UNIT[result.type];
  const first = readouts[0]?.readout;
  return (
    <div className="nodal-cursors">
      <div className="nodal-cursor-inputs">
        <CursorInput
          which="A"
          value={cursors.a}
          unit={xUnit}
          onChange={(a) => {
            onChange({ ...cursors, a });
          }}
        />
        <CursorInput
          which="B"
          value={cursors.b}
          unit={xUnit}
          onChange={(b) => {
            onChange({ ...cursors, b });
          }}
        />
      </div>
      <table aria-label="Cursor readout">
        <thead>
          <tr>
            <th>Signal</th>
            <th>A</th>
            <th>B</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {readouts.flatMap(({ readout, suffix, unit }) =>
            readout.rows.map((r) => {
              const u = unit(r.key);
              return (
                <tr key={r.key + suffix} data-signal={r.key + suffix}>
                  <td>{r.key + suffix}</td>
                  <td data-col="a">{fmt(r.a, u)}</td>
                  <td data-col="b">{fmt(r.b, u)}</td>
                  <td data-col="delta">{fmt(r.delta, u)}</td>
                </tr>
              );
            }),
          )}
        </tbody>
        <tfoot>
          <tr>
            <td>Δx</td>
            <td colSpan={3} data-col="dx">
              {fmt(first?.dx ?? null, xUnit)}
            </td>
          </tr>
          <tr>
            <td>1/Δx</td>
            <td colSpan={3} data-col="inverse-dx">
              {fmt(first?.inverseDx ?? null, xUnit === "s" ? "Hz" : xUnit === "Hz" ? "s" : "")}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
