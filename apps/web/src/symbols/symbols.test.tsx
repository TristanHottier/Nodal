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
  diode: "D",
  npn: "Q",
  pnp: "Q",
  nmos: "M",
  pmos: "M",
  switch: "S",
  opamp: "U",
  ground: "GND",
};

const TWO = (a: string, b: string) => [
  { name: a, x: 0, y: -3 },
  { name: b, x: 0, y: 3 },
];
const BJT = [
  { name: "c", x: 2, y: -3 },
  { name: "b", x: -3, y: 0 },
  { name: "e", x: 2, y: 3 },
];
const MOS = [
  { name: "d", x: 2, y: -3 },
  { name: "g", x: -3, y: 0 },
  { name: "s", x: 2, y: 3 },
  { name: "b", x: 4, y: 0 },
];
const PINS: Record<string, { name: string; x: number; y: number }[]> = {
  resistor: TWO("1", "2"),
  capacitor: TWO("1", "2"),
  inductor: TWO("1", "2"),
  vsource: TWO("p", "n"),
  isource: TWO("p", "n"),
  vcvs: [...TWO("p", "n"), { name: "cp", x: -4, y: -2 }, { name: "cn", x: -4, y: 2 }],
  vccs: [...TWO("p", "n"), { name: "cp", x: -4, y: -2 }, { name: "cn", x: -4, y: 2 }],
  ccvs: TWO("p", "n"),
  cccs: TWO("p", "n"),
  diode: TWO("a", "k"),
  npn: BJT,
  pnp: BJT,
  nmos: MOS,
  pmos: MOS,
  switch: [...TWO("p", "n"), { name: "cp", x: -4, y: -2 }, { name: "cn", x: -4, y: 2 }],
  opamp: [
    { name: "inn", x: -4, y: -2 },
    { name: "inp", x: -4, y: 2 },
    { name: "out", x: 4, y: 0 },
  ],
  ground: [{ name: "gnd", x: 0, y: 0 }],
};

describe("pins_match_table", () => {
  it.each(Object.entries(SYMBOLS))("%s", (type, def) => {
    expect(def.pins).toEqual(PINS[type]);
  });
});

describe("palette", () => {
  it("palette_order", () => {
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
    expect(
      container.querySelectorAll("path, circle, rect, line, polygon, polyline, text").length,
    ).toBeGreaterThan(0);
  });
});

describe("catalog coverage", () => {
  it("catalog_covers_all_part_types", () => {
    expect(Object.keys(SYMBOLS).sort()).toEqual([...PART_TYPES].sort());
    expect(Object.keys(PREFIX).sort()).toEqual([...PART_TYPES].sort());
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
