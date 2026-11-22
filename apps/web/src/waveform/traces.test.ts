import type { Netlist } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import type { SimResult } from "../engine/results";
import { listSignals, traceValues, withDerivedCurrents } from "./traces";

const f = (...v: number[]) => new Float64Array(v);
const ir = (elements: unknown[]) => ({ elements }) as unknown as Netlist;
const divider = ir([
  { kind: "R", name: "R1", nodes: ["in", "out"], value: 1000 },
  { kind: "R", name: "R2", nodes: ["out", "0"], value: 3000 },
]);

describe("withDerivedCurrents", () => {
  it("derived_resistor_current_sign_and_value", () => {
    const r: SimResult = {
      type: "op",
      axis: f(),
      signals: [
        { name: "in", kind: "v", re: f(10) },
        { name: "out", kind: "v", re: f(7.5) },
      ],
    };
    const out = withDerivedCurrents(r, divider);
    expect(r.signals).toHaveLength(2);
    expect(out.signals.map((s) => `${s.kind}:${s.name}`)).toEqual([
      "v:in",
      "v:out",
      "i:R1",
      "i:R2",
    ]);
    expect(out.signals[2]?.re[0]).toBeCloseTo(2.5e-3, 12);
    expect(out.signals[3]?.re[0]).toBeCloseTo(2.5e-3, 12);
  });

  it("derived_current_ac_complex", () => {
    const r: SimResult = {
      type: "ac",
      axis: f(1, 10),
      signals: [
        { name: "in", kind: "v", re: f(1, 2), im: f(0, 1) },
        { name: "out", kind: "v", re: f(0, 0), im: f(0, 0) },
      ],
    };
    const out = withDerivedCurrents(
      r,
      ir([{ kind: "R", name: "R1", nodes: ["in", "out"], value: 2 }]),
    );
    const i = out.signals[2];
    expect(Array.from(i?.re ?? [])).toEqual([0.5, 1]);
    expect(Array.from(i?.im ?? [])).toEqual([0, 0.5]);
  });

  it("skips_existing_current_and_missing_voltage", () => {
    const r: SimResult = {
      type: "op",
      axis: f(),
      signals: [
        { name: "in", kind: "v", re: f(10) },
        { name: "r1", kind: "i", re: f(1) },
      ],
    };
    const out = withDerivedCurrents(r, divider);
    expect(out.signals).toHaveLength(2);
  });
});

describe("listSignals", () => {
  it("signals_ordered", () => {
    const r: SimResult = {
      type: "op",
      axis: f(),
      signals: [
        { name: "V1", kind: "i", re: f(1) },
        { name: "b", kind: "v", re: f(1) },
        { name: "a", kind: "v", re: f(1) },
        { name: "R1", kind: "i", re: f(1) },
      ],
    };
    expect(listSignals(r).map((s) => s.label)).toEqual(["V(b)", "V(a)", "I(V1)", "I(R1)"]);
  });
});

describe("traceValues", () => {
  const ac: SimResult = {
    type: "ac",
    axis: f(1, 2, 3, 4),
    signals: [{ name: "x", kind: "v", re: f(1, 0, -1, -1), im: f(1, 0, 0, -1e-30) }],
  };

  it("mag_and_phase_of_known_phasor", () => {
    expect(traceValues(ac, "V(x)", "mag")[0]).toBeCloseTo(3.0103, 4);
    expect(traceValues(ac, "V(x)", "phase")[0]).toBeCloseTo(45, 10);
    expect(Array.from(traceValues(ac, "V(x)", "linear"))).toEqual([1, 0, -1, -1]);
  });

  it("phase_range_is_half_open", () => {
    const p = traceValues(ac, "V(x)", "phase");
    expect(p[2]).toBe(180);
    expect(p[3]).toBe(180); // atan2 gives -180 here, mapped into (-180, 180]
  });

  it("zero_magnitude_is_gap", () => {
    expect(traceValues(ac, "V(x)", "mag")[1]).toBeNaN();
  });

  it("unknown_key_throws", () => {
    expect(() => traceValues(ac, "V(nope)", "linear")).toThrow();
  });
});
