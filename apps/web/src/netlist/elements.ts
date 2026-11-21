// Part to IR element: field parsing and reference checks.
import type { ModelKind, Part, ProjectModel } from "@nodal/schema";
import { elementNameRegex } from "@nodal/schema";
import { PARAM_FIELDS, paramValue } from "../editor/params";
import { SYMBOLS } from "../symbols/catalog";
import type { Diagnostic, DiagnosticCode } from "./diagnostics";
import { parsePwl, parseValue } from "./value";

export interface ElementContext {
  netOfPin: ReadonlyMap<string, string>;
  models: readonly ProjectModel[];
  parts: readonly Part[];
  report: (d: Diagnostic) => void;
}

type Fields = {
  num: Map<string, number>;
  text: Map<string, string>;
  pwl: [number, number][];
};

/** An element as handed to `parseNetlist`, which applies the IR defaults. */
export interface RawElement {
  kind: string;
  name: string;
  nodes: string[];
  [key: string]: unknown;
}

/** Parse every field of the part that applies; returns null when a field is bad. */
function readFields(part: Part, ctx: ElementContext): Fields | null {
  const fields: Fields = { num: new Map(), text: new Map(), pwl: [] };
  const state = { ok: true };
  const fail = (code: DiagnosticCode, key: string, message: string): void => {
    state.ok = false;
    ctx.report({
      severity: "error",
      code,
      message: `${part.name} ${key}: ${message}`,
      itemIds: [part.id],
    });
  };
  for (const f of PARAM_FIELDS[part.type]) {
    if (f.when && paramValue(part, f.when.key) !== f.when.equals) continue;
    const raw = paramValue(part, f.key);
    const empty = raw.trim() === "";
    if (f.kind === "number" || f.kind === "optionalNumber") {
      if (empty) {
        if (f.kind === "number") fail("missing-value", f.key, "required");
        continue;
      }
      const r = parseValue(raw);
      if (r.ok) fields.num.set(f.key, r.value);
      else fail("invalid-value", f.key, r.error);
    } else if (f.kind === "pwl") {
      if (empty) {
        fail("missing-value", f.key, "required");
        continue;
      }
      const r = parsePwl(raw);
      if (!r.ok) fail("invalid-value", f.key, r.error);
      else fields.pwl = r.points;
    } else {
      fields.text.set(f.key, raw);
    }
  }
  return state.ok ? fields : null;
}

function waveform(fields: Fields): Record<string, unknown> | undefined {
  const n = (k: string): number => fields.num.get(k) ?? 0;
  const opt = (k: string): Record<string, number> => {
    const v = fields.num.get(k);
    return v === undefined ? {} : { [k]: v };
  };
  switch (fields.text.get("wave")) {
    case "pulse":
      return {
        type: "pulse",
        v1: n("v1"),
        v2: n("v2"),
        ...opt("td"),
        tr: n("tr"),
        tf: n("tf"),
        pw: n("pw"),
        per: n("per"),
      };
    case "sin":
      return {
        type: "sin",
        vo: n("vo"),
        va: n("va"),
        freq: n("freq"),
        ...opt("td"),
        ...opt("theta"),
        ...opt("phase"),
      };
    case "pwl":
      return { type: "pwl", points: fields.pwl };
    default:
      return undefined;
  }
}

/** The IR name for a part: the part name, with an `E` in front for the op-amp. */
export function irName(part: Part): string {
  return part.type === "opamp" ? `E${part.name}` : part.name;
}

function checkName(part: Part, kind: string, ctx: ElementContext): boolean {
  const name = irName(part);
  if (elementNameRegex.test(name) && name.startsWith(kind)) return true;
  ctx.report({
    severity: "error",
    code: "bad-name",
    message: `part name "${part.name}" must start with ${kind} and use only letters, digits and underscore`,
    itemIds: [part.id],
  });
  return false;
}

/** Returns the model name, or null after reporting. */
function resolveModel(part: Part, fields: Fields, ctx: ElementContext): string | null {
  const name = fields.text.get("model") ?? "";
  const report = (code: DiagnosticCode, message: string): null => {
    ctx.report({ severity: "error", code, message, itemIds: [part.id] });
    return null;
  };
  if (name === "") return report("missing-model", `${part.name} has no model`);
  const model = ctx.models.find((m) => m.name === name);
  if (!model) return report("missing-model", `${part.name} model ${name} not found`);
  const allowed: readonly ModelKind[] =
    PARAM_FIELDS[part.type].find((f) => f.kind === "modelRef")?.modelTypes ?? [];
  if (!allowed.includes(model.type)) {
    return report(
      "model-type-mismatch",
      `${part.name} model ${name} is ${model.type}, expected ${allowed.join(" or ")}`,
    );
  }
  return name;
}

