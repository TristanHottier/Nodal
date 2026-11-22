// Top of the results panel: analysis choice, Run and Cancel, progress and status.
import { useEditor, useEditorStore } from "../editor/EditorContext";
import { analysisLabel } from "./AnalysisFields";
import { useResultsStale, useSimulation, useSimulationStore } from "./SimulationContext";
import "./RunBar.css";

export function RunBar() {
  const editor = useEditorStore();
  const sim = useSimulationStore();
  const analyses = useEditor((s) => s.project.simulation.analyses);
  const status = useSimulation((s) => s.status);
  const stale = useResultsStale();
  const chosen = useSimulation((s) => s.analysisIndex);
  const index = Math.min(chosen, analyses.length - 1);
  const running = status.kind === "running";

  const text =
    status.kind === "failed"
      ? status.message
      : status.kind === "running"
        ? "Running…"
        : status.kind === "done" && !stale
          ? "Done"
          : stale
            ? "Out of date, run again"
            : "";

  return (
    <div className="nodal-runbar">
      <select
        aria-label="Analysis to run"
        value={index}
        disabled={running}
        onChange={(e) => {
          sim.getState().setAnalysisIndex(Number(e.target.value));
        }}
      >
        {analyses.map((a, i) => (
          <option key={i} value={i}>
            {`${String(i + 1)}. ${analysisLabel(a)}`}
          </option>
        ))}
      </select>
      {running ? (
        <button
          type="button"
          onClick={() => {
            sim.getState().cancel();
          }}
        >
          Cancel
        </button>
      ) : (
        <button
          type="button"
          className="nodal-button-primary"
          onClick={() => {
            void sim.getState().run(editor.getState().getProject(), index);
          }}
        >
          Run
        </button>
      )}
      <progress
        aria-label="Simulation progress"
        max={1}
        className="nodal-num"
        value={status.kind === "running" ? status.progress : status.kind === "done" ? 1 : 0}
      />
      <span role="status" className="nodal-num" data-failed={status.kind === "failed"}>
        {text}
      </span>
    </div>
  );
}
