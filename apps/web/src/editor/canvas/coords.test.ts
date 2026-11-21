import { describe, expect, it } from "vitest";
import { GRID } from "../geometry";
import { MAX_ZOOM, MIN_ZOOM } from "../store";
import { screenToWorld, snap, zoomAt } from "./coords";

const rect = { left: 12, top: 30 };

describe("coords", () => {
  it("screen_to_grid_at_zoom_extremes", () => {
    for (const zoom of [0.25, 8]) {
      const view = { x: 37, y: -53, zoom };
      const client = {
        x: rect.left + view.x + 12 * GRID * zoom,
        y: rect.top + view.y + -4 * GRID * zoom,
      };
      const w = screenToWorld(client, rect, view);
      expect(w.x).toBeCloseTo(12, 9);
      expect(w.y).toBeCloseTo(-4, 9);
      expect(snap(w)).toEqual({ x: 12, y: -4 });
    }
  });

  it("snap_rounds_each_axis", () => {
    expect(snap({ x: 2.4, y: -2.6 })).toEqual({ x: 2, y: -3 });
  });

  it("zoom_at_keeps_cursor_fixed", () => {
    const view = { x: 37, y: -53, zoom: 1.3 };
    const client = { x: 200, y: 150 };
    const before = screenToWorld(client, rect, view);
    for (const factor of [1.1, 1 / 1.1, 100, 0.001]) {
      const next = zoomAt(view, client, rect, factor);
      const after = screenToWorld(client, rect, next);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it("zoom_at_clamps", () => {
    const view = { x: 0, y: 0, zoom: 1 };
    const c = { x: 5, y: 5 };
    expect(zoomAt(view, c, rect, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(view, c, rect, 0.0001).zoom).toBe(MIN_ZOOM);
  });
});
