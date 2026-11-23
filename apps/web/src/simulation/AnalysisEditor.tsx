// Analysis setup: one card per analysis plus the solver options.
import type { Analysis } from "@nodal/schema";
import { Trash2 } from "lucide-react";
import { SelectField } from "../editor/inspector/Field";
import { useEditor, useEditorStore } from "../editor/EditorContext";
import {
  ANALYSIS_TYPES,
  AnalysisFields,
  analysisLabel,
  defaultAnalysis,
  sourceNames,
} from "./AnalysisFields";
import { OptionsFields } from "./OptionsFields";
import { useRunIndex } from "./SimulationContext";

export function AnalysisEditor() {
  const store = useEditorStore();
  const simulation = useEditor((s) => s.project.simulation);
  const doc = useEditor((s) => s.doc);
  const runIndex = useRunIndex();
  const sources = sourceNames(doc);
  const { analyses, options } = simulation;

  const update = (next: Partial<typeof simulation>) => {
    const s = store.getState();
    s.setSimulation({ ...s.project.simulation, ...next });
  };
  const replace = (i: number, next: Analysis) => {
    update({
      analyses: store.getState().project.simulation.analyses.map((a, j) => (j === i ? next : a)),
    });
  };

  return (
    <section>
      <h2>Analyses</h2>
      {analyses.map((a, i) => {
        // The card the run bar will run; only marked when there is a choice.
        const runs = analyses.length > 1 && i === Math.min(runIndex, analyses.length - 1);
        // Analyses have no ids; the index is their identity.
        return (
          <fieldset
            key={i}
            className="nodal-model nodal-rows nodal-analysis"
            aria-label={`Analysis ${String(i + 1)}`}
            data-active={runs}
          >
            <div className="nodal-analysis-head">
              <span className="nodal-analysis-index nodal-num" aria-hidden="true">
                {i + 1}
              </span>
              <SelectField
                label="Analysis type"
                value={a.type}
                options={ANALYSIS_TYPES}
                onChange={(v) => {
                  const type = ANALYSIS_TYPES.find((t) => t.value === v)?.value;
                  if (type && type !== a.type)
                    replace(i, defaultAnalysis(type, store.getState().doc));
                }}
              />
              <button
                type="button"
                className="nodal-analysis-remove"
                title="Remove analysis"
                aria-label={`Remove analysis ${String(i + 1)} (${analysisLabel(a)})`}
                disabled={analyses.length <= 1}
                onClick={() => {
                  update({ analyses: analyses.filter((_, j) => j !== i) });
                }}
              >
                <Trash2 aria-hidden="true" className="nodal-icon" />
              </button>
            </div>
            <AnalysisFields
              key={`${String(i)}:${a.type}`}
              analysis={a}
              sources={sources}
              onChange={(next) => {
                replace(i, next);
              }}
            />
            {runs ? <small className="nodal-analysis-runs">Runs when you press Run</small> : null}
          </fieldset>
        );
      })}
      <button
        type="button"
        onClick={() => {
          update({
            analyses: [...analyses, defaultAnalysis("op", store.getState().doc)],
          });
        }}
      >
        Add analysis
      </button>
      <details className="nodal-models">
        <summary>Options</summary>
        <OptionsFields
          options={options}
          onChange={(next) => {
            update({ options: next });
          }}
        />
      </details>
    </section>
  );
}
