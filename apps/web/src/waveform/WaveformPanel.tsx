// Results below the run bar: probes and plots for dc, ac and transient results,
// a table for operating points, and the cursor readout.
import { useMemo } from "react";
import { type SimResult, signalKey } from "../engine/results";
import { formatQuantity } from "../netlist/value";
import {
  useResultsStale,
  useSimulation,
  useSimulationStore,
} from "../simulation/SimulationContext";
import { CursorTable } from "./CursorTable";
import type { CursorState } from "./cursors";
import { Plot } from "./Plot";
import { SignalPicker } from "./SignalPicker";
import { Swatch } from "./Swatch";
import { traceVar } from "./traceColors";
import { listSignals, traceValues } from "./traces";
import "./WaveformPanel.css";

/** Panel height in px. Keep equal to --waveform-height in tokens.css (the CSS sets the box, Plot sizing uses this). */
export const WAVEFORM_PANEL_HEIGHT = 280;

const NO_CURSORS: CursorState = { a: null, b: null };

function OpTable({ result, stale }: { result: SimResult; stale: boolean }) {
  return (
    <div className="nodal-waveform nodal-optable" data-stale={stale ? "true" : undefined}>
      <table aria-label="Operating point">
        <tbody>
          {listSignals(result).map((s) => {
            const sig = result.signals.find((x) => signalKey(x) === s.key);
            const unit = s.key.startsWith("I(") ? "A" : "V";
            return (
              <tr key={s.key}>
                <th scope="row">{s.key}</th>
                <td className="nodal-num">{sig ? formatQuantity(sig.re[0] ?? NaN, unit) : ""}</td>
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
        color: traceVar(i),
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
  const stale = useResultsStale();
  const state = useSimulation((s) => s.cursors);
  if (!result) return null;
  if (result.type === "op") return <OpTable result={result} stale={stale} />;
  // Cursor state belongs to one analysis kind; a different kind starts clean.
  const cursors = state.type === result.type ? state.cursors : NO_CURSORS;
  const setCursors = (c: CursorState) => {
    sim.getState().setCursors(result.type, c);
  };
  return (
    <div
      className="nodal-waveform"
      data-testid="waveform-panel"
      data-stale={stale ? "true" : undefined}
    >
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
            <span key={key} className="nodal-chip" data-probe={key}>
              <Swatch index={i} />
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
