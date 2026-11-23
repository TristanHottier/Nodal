import { describe, expect, it } from "vitest";
import type { SimResult } from "../engine/results";
import { signalUnit, xLabelOf, yLabelOf } from "./axisLabels";

const result = (type: SimResult["type"], source?: string): SimResult => ({
  type,
  axis: new Float64Array(),
  signals: [],
  ...(source === undefined ? {} : { source }),
});

describe("xLabelOf", () => {
  it("names_the_axis_by_analysis_with_unit", () => {
    expect(xLabelOf(result("tran"))).toBe("Time (s)");
    expect(xLabelOf(result("ac"))).toBe("Frequency (Hz)");
  });

  it("dc_sweep_takes_the_unit_from_the_source_prefix", () => {
    expect(xLabelOf(result("dc", "V1"))).toBe("V1 (V)");
    expect(xLabelOf(result("dc", "Iload"))).toBe("Iload (A)");
    expect(xLabelOf(result("dc", "R2"))).toBe("R2 (Ω)");
    expect(xLabelOf(result("dc", "X1"))).toBe("X1");
    expect(xLabelOf(result("dc"))).toBe("Sweep");
  });
});

describe("yLabelOf", () => {
  it("one_probe_names_signal_and_unit", () => {
    expect(yLabelOf(["V(b)"])).toBe("V(b) (V)");
    expect(yLabelOf(["I(V1)"])).toBe("I(V1) (A)");
  });

  it("several_probes_name_the_quantity", () => {
    expect(yLabelOf(["V(a)", "V(b)"])).toBe("Voltage (V)");
    expect(yLabelOf(["I(R1)", "I(V1)"])).toBe("Current (A)");
    expect(yLabelOf(["V(a)", "I(V1)"])).toBe("Voltage (V), current (A)");
    expect(yLabelOf([])).toBe("Voltage (V)");
  });

  it("signal_unit_follows_the_key", () => {
    expect(signalUnit("I(R1)")).toBe("A");
    expect(signalUnit("V(out)")).toBe("V");
  });
});
