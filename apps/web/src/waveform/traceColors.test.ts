import { describe, expect, it } from "vitest";
import type { CircuitMap } from "../netlist/netlister";
import { TRACE_COUNT, traceSlot, traceVar, wireProbeSlots } from "./traceColors";

const map: CircuitMap = {
  partOfElement: new Map(),
  netOfPin: new Map(),
  netOfWire: new Map([
    ["w1", "in"],
    ["w2", "out"],
    ["w3", "out"],
    ["w4", "0"],
  ]),
  netOfLabel: new Map(),
};

describe("trace colors", () => {
  it("cycles_through_six_one_based_slots", () => {
    expect(TRACE_COUNT).toBe(6);
    expect(traceSlot(0)).toBe(1);
    expect(traceSlot(5)).toBe(6);
    expect(traceSlot(6)).toBe(1);
    expect(traceSlot(7)).toBe(2);
  });

  it("names_the_css_variable", () => {
    expect(traceVar(0)).toBe("var(--color-trace-1)");
    expect(traceVar(6)).toBe("var(--color-trace-1)");
  });

  it("maps_every_wire_of_a_probed_net_to_its_probe_slot", () => {
    const slots = wireProbeSlots(map, ["I(V1)", "V(in)", "V(out)", "V(0)"]);
    expect(slots.get("w1")).toBe(2);
    expect(slots.get("w2")).toBe(3);
    expect(slots.get("w3")).toBe(3);
    expect(slots.has("w4")).toBe(false);
  });

  it("seventh_probe_reuses_slot_one", () => {
    const probes = ["V(a)", "V(b)", "V(c)", "V(d)", "V(e)", "V(f)", "V(out)"];
    expect(wireProbeSlots(map, probes).get("w2")).toBe(1);
  });

  it("has_no_slots_without_a_map", () => {
    expect(wireProbeSlots(null, ["V(out)"]).size).toBe(0);
  });
});
