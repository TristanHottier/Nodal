import type { Schematic } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { cycleSelection, selectionOrder } from "./cycle";

const part = (id: string) => ({
  id,
  type: "resistor" as const,
  name: id,
  x: 0,
  y: 0,
  rotation: 0 as const,
  mirror: false,
  params: {},
});
const wire = (id: string) => ({
  id,
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
});
const label = (id: string) => ({ id, text: id, x: 0, y: 0, rotation: 0 as const });

const DOC: Schematic = {
  parts: [part("R1"), part("R2")],
  wires: [wire("w1")],
  labels: [label("L1")],
};

describe("selectionOrder", () => {
  it("lists parts, then wires, then labels, each in document order", () => {
    expect(selectionOrder(DOC)).toEqual(["R1", "R2", "w1", "L1"]);
  });
});

describe("cycleSelection", () => {
  it("starts at the first item going forward and the last going back", () => {
    expect(cycleSelection(DOC, [], 1)).toEqual(["R1"]);
    expect(cycleSelection(DOC, [], -1)).toEqual(["L1"]);
  });

  it("steps through parts, wires and labels in a stable order and wraps", () => {
    let sel: readonly string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      sel = cycleSelection(DOC, sel, 1);
      seen.push(sel[0] ?? "");
    }
    expect(seen).toEqual(["R1", "R2", "w1", "L1", "R1"]);
    expect(cycleSelection(DOC, ["R1"], -1)).toEqual(["L1"]);
    expect(cycleSelection(DOC, ["w1"], -1)).toEqual(["R2"]);
  });

  it("treats a multi-selection like no selection", () => {
    expect(cycleSelection(DOC, ["R2", "w1"], 1)).toEqual(["R1"]);
  });

  it("returns an empty selection for an empty document", () => {
    expect(cycleSelection({ parts: [], wires: [], labels: [] }, [], 1)).toEqual([]);
  });
});
