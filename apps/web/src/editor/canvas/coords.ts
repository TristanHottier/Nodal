// Screen <-> world conversion. `view.x/y` is the screen offset (px, relative to
// the svg's bounding rect) of the grid origin: screen = view + world * GRID * zoom.
import type { Point } from "@nodal/schema";
import { GRID } from "../geometry";
import { MAX_ZOOM, MIN_ZOOM, type View } from "../store";

export interface ClientRect {
  left: number;
  top: number;
}

/** Client pixel to world grid units, unrounded. */
export function screenToWorld(client: Point, rect: ClientRect, view: View): Point {
  const scale = GRID * view.zoom;
  return {
    x: (client.x - rect.left - view.x) / scale,
    y: (client.y - rect.top - view.y) / scale,
  };
}

export function snap(p: Point): Point {
  // `+ 0` normalizes -0 to 0.
  return { x: Math.round(p.x) + 0, y: Math.round(p.y) + 0 };
}

/** Zooms by `factor` keeping the world point under `client` fixed; zoom is clamped first. */
export function zoomAt(view: View, client: Point, rect: ClientRect, factor: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const world = screenToWorld(client, rect, view);
  const scale = GRID * zoom;
  return {
    zoom,
    x: client.x - rect.left - world.x * scale,
    y: client.y - rect.top - world.y * scale,
  };
}
