// The project's model library: one card per model with name, type and optional parameters.
import {
  describeRange,
  inRange,
  MODEL_KINDS,
  type ModelKind,
  modelNameRegex,
  PARAM_SPECS,
  type ParamSpec,
  type ProjectModel,
} from "@nodal/schema";
import { parseValue } from "../../netlist/value";
import { useEditor, useEditorStore } from "../EditorContext";
import { addModel, removeModel, renameModel, setModelParam, setModelType } from "../model/models";
import { Field, SelectField } from "./Field";

const NAME_RULE = "Must start with a letter and use letters, digits and _";

function placeholder(spec: ParamSpec): string {
  if (Number.isNaN(spec.default)) return "1/gmin";
  if (spec.default === Infinity) return "no limit";
  return String(spec.default);
}

function paramError(spec: ParamSpec, text: string): string | null {
  if (text.trim() === "") return null;
  const r = parseValue(text);
  if (!r.ok) return r.error;
  return inRange(spec.range, r.value) ? null : `Must be ${describeRange(spec.range)}`;
}

function ModelCard({ model }: { model: ProjectModel }) {
  const store = useEditorStore();
  const apply = (next: ProjectModel[]) => {
    store.getState().setModels(next);
  };
  const models = () => store.getState().project.models;
  return (
    <fieldset className="nodal-model" aria-label={`Model ${model.name}`}>
      <Field
        key={`${model.name}:name`}
        label="Name"
        value={model.name}
        validate={(t) => (t.trim() !== "" && !modelNameRegex.test(t.trim()) ? NAME_RULE : null)}
        onCommit={(t) => {
          const name = t.trim();
          if (name === "") return "Name cannot be empty";
          if (!modelNameRegex.test(name)) return NAME_RULE;
          const cur = models();
          const next = renameModel(cur, model.name, name);
          if (next === cur) return name === model.name ? undefined : "Name already used";
          apply(next);
          return undefined;
        }}
      />
      <SelectField
        label="Type"
        value={model.type}
        options={MODEL_KINDS.map((k) => ({ value: k, text: k }))}
        onChange={(v) => {
          const type = MODEL_KINDS.find((k) => k === v);
          if (type) apply(setModelType(models(), model.name, type));
        }}
      />
      {PARAM_SPECS[model.type].map((spec) => (
        <Field
          key={`${model.name}:${model.type}:${spec.key}`}
          label={spec.key}
          numeric
          value={model.params[spec.key] ?? ""}
          placeholder={placeholder(spec)}
          hint={describeRange(spec.range)}
          validate={(t) => paramError(spec, t)}
          onCommit={(t) => {
            apply(setModelParam(models(), model.name, spec.key, t));
            return undefined;
          }}
        />
      ))}
      <button
        type="button"
        aria-label={`Remove ${model.name}`}
        onClick={() => {
          apply(removeModel(models(), model.name));
        }}
      >
        Remove
      </button>
    </fieldset>
  );
}

export function ModelEditor() {
  const store = useEditorStore();
  const models = useEditor((s) => s.project.models);
  const add = (v: string) => {
    const type: ModelKind | undefined = MODEL_KINDS.find((k) => k === v);
    if (!type) return;
    const s = store.getState();
    s.setModels(addModel(s.project.models, type).models);
  };
  return (
    <section>
      <SelectField
        label="Add model"
        value=""
        options={[
          { value: "", text: "Add model…" },
          ...MODEL_KINDS.map((k) => ({ value: k, text: k })),
        ]}
        onChange={add}
      />
      {models.map((m) => (
        <ModelCard key={m.name} model={m} />
      ))}
    </section>
  );
}
