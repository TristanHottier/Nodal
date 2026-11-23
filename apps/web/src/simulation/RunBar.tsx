// Top of the results panel: analysis choice, Run and Cancel, progress and status.
import { CircleAlert, CircleCheck, Clock, LoaderCircle, Play, Square } from "lucide-react";
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
  const StatusIcon =
    status.kind === "failed"
      ? CircleAlert
      : status.kind === "running"
        ? LoaderCircle
        : status.kind === "done" && !stale
          ? CircleCheck
          : stale
            ? Clock
            : null;

  return (
    <div className="nodal-runbar">
      <label className="nodal-runbar-analysis">
        <span>Analysis</span>
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
      </label>
      {running ? (
        <button
          type="button"
          onClick={() => {
            sim.getState().cancel();
          }}
        >
          <Square aria-hidden="true" className="nodal-icon" />
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
          <Play aria-hidden="true" className="nodal-icon" />
          Run
        </button>
      )}
      {running ? (
        <progress
          aria-label="Simulation progress"
          max={1}
          className="nodal-num"
          value={status.progress}
        />
      ) : null}
      <span
        role="status"
        className="nodal-runbar-status nodal-num"
        data-failed={status.kind === "failed"}
      >
        {StatusIcon ? <StatusIcon aria-hidden="true" className="nodal-icon" /> : null}
        {text}
      </span>
    </div>
  );
}
