import { PART_TYPES } from "@nodal/schema";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LABEL_SYMBOL, PALETTE, SYMBOLS } from "./catalog";

const PREFIX: Record<string, string> = {
  resistor: "R",
  capacitor: "C",
  inductor: "L",
  vsource: "V",
  isource: "I",
  vcvs: "E",
  vccs: "G",
  ccvs: "H",
  cccs: "F",
  ground: "GND",
};

describe("palette", () => {
  it("lists every part type then label", () => {
    expect(PALETTE).toEqual([...PART_TYPES, "label"]);
  });
});

describe.each(Object.entries(SYMBOLS))("symbol %s", (type, def) => {
  it("pins_on_integer_grid", () => {
    for (const p of def.pins) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });
  it("pin_names_unique", () => {
    const names = def.pins.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("pins_inside_bounds", () => {
    const { x0, y0, x1, y1 } = def.bounds;
    for (const p of def.pins) {
      expect(p.x).toBeGreaterThanOrEqual(x0);
      expect(p.x).toBeLessThanOrEqual(x1);
      expect(p.y).toBeGreaterThanOrEqual(y0);
      expect(p.y).toBeLessThanOrEqual(y1);
    }
  });
  it("prefix_matches_table", () => {
    expect(def.type).toBe(type);
    expect(def.prefix).toBe(PREFIX[type]);
  });
  it("body_renders", () => {
    const { container } = render(
      <svg>
        <def.Body />
      </svg>,
    );
    expect(container.querySelector("svg")?.children.length).toBeGreaterThan(0);
  });
});

describe("catalog coverage", () => {
  it("has the ten two-terminal and source types", () => {
    expect(Object.keys(SYMBOLS).sort()).toEqual(Object.keys(PREFIX).sort());
  });
});

describe("net label", () => {
  it("anchors at origin and renders text", () => {
    expect(LABEL_SYMBOL.pins).toEqual([{ name: "a", x: 0, y: 0 }]);
    const { container } = render(
      <svg>
        <LABEL_SYMBOL.Body text="VCC" />
      </svg>,
    );
    expect(container.textContent).toBe("VCC");
  });
});
