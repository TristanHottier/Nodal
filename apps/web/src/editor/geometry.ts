// Grid geometry: local symbol coordinates to world grid coordinates.
import type { Part, Point, Rotation } from "@nodal/schema";
import { SYMBOLS } from "../symbols/catalog";

/** Pixels per grid unit at zoom 1. */
export const GRID = 10;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Mirror (x -> -x) first, then rotate clockwise on screen (y axis down). */
export function transformPoint(p: Point, rotation: Rotation, mirror: boolean): Point {
  const x = mirror ? -p.x : p.x;
  const y = p.y;
  // `+ 0` normalizes -0 to 0.
  switch (rotation) {
    case 0:
      return { x: x + 0, y: y + 0 };
    case 90:
      return { x: -y + 0, y: x + 0 };
    case 180:
      return { x: -x + 0, y: -y + 0 };
    case 270:
      return { x: y + 0, y: -x + 0 };
  }
}

export function rotateCw(r: Rotation): Rotation {
  switch (r) {
    case 0:
      return 90;
    case 90:
      return 180;
    case 180:
      return 270;
    case 270:
      return 0;
  }
}

/** Pin positions in world grid units, in catalog order. */
export function pinPositions(part: Part): { name: string; at: Point }[] {
  const def = SYMBOLS[part.type];
  return def.pins.map((pin) => {
    const t = transformPoint(pin, part.rotation, part.mirror);
    return { name: pin.name, at: { x: part.x + t.x, y: part.y + t.y } };
  });
}

/** Normalized world bounds. */
export function partBounds(part: Part): Box {
  const def = SYMBOLS[part.type];
  const { x0, y0, x1, y1 } = def.bounds;
  const a = transformPoint({ x: x0, y: y0 }, part.rotation, part.mirror);
  const b = transformPoint({ x: x1, y: y1 }, part.rotation, part.mirror);
  return {
    x0: part.x + Math.min(a.x, b.x),
    y0: part.y + Math.min(a.y, b.y),
    x1: part.x + Math.max(a.x, b.x),
    y1: part.y + Math.max(a.y, b.y),
  };
}
