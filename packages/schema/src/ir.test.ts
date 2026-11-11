import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseNetlist } from "./ir";

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
    expect(invalid.length).toBeGreaterThanOrEqual(20);
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

describe("parsed values", () => {
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
