import { describe, expect, it } from "vitest";
import { toData, xRange } from "./Plot";

const f = (...v: number[]) => new Float64Array(v);

describe("toData", () => {
  it("non_finite_values_become_null_gaps", () => {
    const data = toData(f(0, 1, 2, 3), [
      {
        label: "a",
        color: "#000",
        values: f(1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
      },
    ]);
    expect(data[0]).toEqual([0, 1, 2, 3]);
    expect(data[1]).toEqual([1, null, null, null]);
  });

  it("descending_axis_is_reversed_with_its_series", () => {
    const data = toData(f(3, 2, 1), [{ label: "a", color: "#000", values: f(30, 20, 10) }]);
    expect(data[0]).toEqual([1, 2, 3]);
    expect(data[1]).toEqual([10, 20, 30]);
  });
});

describe("xRange", () => {
  it("pads_a_single_point_axis", () => {
    expect(xRange(5, 5, false)).toEqual([4, 6]);
    const [lo, hi] = xRange(100, 100, true);
    expect(lo).toBeLessThan(100);
    expect(hi).toBeGreaterThan(100);
    expect(xRange(1, 10, true)).toEqual([1, 10]);
  });
});
