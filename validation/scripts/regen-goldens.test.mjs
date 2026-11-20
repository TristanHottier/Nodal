import assert from "node:assert/strict";
import { test } from "node:test";
import { mapSignals, parseRaw, staleGoldens } from "./regen-goldens.mjs";

const complexRaw = `Title: rc
Date: Fri Nov 20 2026
Plotname: AC Analysis
Flags: complex
No. Variables: 3
No. Points: 2
Variables:
\t0\tfrequency\tfrequency
\t1\tv(out)\tvoltage
\t2\tv1#branch\tcurrent
Values:
 0\t1.0000000000000000e+00,0.0000000000000000e+00
\t9.9999999999999e-01,-1.0e-02
\t-5.0e-04,2.5e-05
 1\t1.0000000000000000e+01,0.0000000000000000e+00
\t9.0e-01,-3.0e-01
\t-4.5e-04,1.5e-04
`;

const ir = {
  elements: [
    { kind: "V", name: "V1", nodes: ["in", "0"], dc: 0, ac: 1 },
    { kind: "R", name: "R1", nodes: ["in", "out"], value: 1000 },
    { kind: "C", name: "C1", nodes: ["out", "0"], value: 1e-6 },
  ],
  analyses: [{ type: "ac" }],
};

test("parseRaw reads a complex rawfile as re,im pairs", () => {
  const raw = parseRaw(complexRaw);
  assert.deepEqual(raw.names, ["frequency", "v(out)", "v1#branch"]);
  assert.equal(raw.complex, true);
  assert.equal(raw.points.length, 2);
  assert.deepEqual(raw.points[0][0], [1, 0]);
  assert.deepEqual(raw.points[0][1], [0.99999999999999, -0.01]);
  assert.deepEqual(raw.points[1][2], [-4.5e-4, 1.5e-4]);
});

test("parseRaw still reads a real rawfile", () => {
  const raw = parseRaw(
    "Flags: real\nNo. Variables: 2\nNo. Points: 1\nVariables:\n\t0\tv(a)\tvoltage\n\t1\ti(v1)\tcurrent\nValues:\n 0\t1.5\n\t-2.5\n",
  );
  assert.equal(raw.complex, false);
  assert.deepEqual(raw.points, [[1.5, -2.5]]);
});

test("parseRaw rejects a malformed complex value", () => {
  assert.throws(() => parseRaw(complexRaw.replace("-5.0e-04,2.5e-05", "-5.0e-04")), /complex/);
});

test("mapSignals maps an ac plot: frequency scale, nodes and branch currents", () => {
  const mapped = mapSignals(["frequency", "v(out)", "v1#branch"], ir, "ac");
  assert.deepEqual(mapped, [
    [0, "frequency"],
    [1, "V(out)"],
    [2, "I(V1)"],
  ]);
});

test("mapSignals rejects an ac plot whose first vector is not frequency", () => {
  assert.throws(() => mapSignals(["time", "v(out)"], ir, "ac"), /frequency/);
});

test("staleGoldens names a golden of another kind", () => {
  const files = ["A1.ac.csv", "A2.op.csv"];
  assert.deepEqual(staleGoldens("A1", "op", files), ["A1.ac.csv"]);
  assert.deepEqual(staleGoldens("A1", "ac", files), []);
  assert.deepEqual(staleGoldens("A2", "dc", files), ["A2.op.csv"]);
});
