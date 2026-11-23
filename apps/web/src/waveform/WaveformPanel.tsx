// Results below the run bar: probes and plots for dc, ac and transient results,
// a table for operating points, and the cursor readout.
import { useEffect, useMemo } from "react";
import { type SimResult, signalKey } from "../engine/results";
import { formatQuantity } from "../netlist/value";
import {
  useResultsStale,
  useSimulation,
  useSimulationStore,
} from "../simulation/SimulationContext";
import { CursorTable } from "./CursorTable";
import type { CursorId } from "./cursorInput";
import type { CursorState } from "./cursors";
import { Plot } from "./Plot";
import { SignalPicker } from "./SignalPicker";
import { Swatch } from "./Swatch";
import { traceVar } from "./traceColors";
import { listSignals, traceValues } from "./traces";
import "./WaveformPanel.css";

/** Panel height in px. Keep equal to --waveform-height in tokens.css (the CSS sets the box, Plot sizing uses this). */
export const WAVEFORM_PANEL_HEIGHT = 280;
/** The hint line under the plots. Keep equal to --waveform-hint-height in tokens.css. */
export const WAVEFORM_HINT_HEIGHT = 20;
/** Height left for the plots themselves (4 is the panel's shadow allowance). */
const PLOTS_HEIGHT = WAVEFORM_PANEL_HEIGHT - 4 - WAVEFORM_HINT_HEIGHT;

const CURSOR_HINT =
  "Click to place cursor A, click again for B. Drag a cursor to move it. Keys: A/B, ←/→, Delete.";

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

interface CursorHandlers {
  activeCursor: CursorId;
  onCursor(which: CursorId, x: number): void;
  onActiveCursor(which: CursorId): void;
  onClearCursor(which: CursorId): void;
}

function Plots({
  result,
  probes,
  cursors,
  handlers,
}: {
  result: SimResult;
  probes: string[];
  cursors: CursorState;
  handlers: CursorHandlers;
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
  const common = { x: result.axis, logX: ac, xLabel: xLabelOf(result), cursors, ...handlers };
  if ("linear" in series)
    return <Plot {...common} series={series.linear} yLabel="Value" height={PLOTS_HEIGHT} />;
  const half = PLOTS_HEIGHT / 2;
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
  const storedActive = useSimulation((s) => s.activeCursor);
  // Cursors belong to one analysis kind; for another kind they are empty and A is active.
  const stale0 = result !== null && state.type !== result.type;
  const activeCursor: CursorId = stale0 ? "a" : storedActive;
  useEffect(() => {
    if (stale0 && storedActive !== "a") sim.getState().setActiveCursor("a");
  }, [stale0, storedActive, sim]);
  if (!result) return null;
  if (result.type === "op") return <OpTable result={result} stale={stale} />;
  // Cursor state belongs to one analysis kind; a different kind starts clean.
  const cursors = state.type === result.type ? state.cursors : NO_CURSORS;
  const setCursors = (c: CursorState) => {
    sim.getState().setCursors(result.type, c);
  };
  // Every placement makes the placed cursor the active one.
  const place = (which: CursorId, x: number | null) => {
    setCursors({ ...cursors, [which]: x });
    sim.getState().setActiveCursor(which);
  };
  const handlers: CursorHandlers = {
    activeCursor,
    onCursor: place,
    onActiveCursor: (which) => {
      sim.getState().setActiveCursor(which);
    },
    onClearCursor: (which) => {
      setCursors({ ...cursors, [which]: null });
    },
  };
  return (
    <div
      className="nodal-waveform"
      data-testid="waveform-panel"
      data-stale={stale ? "true" : undefined}
    >
      <div className="nodal-waveform-plots">
        <Plots result={result} probes={probes} cursors={cursors} handlers={handlers} />
        <p className="nodal-waveform-hint">{CURSOR_HINT}</p>
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
        <CursorTable
          result={result}
          probes={probes}
          cursors={cursors}
          activeCursor={activeCursor}
          onPlace={place}
          onClear={() => {
            setCursors({ a: null, b: null });
            sim.getState().setActiveCursor("a");
          }}
        />
      </div>
    </div>
  );
}