/** Returns the controlling source name, or null after reporting. */
function resolveSource(part: Part, fields: Fields, ctx: ElementContext): string | null {
  const name = fields.text.get("controlSource") ?? "";
  const sources = ctx.parts.filter((p) => p.type === "vsource");
  if (sources.some((p) => p.name === name)) return name;
  const near = sources.find((p) => name !== "" && p.name.toLowerCase() === name.toLowerCase());
  ctx.report({
    severity: "error",
    code: "unknown-control-source",
    message:
      name === ""
        ? `${part.name} has no controlling source`
        : `${part.name} controlling source ${name} is not a voltage source in this schematic`,
    itemIds: near ? [part.id, near.id] : [part.id],
  });
  return null;
}

/** Build the IR element for a part, or null after reporting diagnostics. Ground yields null silently. */
export function partToElement(part: Part, ctx: ElementContext): RawElement | null {
  if (part.type === "ground") return null;
  const kind = part.type === "opamp" ? "E" : SYMBOLS[part.type].prefix;
  const nameOk = checkName(part, kind, ctx);
  const fields = readFields(part, ctx);
  const pin = (n: string): string => ctx.netOfPin.get(`${part.id}:${n}`) ?? "0";
  const name = irName(part);
  if (!fields || !nameOk) return null;
  const num = (k: string): number => fields.num.get(k) ?? 0;
  const pair = (a: string, b: string): [string, string] => [pin(a), pin(b)];

  switch (part.type) {
    case "resistor":
      return { kind: "R", name, nodes: pair("1", "2"), value: num("value") };
    case "capacitor":
    case "inductor": {
      const ic = fields.num.get("ic");
      return {
        kind: part.type === "capacitor" ? "C" : "L",
        name,
        nodes: pair("1", "2"),
        value: num("value"),
        ...(ic === undefined ? {} : { ic }),
      };
    }
    case "vsource":
    case "isource": {
      const mag = fields.num.get("acMag");
      const tran = waveform(fields);
      return {
        kind: part.type === "vsource" ? "V" : "I",
        name,
        nodes: pair("p", "n"),
        dc: num("dc"),
        ...(mag === undefined ? {} : { ac: { mag, phase: fields.num.get("acPhase") ?? 0 } }),
        ...(tran ? { tran } : {}),
      };
    }
    case "vcvs":
    case "vccs":
      return {
        kind: part.type === "vcvs" ? "E" : "G",
        name,
        nodes: pair("p", "n"),
        controlNodes: pair("cp", "cn"),
        gain: num("gain"),
      };
    case "opamp":
      return {
        kind: "E",
        name,
        nodes: [pin("out"), "0"],
        controlNodes: pair("inp", "inn"),
        gain: num("gain"),
      };
    case "ccvs":
    case "cccs": {
      const controlSource = resolveSource(part, fields, ctx);
      if (controlSource === null) return null;
      return {
        kind: part.type === "ccvs" ? "H" : "F",
        name,
        nodes: pair("p", "n"),
        controlSource,
        gain: num("gain"),
      };
    }
    default:
      break;
  }

  const model = resolveModel(part, fields, ctx);
  if (model === null) return null;
  switch (part.type) {
    case "diode":
      return { kind: "D", name, nodes: pair("a", "k"), model };
    case "npn":
    case "pnp":
      return { kind: "Q", name, nodes: [pin("c"), pin("b"), pin("e")], model };
    case "nmos":
    case "pmos": {
      const w = fields.num.get("w");
      const l = fields.num.get("l");
      return {
        kind: "M",
        name,
        nodes: [pin("d"), pin("g"), pin("s"), pin("b")],
        model,
        ...(w === undefined ? {} : { w }),
        ...(l === undefined ? {} : { l }),
      };
    }
    case "switch":
      return { kind: "S", name, nodes: pair("p", "n"), controlNodes: pair("cp", "cn"), model };
    default:
      return null;
  }
}
