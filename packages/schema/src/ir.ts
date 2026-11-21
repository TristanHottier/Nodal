// Netlist IR (version 1). Mirrors crates/nodal-engine/src/ir; both validate
// the same fixtures in packages/schema/fixtures/ir. Rules V1 to V21 are
// listed in the engine's validate.rs and models.rs.
import { z } from "zod";
import type { AcSweep } from "./ac";
import { acFrequencyCount } from "./ac";
import { DEFAULT_RELTOL, IR_VERSION } from "./constants";
import type { ModelKind } from "./models";
import { MODEL_KINDS, PARAM_SPECS, describeRange, inRange } from "./models";

// Zod 4 already rejects Infinity and NaN; the refine keeps that explicit and gives one message.
const finite = z
  .number({ error: "must be a finite number" })
  .refine(Number.isFinite, { error: "must be a finite number" });

/** `null` counts as absent, as it does in the Rust engine. */
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v) => v ?? undefined);

const nodeName = z.string();
const nodePair = z.tuple([nodeName, nodeName]);
const nodeTriple = z.tuple([nodeName, nodeName, nodeName]);
const nodeQuad = z.tuple([nodeName, nodeName, nodeName, nodeName]);
const elementName = z.string();

/** Small-signal source value: magnitude and phase in degrees. */
const acSpec = z.strictObject({ mag: finite, phase: finite.default(0) });

/** Time-domain waveform of an independent source, used by the `tran` analysis. */
const waveform = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("pulse"),
    v1: z.number(),
    v2: z.number(),
    td: z.number().default(0),
    tr: z.number(),
    tf: z.number(),
    pw: z.number(),
    per: z.number(),
  }),
  z.strictObject({
    type: z.literal("sin"),
    vo: z.number(),
    va: z.number(),
    freq: z.number(),
    td: z.number().default(0),
    theta: z.number().default(0),
    phase: z.number().default(0),
  }),
  // `points` holds `[time, value]` pairs.
  z.strictObject({ type: z.literal("pwl"), points: z.array(z.tuple([z.number(), z.number()])) }),
]);

const integrationMethod = z.enum(["trap", "gear"]);

const element = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("R"), name: elementName, nodes: nodePair, value: finite }),
  z.strictObject({
    kind: z.literal("L"),
    name: elementName,
    nodes: nodePair,
    value: finite,
    ic: optional(finite),
  }),
  z.strictObject({
    kind: z.literal("C"),
    name: elementName,
    nodes: nodePair,
    value: finite,
    ic: optional(finite),
  }),
  z.strictObject({
    kind: z.literal("V"),
    name: elementName,
    nodes: nodePair,
    dc: finite.default(0),
    ac: optional(acSpec),
    tran: optional(waveform),
  }),
  z.strictObject({
    kind: z.literal("I"),
    name: elementName,
    nodes: nodePair,
    dc: finite.default(0),
    ac: optional(acSpec),
    tran: optional(waveform),
  }),
  z.strictObject({
    kind: z.literal("E"),
    name: elementName,
    nodes: nodePair,
    controlNodes: nodePair,
    gain: finite,
  }),
  z.strictObject({
    kind: z.literal("G"),
    name: elementName,
    nodes: nodePair,
    controlNodes: nodePair,
    gain: finite,
  }),
  z.strictObject({
    kind: z.literal("H"),
    name: elementName,
    nodes: nodePair,
    controlSource: z.string(),
    gain: finite,
  }),
  z.strictObject({
    kind: z.literal("F"),
    name: elementName,
    nodes: nodePair,
    controlSource: z.string(),
    gain: finite,
  }),
  z.strictObject({ kind: z.literal("D"), name: elementName, nodes: nodePair, model: z.string() }),
  z.strictObject({ kind: z.literal("Q"), name: elementName, nodes: nodeTriple, model: z.string() }),
  z.strictObject({
    kind: z.literal("M"),
    name: elementName,
    nodes: nodeQuad,
    model: z.string(),
    w: optional(finite),
    l: optional(finite),
  }),
  z.strictObject({
    kind: z.literal("S"),
    name: elementName,
    nodes: nodePair,
    controlNodes: nodePair,
    model: z.string(),
  }),
]);

const model = z.strictObject({
  name: z.string(),
  type: z.enum(MODEL_KINDS),
  params: z.record(z.string(), z.number()).default({}),
});

