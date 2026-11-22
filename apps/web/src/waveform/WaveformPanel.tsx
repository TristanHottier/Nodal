// Results below the run bar: probes and plots for dc, ac and transient results,
// a table for operating points, and the cursor readout.
import { useMemo, useState } from "react";
import { type SimResult, signalKey } from "../engine/results";
import { formatQuantity } from "../netlist/value";
import { useSimulation, useSimulationStore } from "../simulation/SimulationContext";
import { CursorTable, type CursorState } from "./CursorTable";
import { Plot, TRACE_COLORS } from "./Plot";
import { SignalPicker } from "./SignalPicker";
import { listSignals, traceValues } from "./traces";

export const WAVEFORM_PANEL_HEIGHT = 280;

export const WAVEFORM_CSS = `
.nodal-waveform { display: flex; height: ${String(WAVEFORM_PANEL_HEIGHT)}px; border-top: 1px solid #e5e7eb; font-size: 12px; }
.nodal-waveform-plots { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.nodal-waveform-side { flex: none; width: 320px; padding: 6px 10px; overflow-y: auto; border-left: 1px solid #e5e7eb; }
.nodal-waveform .u-title { display: none; }
.nodal-signalpicker { display: flex; gap: 4px; margin-bottom: 6px; }
.nodal-signalpicker select { flex: 1; min-width: 0; font: inherit; }
.nodal-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.nodal-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 4px 1px 6px; border: 1px solid; border-radius: 10px; background: #fff; }
.nodal-chip button { padding: 0 3px; font: inherit; line-height: 1; border: 0; background: none; cursor: pointer; }
.nodal-cursor-inputs { display: flex; gap: 8px; }
.nodal-cursor-inputs .nodal-field { flex: 1; min-width: 0; margin-bottom: 4px; }
.nodal-cursors table { width: 100%; border-collapse: collapse; }
.nodal-cursors th, .nodal-cursors td { padding: 1px 4px; text-align: right; white-space: nowrap; }
.nodal-cursors th:first-child, .nodal-cursors td:first-child { text-align: left; }
.nodal-optable { padding: 6px 10px; overflow-y: auto; width: 100%; }
.nodal-optable table { border-collapse: collapse; }
.nodal-optable td, .nodal-optable th { padding: 1px 12px 1px 0; text-align: left; }
`;

const NO_CURSORS: CursorState = { a: null, b: null };

function OpTable({ result }: { result: SimResult }) {
  return (
    <div className="nodal-waveform nodal-optable">
      <table aria-label="Operating point">
        <tbody>
          {listSignals(result).map((s) => {
            const sig = result.signals.find((x) => signalKey(x) === s.key);
            const unit = s.key.startsWith("I(") ? "A" : "V";
            return (
              <tr key={s.key}>
                <th scope="row">{s.key}</th>
                <td>{sig ? formatQuantity(sig.re[0] ?? NaN, unit) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function xLabelOf(result: SimResult): string {
  if (result.type === "tran") return "Time (s)";
  if (result.type === "ac") return "Frequency (Hz)";
  return result.source ?? "Sweep";
}

function Plots({
  result,
  probes,
  cursors,
  onCursor,
}: {
  result: SimResult;
  probes: string[];
  cursors: CursorState;
  onCursor: (which: "a" | "b", x: number) => void;
}) {
  const ac = result.type === "ac";
  const series = useMemo(() => {
    const build = (view: "linear" | "mag" | "phase") =>
      probes.map((key, i) => ({
        label: key,
        values: traceValues(result, key, view),
        color: TRACE_COLORS[i % TRACE_COLORS.length] ?? "#2563eb",
      }));
    return ac ? { mag: build("mag"), phase: build("phase") } : { linear: build("linear") };
  }, [result, probes, ac]);
  const common = { x: result.axis, logX: ac, xLabel: xLabelOf(result), cursors, onCursor };
  if ("linear" in series)
    return (
      <Plot {...common} series={series.linear} yLabel="Value" height={WAVEFORM_PANEL_HEIGHT - 4} />
    );
  const half = (WAVEFORM_PANEL_HEIGHT - 4) / 2;
  return (
    <>
      <Plot {...common} xLabel="" series={series.mag} yLabel="Magnitude (dB)" height={half} />
      <Plot {...common} series={series.phase} yLabel="Phase (°)" height={half} />
    </>
  );
}

export function WaveformPanel() {
  const sim = useSimulationStore();
  const result = useSimulation((s) => s.result);
  const probes = useSimulation((s) => s.probes);
  const [state, setState] = useState<{ type: SimResult["type"] | null; cursors: CursorState }>({
    type: null,
    cursors: NO_CURSORS,
  });
  if (!result) return null;
  if (result.type === "op") return <OpTable result={result} />;
  // Cursor state belongs to one analysis kind; a different kind starts clean.
  const cursors = state.type === result.type ? state.cursors : NO_CURSORS;
  const setCursors = (c: CursorState) => {
    setState({ type: result.type, cursors: c });
  };
  return (
    <div className="nodal-waveform" data-testid="waveform-panel">
      <div className="nodal-waveform-plots">
        <Plots
          result={result}
          probes={probes}
          cursors={cursors}
          onCursor={(which, x) => {
            setCursors({ ...cursors, [which]: x });
          }}
        />
      </div>
      <div className="nodal-waveform-side">
        <SignalPicker
          signals={listSignals(result)}
          probes={probes}
          onAdd={(k) => {
            sim.getState().addProbe(k);
          }}
        />
        <div className="nodal-chips">
          {probes.map((key, i) => (
            <span
              key={key}
              className="nodal-chip"
              data-probe={key}
              style={{ borderColor: TRACE_COLORS[i % TRACE_COLORS.length] ?? "#2563eb" }}
            >
              {key}
              <button
                type="button"
                aria-label={`Remove ${key}`}
                onClick={() => {
                  sim.getState().removeProbe(key);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <CursorTable result={result} probes={probes} cursors={cursors} onChange={setCursors} />
      </div>
    </div>
  );
}
