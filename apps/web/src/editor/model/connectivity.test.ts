import type { Schematic, Wire } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { isConnectionPoint, pointOnWire } from "./connectivity";

const wire: Wire = {
  id: "w",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
  ],
};
const doc: Schematic = {
  parts: [],
  wires: [wire],
  labels: [{ id: "L", text: "N", x: 20, y: 20, rotation: 0 }],
};

describe("pointOnWire", () => {
  it("includes_ends_bends_and_interiors", () => {
    expect(pointOnWire(wire, { x: 0, y: 0 })).toBe(true);
    expect(pointOnWire(wire, { x: 10, y: 0 })).toBe(true);
    expect(pointOnWire(wire, { x: 4, y: 0 })).toBe(true);
    expect(pointOnWire(wire, { x: 10, y: 5 })).toBe(true);
  });
  it("excludes_other_points", () => {
    expect(pointOnWire(wire, { x: 4, y: 1 })).toBe(false);
    expect(pointOnWire(wire, { x: 11, y: 0 })).toBe(false);
  });
});

describe("isConnectionPoint", () => {
  it("accepts_wire_points_and_label_anchors", () => {
    expect(isConnectionPoint(doc, { x: 10, y: 3 })).toBe(true);
    expect(isConnectionPoint(doc, { x: 20, y: 20 })).toBe(true);
  });
  it("rejects_empty_points", () => {
    expect(isConnectionPoint(doc, { x: 5, y: 5 })).toBe(false);
  });
});