const analysis = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("op") }),
  z.strictObject({
    type: z.literal("dc"),
    source: z.string(),
    start: z.number(),
    stop: z.number(),
    step: z.number(),
  }),
  z.strictObject({
    type: z.literal("ac"),
    sweep: z.enum(["lin", "dec", "oct"]),
    points: z.number().int().min(0).max(4_294_967_295),
    fstart: z.number(),
    fstop: z.number(),
  }),
  z.strictObject({
    type: z.literal("tran"),
    tstep: z.number(),
    tstop: z.number(),
    tstart: z.number().default(0),
    tmax: optional(z.number()),
    uic: z.boolean().default(false),
  }),
]);

/** Largest allowed number of points in a DC or AC sweep. */
const MAX_SWEEP_POINTS = 1_000_000;

const options = z.strictObject({
  temp: optional(finite),
  reltol: optional(finite),
  vntol: optional(finite),
  abstol: optional(finite),
  chgtol: optional(finite),
  gmin: optional(finite),
  method: optional(integrationMethod),
  trtol: optional(finite),
});

const ELEMENT_NAME = /^[RLCVIEGHFDQMS][A-Za-z0-9_]*$/;
const MODEL_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const NODE_NAME = /^[A-Za-z0-9_]+$/;

/** First group of names equal ignoring ASCII case, sorted and joined; else undefined. */
function caseCollision(names: Iterable<string>): string | undefined {
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const key = n.replace(/[A-Z]/g, (c) => c.toLowerCase());
    const g = groups.get(key);
    if (g) g.push(n);
    else groups.set(key, [n]);
  }
  // Rust iterates its BTreeMap in key order; do the same.
  for (const key of [...groups.keys()].sort()) {
    const g = groups.get(key);
    if (g && g.length > 1) return [...g].sort().join(", ");
  }
  return undefined;
}

const netlistBase = z.strictObject({
  irVersion: z.number(),
  title: optional(z.string()),
  elements: z.array(element),
  models: z.array(model).default([]),
  nodeset: optional(z.record(z.string(), z.number())),
  analyses: z.array(analysis),
  options: optional(options),
});

type NetlistBase = z.output<typeof netlistBase>;

type Issue = { message: string; path: (string | number)[] };

/** V10 and V12: model names and parameters. */
function checkModels(models: NetlistModel[]): Issue | undefined {
  // V10
  for (const [i, m] of models.entries()) {
    if (!MODEL_NAME.test(m.name)) {
      return {
        message: `model name ${JSON.stringify(m.name)} must match ^[A-Za-z][A-Za-z0-9_]*$`,
        path: ["models", i],
      };
    }
  }
  const dup = caseCollision(models.map((m) => m.name));
  if (dup !== undefined) {
    return { message: `model names must be unique ignoring case: ${dup}`, path: ["models"] };
  }
  // V12
  for (const [i, m] of models.entries()) {
    const spec = PARAM_SPECS[m.type];
    // Rust walks a BTreeMap: keys in ascending order.
    for (const key of Object.keys(m.params).sort()) {
      const value = m.params[key] as number;
      const s = spec.find((x) => x.key === key);
      const path = ["models", i, "params", key];
      if (!s) {
        return {
          message: `unsupported parameter ${key} for model ${m.name} (${m.type})`,
          path,
        };
      }
      if (!inRange(s.range, value)) {
        return {
          message: `parameter ${key} of model ${m.name} must be ${describeRange(s.range)}, got ${String(value)}`,
          path,
        };
      }
    }
  }
  return undefined;
}

/** V13: the model exists and has the right type. */
function checkModelRef(
  models: NetlistModel[],
  e: Extract<NetlistElement, { model: string }>,
): string | undefined {
  const m = models.find((x) => x.name === e.model);
  if (!m) return `element ${e.name}: unknown model ${e.model}`;
  const allowed: Record<typeof e.kind, readonly ModelKind[]> = {
    D: ["D"],
    Q: ["NPN", "PNP"],
    M: ["NMOS", "PMOS"],
    S: ["SW"],
  };
  const expected = { D: "D", Q: "NPN or PNP", M: "NMOS or PMOS", S: "SW" }[e.kind];
  if (!allowed[e.kind].includes(m.type)) {
    return `element ${e.name}: model ${e.model} has type ${m.type}, expected ${expected}`;
  }
  return undefined;
}

/** Rust's f64::round: halves go away from zero. */
const roundHalfAway = (x: number): number => Math.sign(x) * Math.round(Math.abs(x));

