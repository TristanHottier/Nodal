// Status-bar readout of the run behind the plots: analysis, point count and wall-clock time.
import { useResultsStale, useSimulation } from "./SimulationContext";
import "./RunReadout.css";

export function formatElapsed(ms: number): string {
  return ms < 1000 ? `${String(Math.max(1, Math.round(ms)))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function RunReadout() {
  const result = useSimulation((s) => s.result);
  const elapsed = useSimulation((s) => s.elapsedMs);
  const stale = useResultsStale();
  if (!result || elapsed === null) return null;
  const size =
    result.type === "op"
      ? `${String(result.signals.length)} signals`
      : `${String(result.axis.length)} points`;
  return (
    <span className="nodal-num nodal-run-readout" data-testid="run-readout" data-stale={stale}>
      {[result.type, size, formatElapsed(elapsed), stale ? "stale" : null]
        .filter(Boolean)
        .join(" · ")}
    </span>
  );
}
