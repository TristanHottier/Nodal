// Writes the deterministic performance fixtures: node validation/scripts/gen-perf.mjs
//   validation/perf/tran50.json          50-node transient (12 inverters, 24-section RC ladder, diode)
//   validation/perf/ac50.json            the same circuit, AC sweep of 1,001 frequencies
//   validation/perf/inverter-chain.json  the 12 inverters alone, operating point
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "validation", "perf");

export const STAGES = 12;
export const LADDER_SECTIONS = 24;
export const NODE_COUNT = 50;
export const AC_POINTS_PER_DECADE = 100;
export const AC_FSTART = 1;
export const AC_FSTOP = 1e10;

const models = [
  { name: "NM", type: "NMOS", params: { VTO: 0.7, KP: 1e-4, CGSO: 1e-10, CGDO: 1e-10 } },
  { name: "PM", type: "PMOS", params: { VTO: -0.7, KP: 5e-5, CGSO: 1e-10, CGDO: 1e-10 } },
];
const diodeModel = { name: "DM", type: "D", params: { IS: 1e-14, CJO: 1e-13 } };

const pulse = { type: "pulse", v1: 0, v2: 3.3, td: 1e-9, tr: 1e-9, tf: 1e-9, pw: 5e-8, per: 1e-7 };

/** VDD with its bleed resistor, VIN, and the inverter chain. Returns the elements and the last output node. */
function inverterChain(vin) {
  const elements = [
    { kind: "V", name: "VDD", nodes: ["vdd", "0"], dc: 3.3 },
    { kind: "R", name: "RDD", nodes: ["vdd", "0"], value: 1e4 },
    { kind: "V", name: "VIN", nodes: ["in", "0"], dc: 0, ...vin },
  ];
  let prev = "in";
  for (let k = 1; k <= STAGES; k++) {
    const g = `g${k}`;
    const o = `o${k}`;
    elements.push(
      { kind: "R", name: `RG${k}`, nodes: [prev, g], value: 1000 },
      { kind: "M", name: `MN${k}`, nodes: [o, g, "0", "0"], model: "NM", w: 1e-5, l: 1e-6 },
      { kind: "M", name: `MP${k}`, nodes: [o, g, "vdd", "vdd"], model: "PM", w: 2e-5, l: 1e-6 },
      { kind: "C", name: `CL${k}`, nodes: [o, "0"], value: 2e-14 },
    );
    prev = o;
  }
  return { elements, last: prev };
}

function withLadder(vin, title, analyses) {
  const { elements, last } = inverterChain(vin);
  let prev = last;
  for (let k = 1; k <= LADDER_SECTIONS; k++) {
    const n = `r${k}`;
    elements.push(
      { kind: "R", name: `RL${k}`, nodes: [prev, n], value: 100 },
      { kind: "C", name: `CR${k}`, nodes: [n, "0"], value: 1e-13 },
    );
    prev = n;
  }
  elements.push({ kind: "D", name: "D1", nodes: [prev, "0"], model: "DM" });
  return { irVersion: 1, title, elements, models: [...models, diodeModel], analyses };
}

export function buildFixtures() {
  const tran = withLadder({ tran: pulse }, "Perf: 50-node transient", [
    { type: "tran", tstep: 1e-10, tstop: 4e-7, tmax: 4e-11 },
  ]);
  const ac = withLadder({ ac: { mag: 1, phase: 0 } }, "Perf: 50-node AC sweep", [
    { type: "ac", sweep: "dec", points: AC_POINTS_PER_DECADE, fstart: AC_FSTART, fstop: AC_FSTOP },
  ]);
  const chain = {
    irVersion: 1,
    title: "Perf: 12-stage CMOS inverter chain",
    elements: inverterChain({}).elements,
    models,
    analyses: [{ type: "op" }],
  };
  return { "tran50.json": tran, "ac50.json": ac, "inverter-chain.json": chain };
}

export function nodeCount(ir) {
  const nodes = new Set(ir.elements.flatMap((e) => e.nodes));
  nodes.delete("0");
  return nodes.size;
}

/** One element per line; stable and compact. */
export function format(ir) {
  const lines = ir.elements.map((e) => `  ${JSON.stringify(e)}`).join(",\n");
  return [
    "{",
    `"irVersion":${ir.irVersion},"title":${JSON.stringify(ir.title)},`,
    `"elements":[\n${lines}\n],`,
    `"models":${JSON.stringify(ir.models)},`,
    `"analyses":${JSON.stringify(ir.analyses)}`,
    "}",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixtures = buildFixtures();
  for (const name of ["tran50.json", "ac50.json"]) {
    const n = nodeCount(fixtures[name]);
    if (n !== NODE_COUNT) throw new Error(`${name} has ${n} nodes, expected ${NODE_COUNT}`);
  }
  mkdirSync(outDir, { recursive: true });
  for (const [name, ir] of Object.entries(fixtures)) {
    writeFileSync(join(outDir, name), format(ir));
  }
}
