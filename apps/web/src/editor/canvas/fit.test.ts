import type { Schematic } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { GRID } from "../geometry";
import { contentBox, FIT_MARGIN, refitView } from "./fit";

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

/** A circuit about 60 x 40 grid units wide. */
const doc: Schematic = {
  parts: [part("a", 0, 0), part("b", 60, 40)],
  wires: [],
  labels: [],
};

describe("contentBox", () => {
  it("is_null_for_an_empty_schematic", () => {
    expect(contentBox({ parts: [], wires: [], labels: [] })).toBeNull();
  });

  it("covers_parts_and_wire_points", () => {
    const box = contentBox({
      ...doc,
      wires: [
        {
          id: "w",
          points: [
            { x: -5, y: 70 },
            { x: 80, y: 70 },
          ],
        },
      ],
    });
    expect(box?.x0).toBeLessThanOrEqual(-5);
    expect(box?.x1).toBeGreaterThanOrEqual(80);
    expect(box?.y1).toBeGreaterThanOrEqual(70);
  });
});

describe("refitView", () => {
  const roomy = { width: 1400, height: 900 };
  const cramped = { width: 600, height: 380 };

  it("keeps_the_view_object_when_everything_is_visible", () => {
    const view = { x: 100, y: 100, zoom: 1 };
    expect(refitView(view, doc, roomy)).toBe(view);
  });

  it("zooms_out_and_centers_when_the_canvas_shrinks", () => {
    const view = { x: 100, y: 100, zoom: 1 };
    const next = refitView(view, doc, cramped);
    expect(next).not.toBe(view);
    expect(next.zoom).toBeLessThan(1);
    const box = contentBox(doc);
    if (!box) throw new Error("box");
    const scale = GRID * next.zoom;
    expect(next.x + box.x0 * scale).toBeGreaterThanOrEqual(FIT_MARGIN - 0.5);
    expect(next.x + box.x1 * scale).toBeLessThanOrEqual(cramped.width - FIT_MARGIN + 0.5);
    expect(next.y + box.y0 * scale).toBeGreaterThanOrEqual(FIT_MARGIN - 0.5);
    expect(next.y + box.y1 * scale).toBeLessThanOrEqual(cramped.height - FIT_MARGIN + 0.5);
  });

  it("never_zooms_in", () => {
    const view = { x: -5000, y: -5000, zoom: 0.5 };
    expect(refitView(view, doc, roomy).zoom).toBeLessThanOrEqual(0.5);
  });

  it("leaves_an_empty_schematic_alone", () => {
    const view = { x: 0, y: 0, zoom: 1 };
    expect(refitView(view, { parts: [], wires: [], labels: [] }, cramped)).toBe(view);
  });
});
