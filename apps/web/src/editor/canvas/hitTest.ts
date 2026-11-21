// Box-select hit testing: items whose bounds lie fully inside the box.
import type { Schematic } from "@nodal/schema";
import { type Box, partBounds, transformPoint } from "../geometry";
import { LABEL_SYMBOL } from "../../symbols/catalog";

export function normalizeBox(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

const inside = (outer: Box, b: Box) =>
  b.x0 >= outer.x0 && b.x1 <= outer.x1 && b.y0 >= outer.y0 && b.y1 <= outer.y1;

export function itemsInBox(doc: Schematic, box: Box): string[] {
  const ids: string[] = [];
  for (const p of doc.parts) if (inside(box, partBounds(p))) ids.push(p.id);
  for (const l of doc.labels) {
    const { x0, y0, x1, y1 } = LABEL_SYMBOL.bounds;
    const a = transformPoint({ x: x0, y: y0 }, l.rotation, false);
    const b = transformPoint({ x: x1, y: y1 }, l.rotation, false);
    const lb: Box = {
      x0: l.x + Math.min(a.x, b.x),
      y0: l.y + Math.min(a.y, b.y),
      x1: l.x + Math.max(a.x, b.x),
      y1: l.y + Math.max(a.y, b.y),
    };
    if (inside(box, lb)) ids.push(l.id);
  }
  for (const w of doc.wires) {
    if (w.points.every((q) => q.x >= box.x0 && q.x <= box.x1 && q.y >= box.y0 && q.y <= box.y1)) {
      ids.push(w.id);
    }
  }
  return ids;
}
