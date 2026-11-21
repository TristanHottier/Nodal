// Pure edits on the project's model library. Unchanged input is returned as is
// (`===`). Renaming does not rewrite part references; the inspector reports them.
import { type ModelKind, PARAM_SPECS, type ProjectModel } from "@nodal/schema";
import { produce } from "immer";

const taken = (models: readonly ProjectModel[], name: string, except?: string): boolean =>
  models.some((m) => m.name !== except && m.name.toLowerCase() === name.toLowerCase());

export function addModel(
  models: ProjectModel[],
  type: ModelKind,
): { models: ProjectModel[]; name: string } {
  const base = `${type}MOD`;
  let name = base;
  for (let n = 2; taken(models, name); n++) name = `${base}${String(n)}`;
  return { models: [...models, { name, type, params: {} }], name };
}

export function renameModel(
  models: ProjectModel[],
  oldName: string,
  newName: string,
): ProjectModel[] {
  const name = newName.trim();
  const i = models.findIndex((m) => m.name === oldName);
  if (i < 0 || name === "" || name === oldName || taken(models, name, oldName)) return models;
  return produce(models, (d) => {
    const m = d[i];
    if (m) m.name = name;
  });
}

export function setModelType(
  models: ProjectModel[],
  name: string,
  type: ModelKind,
): ProjectModel[] {
  const i = models.findIndex((m) => m.name === name);
  const cur = models[i];
  if (!cur || cur.type === type) return models;
  const allowed = new Set(PARAM_SPECS[type].map((s) => s.key));
  return produce(models, (d) => {
    const m = d[i];
    if (!m) return;
    m.type = type;
    for (const key of Object.keys(m.params)) {
      if (!allowed.has(key)) Reflect.deleteProperty(m.params, key);
    }
  });
}

export function setModelParam(
  models: ProjectModel[],
  name: string,
  key: string,
  value: string,
): ProjectModel[] {
  const v = value.trim();
  const i = models.findIndex((m) => m.name === name);
  const cur = models[i];
  if (!cur) return models;
  const has = Object.prototype.hasOwnProperty.call(cur.params, key);
  if (v === "" ? !has : cur.params[key] === v) return models;
  return produce(models, (d) => {
    const m = d[i];
    if (!m) return;
    if (v === "") Reflect.deleteProperty(m.params, key);
    else m.params[key] = v;
  });
}

export function removeModel(models: ProjectModel[], name: string): ProjectModel[] {
  return models.some((m) => m.name === name) ? models.filter((m) => m.name !== name) : models;
}
