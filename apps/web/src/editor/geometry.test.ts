import type { Part } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { SYMBOLS } from "../symbols/catalog";
import { GRID, partBounds, pinPositions, rotateCw, transformPoint } from "./geometry";

const part = (over: Partial<Part>): Part => ({
  id: "p1",
  type: "resistor",
  name: "R1",
  x: 0,
  y: 0,
  rotation: 0,
  mirror: false,
  params: {},
  ...over,
});

describe("geometry", () => {
  it("grid_is_ten", () => {
    expect(GRID).toBe(10);
  });

  it("transform_rotations", () => {
    const p = { x: 1, y: 0 };
    expect(transformPoint(p, 0, false)).toEqual({ x: 1, y: 0 });
    expect(transformPoint(p, 90, false)).toEqual({ x: 0, y: 1 });
    expect(transformPoint(p, 180, false)).toEqual({ x: -1, y: 0 });
    expect(transformPoint(p, 270, false)).toEqual({ x: 0, y: -1 });
  });

  it("mirror_then_rotate", () => {
    expect(transformPoint({ x: 1, y: 2 }, 90, true)).toEqual({ x: -2, y: -1 });
  });

  it("rotate_cw_cycles", () => {
    expect(rotateCw(0)).toBe(90);
    expect(rotateCw(270)).toBe(0);
  });

  it("four_rotations_identity", () => {
    for (const def of Object.values(SYMBOLS)) {
      for (const pin of def.pins) {
        for (const mirror of [false, true]) {
          let p = transformPoint(pin, 0, mirror);
          for (let i = 0; i < 4; i++) p = transformPoint(p, 90, false);
          expect(p).toEqual(transformPoint(pin, 0, mirror));
        }
      }
    }
  });

  it("pin_positions_world", () => {
    const pins = pinPositions(part({ x: 5, y: 7, rotation: 90 }));
    expect(pins).toEqual([
      { name: "1", at: { x: 8, y: 7 } },
      { name: "2", at: { x: 2, y: 7 } },
    ]);
  });

  it("bounds_are_normalized_and_world", () => {
    const b = partBounds(part({ x: 5, y: 7, rotation: 90 }));
    expect(b.x0).toBeLessThanOrEqual(b.x1);
    expect(b.y0).toBeLessThanOrEqual(b.y1);
    expect(b.x0).toBeLessThanOrEqual(2);
    expect(b.x1).toBeGreaterThanOrEqual(8);
  });

  it("unknown_type_has_no_pins_and_zero_bounds", () => {
    const p = part({ type: "opamp", x: 3, y: 4 });
    expect(pinPositions(p)).toEqual([]);
    expect(partBounds(p)).toEqual({ x0: 3, y0: 4, x1: 3, y1: 4 });
  });
});
