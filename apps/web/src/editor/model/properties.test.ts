import type { Schematic } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { setLabelText, setPartName, setPartParam } from "./properties";

const doc: Schematic = {
  parts: [
    {
      id: "p1",
      type: "resistor",
      name: "R1",
      x: 0,
      y: 0,
      rotation: 0,
      mirror: false,
      params: { r: "1k" },
    },
  ],
  wires: [],
  labels: [{ id: "l1", text: "A", x: 0, y: 0, rotation: 0 }],
};

describe("properties", () => {
  it("set_name", () => {
    const next = setPartName(doc, "p1", "  R9 ");
    expect(next.parts[0]?.name).toBe("R9");
    expect(setPartName(doc, "zz", "X")).toBe(doc);
  });

  it("set_param_and_clear", () => {
    const a = setPartParam(doc, "p1", "r", " 2k ");
    expect(a.parts[0]?.params).toEqual({ r: "2k" });
    const b = setPartParam(a, "p1", "tc", "1");
    expect(b.parts[0]?.params).toEqual({ r: "2k", tc: "1" });
    const c = setPartParam(b, "p1", "r", "  ");
    expect(c.parts[0]?.params).toEqual({ tc: "1" });
  });

  it("noop_same_object", () => {
    expect(setPartName(doc, "p1", "R1")).toBe(doc);
    expect(setPartParam(doc, "p1", "r", "1k")).toBe(doc);
    expect(setPartParam(doc, "p1", "absent", "")).toBe(doc);
    expect(setPartParam(doc, "nope", "r", "1")).toBe(doc);
    expect(setLabelText(doc, "l1", "A")).toBe(doc);
  });

  it("label_text", () => {
    expect(setLabelText(doc, "l1", " VOUT ").labels[0]?.text).toBe("VOUT");
    expect(setLabelText(doc, "zz", "X")).toBe(doc);
  });
});
