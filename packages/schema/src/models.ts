// Device model parameter tables. Mirrors crates/nodal-engine/src/ir/models.rs,
// which is the reference. The test in ir.test.ts compares encodeParamSpecs()
// with fixtures/param-specs.json, and the Rust test `models::tests::spec_matches_ts`
// compares the same file with `param_spec`, so the two tables cannot drift.

export const MODEL_KINDS = ["D", "NPN", "PNP", "NMOS", "PMOS", "SW"] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

/** The values a parameter may take. `unitInterval` is [0, 1). */
export type ParamRange = "any" | "positive" | "nonNegative" | "unitInterval";

export interface ParamSpec {
  readonly key: string;
  /** `Infinity` means "no limit" (VAF); `NaN` means 1/gmin (ROFF), resolved when the circuit is built. */
  readonly default: number;
  readonly range: ParamRange;
}

const p = (key: string, def: number, range: ParamRange): ParamSpec => ({
  key,
  default: def,
  range,
});

const DIODE: readonly ParamSpec[] = [
  p("IS", 1e-14, "positive"),
  p("N", 1, "positive"),
  p("RS", 0, "nonNegative"),
  p("CJO", 0, "nonNegative"),
  p("VJ", 1, "positive"),
  p("M", 0.5, "unitInterval"),
  p("FC", 0.5, "unitInterval"),
  p("TT", 0, "nonNegative"),
];

const BJT: readonly ParamSpec[] = [
  p("IS", 1e-16, "positive"),
  p("BF", 100, "positive"),
  p("BR", 1, "positive"),
  p("NF", 1, "positive"),
  p("NR", 1, "positive"),
  p("VAF", Infinity, "positive"),
  p("CJE", 0, "nonNegative"),
  p("VJE", 0.75, "positive"),
  p("MJE", 0.33, "unitInterval"),
  p("CJC", 0, "nonNegative"),
  p("VJC", 0.75, "positive"),
  p("MJC", 0.33, "unitInterval"),
  p("TF", 0, "nonNegative"),
  p("TR", 0, "nonNegative"),
  p("FC", 0.5, "unitInterval"),
];

const MOSFET: readonly ParamSpec[] = [
  p("VTO", 0, "any"),
  p("KP", 2e-5, "positive"),
  p("GAMMA", 0, "nonNegative"),
  p("PHI", 0.6, "positive"),
  p("LAMBDA", 0, "nonNegative"),
  p("CGSO", 0, "nonNegative"),
  p("CGDO", 0, "nonNegative"),
  p("CGBO", 0, "nonNegative"),
];

const SWITCH: readonly ParamSpec[] = [
  p("VT", 0, "any"),
  p("VH", 0, "nonNegative"),
  p("RON", 1, "positive"),
  p("ROFF", NaN, "positive"),
];

export const PARAM_SPECS: Record<ModelKind, readonly ParamSpec[]> = {
  D: DIODE,
  NPN: BJT,
  PNP: BJT,
  NMOS: MOSFET,
  PMOS: MOSFET,
  SW: SWITCH,
};

/** Check `value` against a range. Callers have already ruled out non-finite numbers. */
export function inRange(range: ParamRange, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  switch (range) {
    case "any":
      return true;
    case "positive":
      return value > 0;
    case "nonNegative":
      return value >= 0;
    case "unitInterval":
      return value >= 0 && value < 1;
  }
}

export function describeRange(range: ParamRange): string {
  switch (range) {
    case "any":
      return "finite";
    case "positive":
      return "finite and > 0";
    case "nonNegative":
      return "finite and >= 0";
    case "unitInterval":
      return "in [0, 1)";
  }
}

/** One entry of fixtures/param-specs.json. */
export interface EncodedParamSpec {
  key: string;
  /** The default, or `null` when it is not a finite number (see `defaultKind`). */
  default: number | null;
  /** Present only when `default` is `null`: `"inf"` for Infinity, `"1/gmin"` for NaN. */
  defaultKind?: "inf" | "1/gmin";
  range: ParamRange;
}

/**
 * The JSON form of the table, one array per model type. Defaults that are not
 * finite JSON numbers are encoded as `null` plus `defaultKind`: `"inf"` for
 * Infinity (VAF, no Early effect) and `"1/gmin"` for NaN (ROFF).
 */
export function encodeParamSpecs(): Record<ModelKind, EncodedParamSpec[]> {
  const encode = (s: ParamSpec): EncodedParamSpec => {
    if (Number.isNaN(s.default)) {
      return { key: s.key, default: null, defaultKind: "1/gmin", range: s.range };
    }
    if (!Number.isFinite(s.default)) {
      return { key: s.key, default: null, defaultKind: "inf", range: s.range };
    }
    return { key: s.key, default: s.default, range: s.range };
  };
  const out = {} as Record<ModelKind, EncodedParamSpec[]>;
  for (const kind of MODEL_KINDS) out[kind] = PARAM_SPECS[kind].map(encode);
  return out;
}
