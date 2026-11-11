import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseNetlist } from "./ir";
import { PARAM_SPECS, encodeParamSpecs } from "./models";

const fixtures = join(import.meta.dirname, "../fixtures/ir");
const circuits = join(import.meta.dirname, "../../../validation/circuits");

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
}

function load(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function issuesOf(name: string): string[] {
  const r = parseNetlist(load(join(fixtures, "invalid", `${name}.json`)));
  if (r.ok) throw new Error(`${name} was accepted`);
  return r.issues;
}

describe("fixtures shared with the Rust engine", () => {
  const valid = [...jsonFiles(join(fixtures, "valid")), ...jsonFiles(circuits)];
  const invalid = jsonFiles(join(fixtures, "invalid"));

  test("fixture folders are populated", () => {
    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThanOrEqual(34);
  });

  test.each(valid)("valid: %s", (path) => {
    const r = parseNetlist(load(path));
    expect(r.ok ? [] : r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  test.each(invalid)("invalid: %s", (path) => {
    const r = parseNetlist(load(path));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe("messages name the culprit", () => {
  test("duplicate-name-case", () => {
    const text = issuesOf("duplicate-name-case").join("\n");
    expect(text).toContain("R_A");
    expect(text).toContain("R_a");
  });
  test("node-case-collision", () => {
    const text = issuesOf("node-case-collision").join("\n");
    expect(text).toContain("OUT");
    expect(text).toContain("out");
  });
  test("gnd-node", () => {
    const text = issuesOf("gnd-node").join("\n");
    expect(text).toContain('node "GND" is reserved: ngspice treats gnd as ground; use "0"');
  });
  test("unknown-control-source", () => {
    const text = issuesOf("unknown-control-source").join("\n");
    expect(text).toContain("F1");
    expect(text).toContain("unknown controlling source");
  });
  test("control-not-vsource", () => {
    const text = issuesOf("control-not-vsource").join("\n");
    expect(text).toContain("F1");
    expect(text).toContain("R1");
    expect(text).toContain("is not a voltage source");
  });
});

// Message fragments shared with NEEDLES in crates/nodal-engine/tests/ir_fixtures.rs.
// Fixtures that serde rejects with its own wording (unknown variant, unknown
// field, number out of range) are only checked for rejection above.
const NEEDLES: [string, string][] = [
  ["ir-version-2", "irVersion must be 1"],
  ["empty-elements", "elements must not be empty"],
  ["empty-analyses", "analyses must not be empty"],
  ["name-kind-mismatch", "element name C1 must start with its kind letter R"],
  ["bad-element-name", 'element name "R-1" must match'],
  ["bad-node-name", 'node "n 1" must match'],
  ["gnd-node", 'node "GND" is reserved: ngspice treats gnd as ground'],
  ["duplicate-name-case", "must be unique ignoring case: R_A, R_a"],
  ["node-case-collision", "must differ by more than case: OUT, out"],
  ["unknown-control-source", "element F1: unknown controlling source V9"],
  ["control-not-vsource", "element F1: controlling source R1 is not a voltage source"],
  ["zero-resistor", "element R1: value must be finite and > 0"],
  ["negative-capacitor", "element C1: value must be finite and > 0"],
  ["same-node-terminals", "element R1: both terminals are node in"],
  ["model-unknown", "element D1: unknown model NOPE"],
  ["model-wrong-type", "element D1: model QMOD has type NPN, expected D"],
  ["model-duplicate-case", "model names must be unique ignoring case: DMOD, dmod"],
  ["model-lowercase-param", "unsupported parameter is for model DMOD (D)"],
  ["model-bv-rejected", "unsupported parameter BV for model DMOD (D)"],
  ["model-param-out-of-range", "parameter M of model DMOD must be in [0, 1), got 1"],
  ["mos-zero-width", "element M1: w must be finite and > 0"],
  ["switch-same-output-nodes", "element S1: both terminals are node a"],
  ["dc-unknown-source", "analysis dc: unknown source V9"],
  ["dc-source-not-independent", "analysis dc: source R1 is not an independent source"],
  ["dc-zero-step", "analysis dc: step must not be zero"],
  ["dc-step-misses-stop", "analysis dc: step 0.3 does not reach stop 1 from start 0"],
  ["nodeset-unknown-node", "nodeset: unknown node zz"],
  ["temp-not-27", "option temp must be 27 (temperature is fixed in v1)"],
  ["bad-option", "option reltol must be finite and > 0"],
];

describe("message needles from the Rust tests", () => {
  test.each(NEEDLES)("%s", (name, needle) => {
    expect(issuesOf(name).join("\n")).toContain(needle);
  });

  test("every invalid fixture is rejected, with or without a needle", () => {
    const listed = new Set(NEEDLES.map(([n]) => n));
    const serdeOnly = [
      "unknown-field",
      "unknown-kind",
      "unsupported-analysis",
      "analysis-extra-field",
      "infinite-value",
    ];
    const onDisk = jsonFiles(join(fixtures, "invalid")).map((p) => basename(p, ".json"));
    expect(onDisk.filter((n) => !listed.has(n) && !serdeOnly.includes(n))).toEqual([]);
  });
});

describe("model parameter table", () => {
  test("matches fixtures/param-specs.json, which the Rust test also reads", () => {
    const file = load(join(fixtures, "../param-specs.json"));
    expect(encodeParamSpecs()).toEqual(file);
    expect(Object.keys(PARAM_SPECS).sort()).toEqual(Object.keys(file as object).sort());
  });
});

describe("parsed values", () => {
  test("models default to [] and params to {}", () => {
    const r = parseNetlist(load(join(fixtures, "valid", "divider.json")));
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.value.models).toEqual([]);
    const n = parseNetlist(load(join(fixtures, "valid", "nodeset.json")));
    if (!n.ok) throw new Error(n.issues.join("; "));
    expect(n.value.models[0]?.params).toEqual({});
    expect(n.value.nodeset).toEqual({ a: 0.6 });
  });

  test("M keeps optional w and l", () => {
    const r = parseNetlist(load(join(fixtures, "valid", "nonlinear.json")));
    if (!r.ok) throw new Error(r.issues.join("; "));
    const m = r.value.elements.find((e) => e.kind === "M");
    expect(m).toMatchObject({ w: 1e-5, l: 1e-6 });
  });

  test("dc defaults to 0", () => {
    const r = parseNetlist(load(join(fixtures, "valid", "dc-default.json")));
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.value.elements[0]).toMatchObject({ kind: "V", dc: 0 });
    expect(r.value.elements[0]?.kind === "V" && r.value.elements[0].dc).toBe(0);
  });

  test("infinite-value: JSON.parse yields Infinity and it is rejected", () => {
    const raw = load(join(fixtures, "invalid", "infinite-value.json"));
    expect(JSON.stringify(raw)).toContain("null");
    const r = parseNetlist(raw);
    expect(r.ok).toBe(false);
    expect(issuesOf("infinite-value").join("\n")).toMatch(/finite/);
  });

  test("non-finite dc, gain and options are rejected", () => {
    const base = (el: object, options?: object) => ({
      irVersion: 1,
      elements: [{ kind: "V", name: "V1", nodes: ["a", "0"], dc: 1 }, el],
      analyses: [{ type: "op" }],
      ...(options ? { options } : {}),
    });
    for (const v of [Infinity, -Infinity, NaN]) {
      expect(parseNetlist(base({ kind: "I", name: "I1", nodes: ["a", "0"], dc: v })).ok).toBe(
        false,
      );
      expect(
        parseNetlist(
          base({ kind: "G", name: "G1", nodes: ["a", "0"], controlNodes: ["a", "0"], gain: v }),
        ).ok,
      ).toBe(false);
      expect(
        parseNetlist(base({ kind: "R", name: "R1", nodes: ["a", "0"], value: 1 }, { temp: v })).ok,
      ).toBe(false);
    }
  });

  test("title null is treated as absent", () => {
    const raw = load(join(fixtures, "valid", "divider.json")) as Record<string, unknown>;
    const r = parseNetlist({ ...raw, title: null });
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.value.title).toBeUndefined();
  });

  test("non-object input is rejected", () => {
    expect(parseNetlist(null).ok).toBe(false);
    expect(parseNetlist("x").ok).toBe(false);
  });
});