/** V14: a dc sweep names an independent source and its step reaches stop. */
function checkDc(elements: NetlistElement[], a: DcAnalysis): string | undefined {
  const src = elements.find((x) => x.name === a.source);
  if (!src) return `analysis dc: unknown source ${a.source}`;
  if (src.kind !== "V" && src.kind !== "I") {
    return `analysis dc: source ${a.source} is not an independent source`;
  }
  const { start, stop, step } = a;
  if (!(Number.isFinite(start) && Number.isFinite(stop) && Number.isFinite(step))) {
    return "analysis dc: start, stop and step must be finite";
  }
  if (step === 0) return "analysis dc: step must not be zero";
  const k = (stop - start) / step;
  if (!Number.isFinite(k) || roundHalfAway(k) + 1 > MAX_SWEEP_POINTS) {
    return `analysis dc: sweep has more than ${String(MAX_SWEEP_POINTS)} points`;
  }
  if (k < 0 || Math.abs(k - roundHalfAway(k)) > 1e-9 * Math.max(Math.abs(k), 1)) {
    return `analysis dc: step ${String(step)} does not reach stop ${String(stop)} from start ${String(start)}`;
  }
  return undefined;
}

/** V17: an ac sweep has a valid range and at most MAX_SWEEP_POINTS frequencies. */
function checkAc(a: AcAnalysis, reltol: number): string | undefined {
  const { sweep, points, fstart, fstop } = a;
  if (!(Number.isFinite(fstart) && Number.isFinite(fstop))) {
    return "analysis ac: fstart and fstop must be finite";
  }
  if (points < 1) return "analysis ac: points must be at least 1";
  if (fstop < fstart) {
    return `analysis ac: fstop ${String(fstop)} is below fstart ${String(fstart)}`;
  }
  if (sweep === "lin") {
    if (fstart < 0) return `analysis ac: fstart must be >= 0 for lin, got ${String(fstart)}`;
    if (points === 1 && fstart !== fstop) {
      return "analysis ac: lin with one point needs fstart equal to fstop";
    }
  } else if (fstart <= 0) {
    return `analysis ac: fstart must be > 0 for ${sweep}, got ${String(fstart)}`;
  }
  if (acFrequencyCount(sweep, points, fstart, fstop, reltol, MAX_SWEEP_POINTS) === null) {
    return `analysis ac: sweep has more than ${String(MAX_SWEEP_POINTS)} points`;
  }
  return undefined;
}

/** V18: a source waveform has finite, in-range parameters. */
function checkWaveform(name: string, w: Waveform): string | undefined {
  const bad = (kind: string, key: string, v: number, ok: boolean, rel: string) =>
    Number.isFinite(v) && ok
      ? undefined
      : `element ${name}: ${kind} ${key} must be finite and ${rel}, got ${String(v)}`;
  if (w.type === "pulse") {
    return (
      bad("pulse", "v1", w.v1, true, "any") ??
      bad("pulse", "v2", w.v2, true, "any") ??
      bad("pulse", "td", w.td, w.td >= 0, ">= 0") ??
      bad("pulse", "tr", w.tr, w.tr > 0, "> 0") ??
      bad("pulse", "tf", w.tf, w.tf > 0, "> 0") ??
      bad("pulse", "pw", w.pw, w.pw >= 0, ">= 0") ??
      bad("pulse", "per", w.per, w.per > 0, "> 0")
    );
  }
  if (w.type === "sin") {
    return (
      bad("sin", "vo", w.vo, true, "any") ??
      bad("sin", "va", w.va, true, "any") ??
      bad("sin", "freq", w.freq, w.freq > 0, "> 0") ??
      bad("sin", "td", w.td, w.td >= 0, ">= 0") ??
      bad("sin", "theta", w.theta, w.theta >= 0, ">= 0") ??
      bad("sin", "phase", w.phase, true, "any")
    );
  }
  if (w.points.length === 0) return `element ${name}: pwl needs at least one point`;
  let last = Number.NEGATIVE_INFINITY;
  for (const [t, v] of w.points) {
    if (!(Number.isFinite(t) && Number.isFinite(v))) {
      return `element ${name}: pwl points must be finite`;
    }
    if (t < 0) return `element ${name}: pwl times must be >= 0, got ${String(t)}`;
    if (t <= last) return `element ${name}: pwl times must be strictly increasing`;
    last = t;
  }
  return undefined;
}

