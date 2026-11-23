import { elementNameRegex, type ModelKind, type Part } from "@nodal/schema";
import { parsePwl, parseValue } from "../../netlist/value";
import { SYMBOLS } from "../../symbols/catalog";
import { useEditor, useEditorStore } from "../EditorContext";
import { addModel } from "../model/models";
import { setPartName, setPartParam } from "../model/properties";
import { PARAM_FIELDS, type ParamField, paramValue } from "../params";
import { Field, SelectField } from "./Field";

const NEW_MODEL = "__new__";
const NONE = { value: "", text: "(none)" };

/** The IR element name of an op-amp is "E" + name, so any identifier text works. */
export function nameError(part: Pick<Part, "type">, name: string): string | null {
  const text = name.trim();
  if (text === "") return null;
  if (part.type === "opamp") {
    return /^[A-Za-z0-9_]+$/.test(text) ? null : "Use letters, digits and _";
  }
  const letter = SYMBOLS[part.type].prefix.charAt(0);
  return elementNameRegex.test(text) && text.startsWith(letter)
    ? null
    : `Must start with ${letter} and use letters, digits and _`;
}

const defaultOf = (part: Part, field: ParamField): string =>
  SYMBOLS[part.type].defaultParams[field.key] ?? "";

/** Fields the IR requires to be finite and > 0 (rules V7 and the MOS dimensions). */
const POSITIVE: Partial<Record<Part["type"], readonly string[]>> = {
  resistor: ["value"],
  capacitor: ["value"],
  inductor: ["value"],
  nmos: ["w", "l"],
  pmos: ["w", "l"],
};

function numberError(part: Part, field: ParamField, text: string): string | null {
  if (field.kind === "pwl") {
    const r = parsePwl(text);
    return r.ok ? null : r.error;
  }
  if (text.trim() === "") {
    return field.kind === "number" && defaultOf(part, field) === "" ? "Required" : null;
  }
  const r = parseValue(text);
  if (!r.ok) return r.error;
  return POSITIVE[part.type]?.includes(field.key) && !(r.value > 0) ? "Must be > 0" : null;
}

/** Options for a ref select, keeping a dangling stored value visible. */
function withCurrent(
  names: readonly string[],
  current: string,
  extra: boolean,
  all: readonly string[] = names,
) {
  const options = [NONE, ...names.map((n) => ({ value: n, text: n }))];
  if (current !== "" && !names.includes(current)) {
    options.push({
      value: current,
      text: `${current} (${all.includes(current) ? "wrong type" : "missing"})`,
    });
  }
  return extra ? [...options, { value: NEW_MODEL, text: "New model…" }] : options;
}

export function PartFields({ part }: { part: Part }) {
  const store = useEditorStore();
  const models = useEditor((s) => s.project.models);
  const parts = useEditor((s) => s.doc.parts);

  const setParam = (key: string, value: string) => {
    const s = store.getState();
    s.commit(setPartParam(s.doc, part.id, key, value));
  };

  const newModel = (types: readonly ModelKind[] | undefined) => {
    const type = types?.[0];
    if (!type) return;
    const s = store.getState();
    const added = addModel(s.project.models, type);
    s.setModels(added.models);
    s.commit(setPartParam(s.doc, part.id, "model", added.name));
  };

  const visible = PARAM_FIELDS[part.type].filter(
    (f) => !f.when || paramValue(part, f.when.key) === f.when.equals,
  );

  return (
    <>
      {part.type === "ground" ? null : (
        <Field
          key={`${part.id}:name`}
          label="Name"
          value={part.name}
          validate={(t) => nameError(part, t)}
          onCommit={(t) => {
            if (t.trim() === "") return "Name cannot be empty";
            const s = store.getState();
            s.commit(setPartName(s.doc, part.id, t));
            return undefined;
          }}
        />
      )}
      {visible.map((f) => {
        const value = paramValue(part, f.key);
        const k = `${part.id}:${f.key}`;
        if (f.kind === "choice") {
          const options = (f.choices ?? []).map((c) => ({ value: c, text: c }));
          return (
            <SelectField
              key={k}
              label={f.label}
              value={value}
              options={options}
              onChange={(v) => {
                setParam(f.key, v);
              }}
            />
          );
        }
        if (f.kind === "modelRef") {
          const names = models.filter((m) => f.modelTypes?.includes(m.type)).map((m) => m.name);
          return (
            <SelectField
              key={k}
              label={f.label}
              value={value}
              options={withCurrent(
                names,
                value,
                true,
                models.map((m) => m.name),
              )}
              onChange={(v) => {
                if (v === NEW_MODEL) newModel(f.modelTypes);
                else setParam(f.key, v);
              }}
            />
          );
        }
        if (f.kind === "sourceRef") {
          const names = parts.filter((p) => p.type === "vsource").map((p) => p.name);
          return (
            <SelectField
              key={k}
              label={f.label}
              value={value}
              options={withCurrent(names, value, false)}
              onChange={(v) => {
                setParam(f.key, v);
              }}
            />
          );
        }
        return (
          <Field
            key={k}
            label={f.label}
            value={value}
            multiline={f.kind === "pwl"}
            numeric={f.kind !== "pwl"}
            {...(f.unit ? { unit: f.unit } : {})}
            validate={(t) => numberError(part, f, t)}
            {...(f.kind === "number" && defaultOf(part, f) !== ""
              ? { emptyHint: `Empty uses the default (${defaultOf(part, f)})` }
              : {})}
            onCommit={(t) => {
              setParam(f.key, t);
              return undefined;
            }}
          />
        );
      })}
    </>
  );
}
