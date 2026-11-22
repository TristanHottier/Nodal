// Analysis setup: one card per analysis plus the solver options.
import type { Analysis } from "@nodal/schema";
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

export function AnalysisEditor() {
  const store = useEditorStore();
  const simulation = useEditor((s) => s.project.simulation);
  const doc = useEditor((s) => s.doc);
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
      <h3>Analyses</h3>
      {analyses.map((a, i) => (
        // Analyses have no ids; the index is their identity.
        <fieldset key={i} className="nodal-model" aria-label={`Analysis ${String(i + 1)}`}>
          <SelectField
            label="Analysis type"
            value={a.type}
            options={ANALYSIS_TYPES}
            onChange={(v) => {
              const type = ANALYSIS_TYPES.find((t) => t.value === v)?.value;
              if (type && type !== a.type) replace(i, defaultAnalysis(type, store.getState().doc));
            }}
          />
          <AnalysisFields
            key={`${String(i)}:${a.type}`}
            analysis={a}
            sources={sources}
            onChange={(next) => {
              replace(i, next);
            }}
          />
          <button
            type="button"
            aria-label={`Remove analysis ${String(i + 1)} (${analysisLabel(a)})`}
            disabled={analyses.length <= 1}
            onClick={() => {
              update({ analyses: analyses.filter((_, j) => j !== i) });
            }}
          >
            Remove
          </button>
        </fieldset>
      ))}
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
      <h3>Options</h3>
      <OptionsFields
        options={options}
        onChange={(next) => {
          update({ options: next });
        }}
      />
    </section>
  );
}
