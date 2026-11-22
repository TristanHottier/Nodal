// Top of the results panel: analysis choice, Run and Cancel, progress and status.
import { useState } from "react";
import { useEditor, useEditorStore } from "../editor/EditorContext";
import { analysisLabel } from "./AnalysisFields";
import { useResultsStale, useSimulation, useSimulationStore } from "./SimulationContext";

export const RUNBAR_CSS = `
.nodal-results { grid-row: 2; grid-column: 1 / span 3; border-top: 1px solid #e5e7eb; background: #fff; }
.nodal-runbar { display: flex; align-items: center; gap: 8px; padding: 4px 10px; font-size: 13px; }
.nodal-runbar select, .nodal-runbar button { font: inherit; }
.nodal-runbar progress { width: 120px; }
.nodal-runbar [data-failed="true"] { color: #dc2626; }
`;

export function RunBar() {
  const editor = useEditorStore();
  const sim = useSimulationStore();
  const analyses = useEditor((s) => s.project.simulation.analyses);
  const status = useSimulation((s) => s.status);
  const stale = useResultsStale();
  const [chosen, setChosen] = useState(0);
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
          setChosen(Number(e.target.value));
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
        value={status.kind === "running" ? status.progress : status.kind === "done" ? 1 : 0}
      />
      <span role="status" data-failed={status.kind === "failed"}>
        {text}
      </span>
    </div>
  );
}
