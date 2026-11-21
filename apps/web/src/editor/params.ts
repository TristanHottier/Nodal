// Per-part-type parameter fields shown in the inspector and read by the netlister.
// Keys are flat; a missing key reads as the symbol default.
import type { ModelKind, Part, PartType } from "@nodal/schema";
import { SYMBOLS } from "../symbols/catalog";

export type FieldKind = "number" | "optionalNumber" | "pwl" | "modelRef" | "sourceRef" | "choice";

export interface ParamField {
  key: string;
  label: string;
  kind: FieldKind;
  unit?: string;
  modelTypes?: readonly ModelKind[];
  choices?: readonly string[];
  when?: { key: string; equals: string };
}

const pulse = { key: "wave", equals: "pulse" } as const;
const sin = { key: "wave", equals: "sin" } as const;
const pwl = { key: "wave", equals: "pwl" } as const;

function source(unit: string): readonly ParamField[] {
  return [
    { key: "dc", label: "DC value", kind: "number", unit },
    { key: "acMag", label: "AC magnitude", kind: "optionalNumber", unit },
    { key: "acPhase", label: "AC phase", kind: "optionalNumber", unit: "°" },
    { key: "wave", label: "Waveform", kind: "choice", choices: ["none", "pulse", "sin", "pwl"] },
    { key: "v1", label: "Initial value", kind: "number", unit, when: pulse },
    { key: "v2", label: "Pulsed value", kind: "number", unit, when: pulse },
    { key: "td", label: "Delay", kind: "optionalNumber", unit: "s", when: pulse },
    { key: "tr", label: "Rise time", kind: "number", unit: "s", when: pulse },
    { key: "tf", label: "Fall time", kind: "number", unit: "s", when: pulse },
    { key: "pw", label: "Pulse width", kind: "number", unit: "s", when: pulse },
    { key: "per", label: "Period", kind: "number", unit: "s", when: pulse },
    { key: "vo", label: "Offset", kind: "number", unit, when: sin },
    { key: "va", label: "Amplitude", kind: "number", unit, when: sin },
    { key: "freq", label: "Frequency", kind: "number", unit: "Hz", when: sin },
    { key: "td", label: "Delay", kind: "optionalNumber", unit: "s", when: sin },
    { key: "theta", label: "Damping", kind: "optionalNumber", unit: "1/s", when: sin },
    { key: "phase", label: "Phase", kind: "optionalNumber", unit: "°", when: sin },
    { key: "pwl", label: "PWL points", kind: "pwl", when: pwl },
  ];
}

const gain: ParamField = { key: "gain", label: "Gain", kind: "number" };
const control: ParamField = {
  key: "controlSource",
  label: "Controlling source",
  kind: "sourceRef",
};

function model(kind: ModelKind): ParamField {
  return { key: "model", label: "Model", kind: "modelRef", modelTypes: [kind] };
}

const mosDims: readonly ParamField[] = [
  { key: "w", label: "Width", kind: "optionalNumber", unit: "m" },
  { key: "l", label: "Length", kind: "optionalNumber", unit: "m" },
];

const reactive = (unit: string, icUnit: string): readonly ParamField[] => [
  { key: "value", label: "Value", kind: "number", unit },
  { key: "ic", label: "Initial condition", kind: "optionalNumber", unit: icUnit },
];

export const PARAM_FIELDS: Record<PartType, readonly ParamField[]> = {
  resistor: [{ key: "value", label: "Value", kind: "number", unit: "Ω" }],
  capacitor: reactive("F", "V"),
  inductor: reactive("H", "A"),
  vsource: source("V"),
  isource: source("A"),
  vcvs: [gain],
  vccs: [gain],
  opamp: [gain],
  ccvs: [gain, control],
  cccs: [gain, control],
  diode: [model("D")],
  npn: [model("NPN")],
  pnp: [model("PNP")],
  switch: [model("SW")],
  nmos: [model("NMOS"), ...mosDims],
  pmos: [model("PMOS"), ...mosDims],
  ground: [],
};

/** Stored value (even ""), else the symbol default, else "none" for `wave`, else "". */
export function paramValue(part: Part, key: string): string {
  const stored = part.params[key];
  if (stored !== undefined) return stored;
  const def = SYMBOLS[part.type].defaultParams[key];
  if (def !== undefined) return def;
  return key === "wave" ? "none" : "";
}
