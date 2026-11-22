import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFixtures, format, nodeCount } from "./gen-perf.mjs";

test("fixtures have exactly 50 nodes", () => {
  const f = buildFixtures();
  assert.equal(nodeCount(f["tran50.json"]), 50);
  assert.equal(nodeCount(f["ac50.json"]), 50);
});

test("ac sweep covers 1,001 frequencies", () => {
  const a = buildFixtures()["ac50.json"].analyses[0];
  assert.equal(a.sweep, "dec");
  const decades = Math.log10(a.fstop / a.fstart);
  assert.equal(Math.round(decades * a.points) + 1, 1001);
});

test("output is deterministic and valid JSON", () => {
  const a = buildFixtures();
  const b = buildFixtures();
  for (const name of Object.keys(a)) {
    const text = format(a[name]);
    assert.equal(text, format(b[name]));
    assert.deepEqual(JSON.parse(text), a[name]);
  }
});

test("tran and ac share the circuit", () => {
  const f = buildFixtures();
  const names = (ir) => ir.elements.map((e) => e.name);
  assert.deepEqual(names(f["tran50.json"]), names(f["ac50.json"]));
  const vin = f["tran50.json"].elements.find((e) => e.name === "VIN");
  assert.equal(vin.tran.pw, 5e-8);
});
