// Parameter tables for the codex, built from the same sources the engine and the
// inspector use, so a changed default or a new parameter cannot leave the docs stale.
import { PARAM_SPECS, type ModelKind, type ParamSpec, type PartType } from "@nodal/schema";
import { PARAM_FIELDS, type ParamField } from "../editor/params";
import { formatValue } from "../netlist/value";
import { SYMBOLS } from "../symbols/catalog";
import { FIELD_DOCS, MODEL_PARAM_DOCS, type ModelParamDoc } from "./paramDocs";

export interface FieldRow {
  key: string;
  label: string;
  unit: string;
  default: string;
  meaning: string;
  /** Present when the field only applies to one waveform, e.g. "Waveform = pulse". */
  when?: string;
}

export interface ModelRow {
  key: string;
  unit: string;
  default: string;
  meaning: string;
}

function formatDefault(value: number): string {
  if (Number.isNaN(value)) return "1/gmin";
  if (value === Infinity) return "∞";
  return formatValue(value);
}

/** One row per model parameter, in spec order. Throws when a parameter has no documentation. */
export function modelRows(
  kind: ModelKind,
  specs: Record<ModelKind, readonly ParamSpec[]> = PARAM_SPECS,
  docs: Record<ModelKind, Record<string, ModelParamDoc>> = MODEL_PARAM_DOCS,
): ModelRow[] {
  return specs[kind].map((spec) => {
    const doc = docs[kind][spec.key];
    if (doc === undefined) throw new Error(`undocumented parameter ${kind}.${spec.key}`);
    return {
      key: spec.key,
      unit: doc.unit,
      default: formatDefault(spec.default),
      meaning: doc.meaning,
    };
  });
}

/**
 * One row per inspector field, in field order (`td` of a source appears once, as the
 * pulse and sine delays share a key). Throws when a field has no documentation.
 */
export function fieldRows(
  type: PartType,
  fields: Record<PartType, readonly ParamField[]> = PARAM_FIELDS,
  docs: Record<PartType, Record<string, string>> = FIELD_DOCS,
): FieldRow[] {
  const conditions = new Map<string, string[]>();
  for (const field of fields[type]) {
    const list = conditions.get(field.key) ?? [];
    if (field.when !== undefined) list.push(field.when.equals);
    conditions.set(field.key, list);
  }
  const seen = new Set<string>();
  const rows: FieldRow[] = [];
  for (const field of fields[type]) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    const meaning = docs[type][field.key];
    if (meaning === undefined) throw new Error(`undocumented field ${type}.${field.key}`);
    const row: FieldRow = {
      key: field.key,
      label: field.label,
      unit: field.unit ?? "",
      default: SYMBOLS[type].defaultParams[field.key] ?? "",
      meaning,
    };
    const when = conditions.get(field.key) ?? [];
    if (when.length > 0) row.when = `Waveform = ${when.join(" or ")}`;
    rows.push(row);
  }
  return rows;
}