/** V20: a tran analysis has a positive step and a stop above the start. */
function checkTran(a: TranAnalysis): string | undefined {
  const { tstep, tstop, tstart, tmax } = a;
  if (!(Number.isFinite(tstep) && tstep > 0)) {
    return `analysis tran: tstep must be finite and > 0, got ${String(tstep)}`;
  }
  if (!(Number.isFinite(tstart) && tstart >= 0)) {
    return `analysis tran: tstart must be finite and >= 0, got ${String(tstart)}`;
  }
  if (!(Number.isFinite(tstop) && tstop > tstart)) {
    return `analysis tran: tstop ${String(tstop)} must be above tstart ${String(tstart)}`;
  }
  if (tmax !== undefined && !(Number.isFinite(tmax) && tmax > 0)) {
    return `analysis tran: tmax must be finite and > 0, got ${String(tmax)}`;
  }
  return undefined;
}

/** Cross-field rules. Stops at the first violated rule, like the Rust validator. */
function check(n: NetlistBase, ctx: z.RefinementCtx): boolean {
  const fail = (message: string, path: (string | number)[] = []): false => {
    ctx.addIssue({ code: "custom", message, path });
    return false;
  };
  // V1
  if (n.irVersion !== IR_VERSION) {
    return fail(`irVersion must be ${String(IR_VERSION)}, got ${String(n.irVersion)}`, [
      "irVersion",
    ]);
  }
  // V2
  if (n.elements.length === 0) return fail("elements must not be empty", ["elements"]);
  if (n.analyses.length === 0) return fail("analyses must not be empty", ["analyses"]);
  // V10 and V12
  const modelIssue = checkModels(n.models);
  if (modelIssue) return fail(modelIssue.message, modelIssue.path);

  const nodesOf = (e: (typeof n.elements)[number]): string[] =>
    e.kind === "E" || e.kind === "G" || e.kind === "S"
      ? [...e.nodes, ...e.controlNodes]
      : [...e.nodes];

  for (const [i, e] of n.elements.entries()) {
    const at = ["elements", i];
    // V3
    if (!ELEMENT_NAME.test(e.name)) {
      return fail(
        `element name ${JSON.stringify(e.name)} must match ^[RLCVIEGHFDQMS][A-Za-z0-9_]*$`,
        at,
      );
    }
    if (!e.name.startsWith(e.kind)) {
      return fail(`element name ${e.name} must start with its kind letter ${e.kind}`, at);
    }
    // V4
    for (const node of nodesOf(e)) {
      if (!NODE_NAME.test(node)) {
        return fail(
          `element ${e.name}: node ${JSON.stringify(node)} must match ^[A-Za-z0-9_]+$`,
          at,
        );
      }
      if (node.toLowerCase() === "gnd") {
        return fail(
          `element ${e.name}: node ${JSON.stringify(node)} is reserved: ngspice treats gnd as ground; use "0"`,
          at,
        );
      }
    }
  }
  // V5
  const dupNames = caseCollision(n.elements.map((e) => e.name));
  if (dupNames !== undefined) {
    return fail(`element names must be unique ignoring case: ${dupNames}`, ["elements"]);
  }
  // V6
  const nodes = new Set(n.elements.flatMap(nodesOf));
  const dupNodes = caseCollision(nodes);
  if (dupNodes !== undefined) {
    return fail(`node names must differ by more than case: ${dupNodes}`, ["elements"]);
  }
  for (const [i, e] of n.elements.entries()) {
    const at = ["elements", i];
    // V7
    if ((e.kind === "R" || e.kind === "L" || e.kind === "C") && !(e.value > 0)) {
      return fail(`element ${e.name}: value must be finite and > 0, got ${String(e.value)}`, at);
    }
    if (e.kind === "V" || e.kind === "I") {
      if (!Number.isFinite(e.dc)) return fail(`element ${e.name}: dc must be finite`, at);
    }
    // V18 and V19. Their finite checks cannot fire here (Zod rejects non-finite numbers first);
    // they stay so the rule order and messages match the Rust validator.
    // V18
    if ((e.kind === "V" || e.kind === "I") && e.tran) {
      const issue = checkWaveform(e.name, e.tran);
      if (issue) return fail(issue, at);
    }
    // V19
    if ((e.kind === "L" || e.kind === "C") && e.ic !== undefined && !Number.isFinite(e.ic)) {
      return fail(`element ${e.name}: ic must be finite`, at);
    }
    if (e.kind === "M") {
      for (const [key, v] of [
        ["w", e.w],
        ["l", e.l],
      ] as const) {
        if (v !== undefined && !(v > 0)) {
          return fail(`element ${e.name}: ${key} must be finite and > 0, got ${String(v)}`, at);
        }
      }
    }
    // V8: Q and M may share terminals.
    if (e.kind !== "Q" && e.kind !== "M" && e.nodes[0] === e.nodes[1]) {
      return fail(`element ${e.name}: both terminals are node ${e.nodes[0]}`, at);
    }
    // V13
    if (e.kind === "D" || e.kind === "Q" || e.kind === "M" || e.kind === "S") {
      const issue = checkModelRef(n.models, e);
      if (issue) return fail(issue, at);
    }
    // V9
    if (e.kind === "H" || e.kind === "F") {
      const src = n.elements.find((x) => x.name === e.controlSource);
      if (!src) {
        return fail(`element ${e.name}: unknown controlling source ${e.controlSource}`, at);
      }
      if (src.kind !== "V") {
        return fail(
          `element ${e.name}: controlling source ${e.controlSource} is not a voltage source`,
          at,
        );
      }
    }
  }
  // V14
  for (const [i, a] of n.analyses.entries()) {
    if (a.type === "dc") {
      const issue = checkDc(n.elements, a);
      if (issue) return fail(issue, ["analyses", i]);
    }
  }
  // V15
  if (n.nodeset) {
    const known = new Set(n.elements.flatMap(nodesOf));
    // Rust walks a BTreeMap: keys in ascending order.
    for (const node of Object.keys(n.nodeset).sort()) {
      if (node === "0" || !known.has(node))
        return fail(`nodeset: unknown node ${node}`, ["nodeset"]);
      if (!Number.isFinite(n.nodeset[node])) {
        return fail(`nodeset: value for node ${node} must be finite`, ["nodeset", node]);
      }
    }
  }
  // V11
  const o = n.options;
  if (o) {
    if (o.temp !== undefined) {
      if (!Number.isFinite(o.temp)) {
        return fail(`option temp must be finite, got ${String(o.temp)}`, ["options"]);
      }
      if (o.temp !== 27) {
        return fail("option temp must be 27 (temperature is fixed in v1)", ["options"]);
      }
    }
    for (const key of ["reltol", "vntol", "abstol", "chgtol", "gmin"] as const) {
      const v = o[key];
      if (v !== undefined && !(Number.isFinite(v) && v > 0)) {
        return fail(`option ${key} must be finite and > 0, got ${String(v)}`, ["options"]);
      }
    }
  }
  // V21
  if (o?.trtol !== undefined && !(Number.isFinite(o.trtol) && o.trtol > 0)) {
    return fail(`option trtol must be finite and > 0, got ${String(o.trtol)}`, ["options"]);
  }
  // V17
  const reltol = o?.reltol ?? DEFAULT_RELTOL;
  for (const [i, a] of n.analyses.entries()) {
    if (a.type === "ac") {
      const issue = checkAc(a, reltol);
      if (issue) return fail(issue, ["analyses", i]);
    }
  }
  // V20
  for (const [i, a] of n.analyses.entries()) {
    if (a.type === "tran") {
      const issue = checkTran(a);
      if (issue) return fail(issue, ["analyses", i]);
    }
  }
  return true;
}

