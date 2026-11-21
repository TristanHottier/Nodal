import type { Part, Schematic } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { nextLabelText, nextName } from "./naming";

const part = (name: string, type: Part["type"] = "resistor"): Part => ({
  id: "id-" + name,
  type,
  name,
  x: 0,
  y: 0,
  rotation: 0,
  mirror: false,
  params: {},
});
const doc = (...parts: Part[]): Schematic => ({ parts, wires: [], labels: [] });

describe("nextName", () => {
  it("first_name_is_1", () => {
    expect(nextName(doc(), "R")).toBe("R1");
  });

  it("next_after_gap", () => {
    expect(nextName(doc(part("R1"), part("R5")), "R")).toBe("R6");
  });

  it("case_insensitive", () => {
    expect(nextName(doc(part("r7")), "R")).toBe("R8");
  });

  it("prefixes_independent", () => {
    const d = doc(part("R4"), part("Q1", "npn"), part("Q2", "pnp"));
    expect(nextName(d, "Q")).toBe("Q3");
    expect(nextName(d, "C")).toBe("C1");
    expect(nextName(d, "R")).toBe("R5");
  });
});

describe("nextLabelText", () => {
  it("counts_net_labels", () => {
    expect(nextLabelText(doc())).toBe("NET1");
    const d: Schematic = {
      parts: [],
      wires: [],
      labels: [
        { id: "a", text: "NET3", x: 0, y: 0, rotation: 0 },
        { id: "b", text: "out", x: 0, y: 0, rotation: 0 },
      ],
    };
    expect(nextLabelText(d)).toBe("NET4");
  });
});
