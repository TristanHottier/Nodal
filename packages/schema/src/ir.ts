// Netlist IR (version 1). Mirrors crates/nodal-engine/src/ir; both validate
// the same fixtures in packages/schema/fixtures/ir. Rules V1 to V11 are
// listed in the engine's validate.rs.
import { z } from "zod";
import { IR_VERSION } from "./constants";

// Zod 4 already rejects Infinity and NaN; the refine keeps that explicit and gives one message.
const finite = z
  .number({ error: "must be a finite number" })
  .refine(Number.isFinite, { error: "must be a finite number" });

/** `null` counts as absent, as it does in the Rust engine. */
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v) => v ?? undefined);

const nodeName = z.string();
const nodePair = z.tuple([nodeName, nodeName]);
const elementName = z.string();

const element = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("R"), name: elementName, nodes: nodePair, value: finite }),
  z.strictObject({ kind: z.literal("L"), name: elementName, nodes: nodePair, value: finite }),
  z.strictObject({ kind: z.literal("C"), name: elementName, nodes: nodePair, value: finite }),
  z.strictObject({
    kind: z.literal("V"),
    name: elementName,
    nodes: nodePair,
    dc: finite.default(0),
  }),
  z.strictObject({
    kind: z.literal("I"),
    name: elementName,
    nodes: nodePair,
    dc: finite.default(0),
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
]);

const analysis = z.strictObject({ type: z.literal("op") });

const options = z.strictObject({
  temp: optional(finite),
  reltol: optional(finite),
  vntol: optional(finite),
  abstol: optional(finite),
  chgtol: optional(finite),
  gmin: optional(finite),
});

const ELEMENT_NAME = /^[RLCVIEGHF][A-Za-z0-9_]*$/;
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
  models: z.array(z.unknown()).default([]),
  analyses: z.array(analysis),
  options: optional(options),
});

type NetlistBase = z.output<typeof netlistBase>;

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
  // V10
  if (n.models.length > 0) return fail("models must be empty", ["models"]);

  const nodesOf = (e: (typeof n.elements)[number]): string[] =>
    e.kind === "E" || e.kind === "G" ? [...e.nodes, ...e.controlNodes] : [...e.nodes];

  for (const [i, e] of n.elements.entries()) {
    const at = ["elements", i];
    // V3
    if (!ELEMENT_NAME.test(e.name)) {
      return fail(
        `element name ${JSON.stringify(e.name)} must match ^[RLCVIEGHF][A-Za-z0-9_]*$`,
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
    // V8
    if (e.nodes[0] === e.nodes[1]) {
      return fail(`element ${e.name}: both terminals are node ${e.nodes[0]}`, at);
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
  // V11
  const o = n.options;
  if (o) {
    if (o.temp !== undefined && !(o.temp > -273.15)) {
      return fail(`option temp must be finite and > -273.15, got ${String(o.temp)}`, ["options"]);
    }
    for (const key of ["reltol", "vntol", "abstol", "chgtol", "gmin"] as const) {
      const v = o[key];
      if (v !== undefined && !(v > 0)) {
        return fail(`option ${key} must be finite and > 0, got ${String(v)}`, ["options"]);
      }
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