export const netlistSchema = netlistBase.superRefine((n, ctx) => {
  check(n, ctx);
});

export type Netlist = z.infer<typeof netlistSchema>;
export type NetlistElement = Netlist["elements"][number];
export type Analysis = Netlist["analyses"][number];
export type DcAnalysis = Extract<Analysis, { type: "dc" }>;
export type AcAnalysis = Extract<Analysis, { type: "ac" }>;
export type TranAnalysis = Extract<Analysis, { type: "tran" }>;
export type Waveform = z.infer<typeof waveform>;
export type PulseWaveform = Extract<Waveform, { type: "pulse" }>;
export type SinWaveform = Extract<Waveform, { type: "sin" }>;
export type PwlWaveform = Extract<Waveform, { type: "pwl" }>;
export type IntegrationMethod = z.infer<typeof integrationMethod>;
export type AcSpec = z.infer<typeof acSpec>;
export type { AcSweep };
export type NetlistModel = Netlist["models"][number];
export type { ModelKind };
export type SimOptions = NonNullable<Netlist["options"]>;

export type ParseResult = { ok: true; value: Netlist } | { ok: false; issues: string[] };

/** Parse and validate a netlist. Issue strings are prefixed with the JSON path when it is not empty. */
export function parseNetlist(input: unknown): ParseResult {
  const r = netlistSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => {
      const path = i.path.map(String).join(".");
      return path === "" ? i.message : `${path}: ${i.message}`;
    }),
  };
}
