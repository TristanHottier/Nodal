// Connectivity predicates shared by the editor and, later, the netlister.
// Rule (ARCHITECTURE section 6.1): a pin or wire endpoint connects to another
// pin, wire endpoint, or any point of a wire, bends included. A net label
// connects to whatever lies at its anchor; label anchors never make dots.
import type { Point, Schematic, Wire } from "@nodal/schema";
import { pinPositions } from "../geometry";
import { samePoint } from "./wires";

function onSegment(p: Point, a: Point, b: Point): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return (
    cross === 0 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** True if `p` is an end, a bend, or any point along the wire (inclusive). */
export function pointOnWire(w: Wire, p: Point): boolean {
  if (w.points.length === 1) {
    const only = w.points[0];
    return only !== undefined && samePoint(only, p);
  }
  return w.points.some((a, i) => {
    const b = w.points[i + 1];
    return b !== undefined && onSegment(p, a, b);
  });
}

/** True if a pin, a net label anchor, or a wire (any point) lies at `p`. */
export function isConnectionPoint(doc: Schematic, p: Point): boolean {
  if (doc.parts.some((part) => pinPositions(part).some((pin) => samePoint(pin.at, p)))) return true;
  if (doc.labels.some((l) => samePoint({ x: l.x, y: l.y }, p))) return true;
  return doc.wires.some((w) => pointOnWire(w, p));
}
