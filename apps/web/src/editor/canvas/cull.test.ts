import type { Schematic } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { cullDoc, visibleBox } from "./cull";

const part = (id: string, x: number, y: number) => ({
  id,
  type: "resistor" as const,
  name: id,
  x,
  y,
  rotation: 0 as const,
  mirror: false,
  params: {},
});

describe("visibleBox", () => {
  it("snaps_outward_to_cells_and_covers_the_viewport", () => {
    // 1000 x 500 px at zoom 1: world 0..100 x 0..50 grid units, padded and snapped to 20.
    const b = visibleBox({ x: 0, y: 0, zoom: 1 }, { width: 1000, height: 500 });
    expect(b).toEqual({ x0: -20, y0: -20, x1: 120, y1: 80 });
  });

  it("is unchanged by a pan inside one cell", () => {
    const a = visibleBox({ x: -3, y: -3, zoom: 1 }, { width: 1000, height: 500 });
    const b = visibleBox({ x: -9, y: -4, zoom: 1 }, { width: 1000, height: 500 });
    expect(b).toEqual(a);
  });
});

describe("cullDoc", () => {
  const doc: Schematic = {
    parts: [part("in", 10, 10), part("out", 500, 10)],
    wires: [
      {
        id: "w-in",
        points: [
          { x: 0, y: 0 },
          { x: 30, y: 0 },
        ],
      },
      {
        id: "w-across",
        points: [
          { x: -200, y: 5 },
          { x: 900, y: 5 },
        ],
      },
      {
        id: "w-out",
        points: [
          { x: 400, y: 0 },
          { x: 430, y: 0 },
        ],
      },
    ],
    labels: [],
  };
  const box = { x0: -20, y0: -20, x1: 120, y1: 80 };

  it("keeps_items_that_touch_the_box_and_drops_the_rest", () => {
    const c = cullDoc(doc, box);
    expect(c.parts.map((p) => p.id)).toEqual(["in"]);
    expect(c.wires.map((w) => w.id)).toEqual(["w-in", "w-across"]);
  });

  it("keeps_the_original_item_objects", () => {
    expect(cullDoc(doc, box).parts[0]).toBe(doc.parts[0]);
  });
});
