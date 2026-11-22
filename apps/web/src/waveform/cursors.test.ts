import { describe, expect, it } from "vitest";
import type { SimResult } from "../engine/results";
import { cursorReadout, valueAt } from "./cursors";

const f = (...v: number[]) => new Float64Array(v);

describe("valueAt", () => {
  it("value_at_interpolates_and_hits_samples", () => {
    const xs = f(0, 1, 3);
    const ys = f(0, 10, 30);
    expect(valueAt(xs, ys, 0, false)).toBe(0);
    expect(valueAt(xs, ys, 1, false)).toBe(10);
    expect(valueAt(xs, ys, 3, false)).toBe(30);
    expect(valueAt(xs, ys, 0.5, false)).toBe(5);
    expect(valueAt(xs, ys, 2, false)).toBe(20);
  });

  it("value_at_log_axis", () => {
    expect(valueAt(f(1, 100), f(0, 40), 10, true)).toBeCloseTo(20, 10);
  });

  it("value_at_outside_is_null", () => {
    const xs = f(1, 2);
    expect(valueAt(xs, f(1, 2), 0.5, false)).toBeNull();
    expect(valueAt(xs, f(1, 2), 2.5, false)).toBeNull();
    expect(valueAt(xs, f(1, NaN), 1.5, false)).toBeNull();
    expect(valueAt(f(), f(), 1, false)).toBeNull();
  });
});

describe("cursorReadout", () => {
  const r: SimResult = {
    type: "tran",
    axis: f(0, 1, 2),
    signals: [{ name: "a", kind: "v", re: f(0, 1, 4) }],
  };

  it("readout_delta_and_inverse_dx", () => {
    const out = cursorReadout(r, ["V(a)"], "linear", 0.5, 2);
    expect(out.rows).toEqual([{ key: "V(a)", a: 0.5, b: 4, delta: 3.5 }]);
    expect(out.dx).toBe(1.5);
    expect(out.inverseDx).toBeCloseTo(1 / 1.5, 12);
  });

  it("readout_null_cases", () => {
    const out = cursorReadout(r, ["V(a)"], "linear", 1, null);
    expect(out.rows[0]).toEqual({ key: "V(a)", a: 1, b: null, delta: null });
    expect(out.dx).toBeNull();
    expect(cursorReadout(r, [], "linear", 1, 1).inverseDx).toBeNull();
  });

  it("readout_uses_log_x_for_ac", () => {
    const ac: SimResult = {
      type: "ac",
      axis: f(1, 100),
      signals: [{ name: "a", kind: "v", re: f(0, 40), im: f(0, 0) }],
    };
    expect(cursorReadout(ac, ["V(a)"], "linear", 10, 10).rows[0]?.a).toBeCloseTo(20, 10);
  });
});
