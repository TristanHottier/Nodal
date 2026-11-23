// Cursor inputs (A, B) and the readout: one row per probe with A, B and the difference.
import { Field } from "../editor/inspector/Field";
import type { SimResult } from "../engine/results";
import { signalUnit, xUnitOf } from "./axisLabels";
import { formatQuantity, formatValue, parseValue } from "../netlist/value";
import type { CursorId } from "./cursorInput";
import { type CursorState, cursorReadout } from "./cursors";
import { Swatch } from "./Swatch";
import type { TraceView } from "./traces";

export type { CursorState };

function fmt(v: number | null, unit: string): string {
  if (v === null) return "–";
  if (unit === "dB" || unit === "°") return `${String(Number(v.toPrecision(4)))} ${unit}`;
  return formatQuantity(v, unit).trim();
}

function CursorInput({
  which,
  value,
  unit,
  active,
  onChange,
}: {
  which: "A" | "B";
  value: number | null;
  unit: string;
  active: boolean;
  onChange: (x: number | null) => void;
}) {
  return (
    <div className="nodal-cursor-input" data-active={active ? "true" : undefined}>
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
    </div>
  );
}

export function CursorTable({
  result,
  probes,
  cursors,
  activeCursor,
  onPlace,
  onClear,
}: {
  result: SimResult;
  probes: string[];
  cursors: CursorState;
  activeCursor: CursorId;
  /** A typed value placed or cleared (null) cursor `which`; it becomes the active one. */
  onPlace: (which: CursorId, x: number | null) => void;
  onClear: () => void;
}) {
  const ac = result.type === "ac";
  const views: { view: TraceView; suffix: string; unit: (k: string) => string }[] = ac
    ? [
        { view: "mag", suffix: " dB", unit: () => "dB" },
        { view: "phase", suffix: " °", unit: () => "°" },
      ]
    : [{ view: "linear", suffix: "", unit: signalUnit }];
  const readouts = views.map((v) => ({
    ...v,
    readout: cursorReadout(result, probes, v.view, cursors.a, cursors.b),
  }));
  const xUnit = xUnitOf(result);
  const first = readouts[0]?.readout;
  return (
    <div className="nodal-cursors">
      <div className="nodal-cursor-inputs">
        <CursorInput
          which="A"
          value={cursors.a}
          unit={xUnit}
          active={activeCursor === "a"}
          onChange={(x) => {
            onPlace("a", x);
          }}
        />
        <CursorInput
          which="B"
          value={cursors.b}
          unit={xUnit}
          active={activeCursor === "b"}
          onChange={(x) => {
            onPlace("b", x);
          }}
        />
      </div>
      <div className="nodal-cursor-actions">
        <span className="nodal-cursor-active" data-testid="active-cursor">
          {`Active: ${activeCursor === "a" ? "A" : "B"}`}
        </span>
        <button type="button" className="nodal-cursor-clear" onClick={onClear}>
          Clear cursors
        </button>
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
                  <td>
                    <Swatch index={probes.indexOf(r.key)} />
                    {r.key + suffix}
                  </td>
                  <td data-col="a" className="nodal-num">
                    {fmt(r.a, u)}
                  </td>
                  <td data-col="b" className="nodal-num">
                    {fmt(r.b, u)}
                  </td>
                  <td data-col="delta" className="nodal-num">
                    {fmt(r.delta, u)}
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
        <tfoot>
          <tr>
            <td>Δx</td>
            <td colSpan={3} data-col="dx" className="nodal-num">
              {fmt(first?.dx ?? null, xUnit)}
            </td>
          </tr>
          {/* The reciprocal reads as a period or a frequency; for a DC sweep it has no meaning. */}
          {result.type === "dc" ? null : (
            <tr>
              <td>1/Δx</td>
              <td colSpan={3} data-col="inverse-dx" className="nodal-num">
                {fmt(first?.inverseDx ?? null, xUnit === "s" ? "Hz" : xUnit === "Hz" ? "s" : "")}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
