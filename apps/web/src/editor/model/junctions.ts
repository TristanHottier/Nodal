// Junction dots: where three or more connections meet at one grid point.
import type { Point, Schematic } from "@nodal/schema";
import { pinPositions } from "../geometry";
import { pointOnWire } from "./connectivity";
import { samePoint } from "./wires";

const key = (p: Point): string => `${String(p.x)},${String(p.y)}`;

/**
 * Points that get a junction dot, sorted by x then y. A point is examined only
 * if a wire ends or a pin sits on it. Degree = wire ends + pins + 2 per wire
 * passing through (each wire counted once; a wire with an end there adds only
 * its ends). Dot when degree >= 3. Labels do not count.
 */
export function junctionDots(doc: Schematic): Point[] {
  const candidates = new Map<string, Point>();
  const ends = new Map<string, number>();
  const addEnd = (p: Point) => {
    const k = key(p);
    candidates.set(k, { x: p.x, y: p.y });
    ends.set(k, (ends.get(k) ?? 0) + 1);
  };
  for (const w of doc.wires) {
    const first = w.points[0];
    const last = w.points[w.points.length - 1];
    if (first) addEnd(first);
    if (last) addEnd(last);
  }
  for (const part of doc.parts) {
    for (const pin of pinPositions(part)) {
      const k = key(pin.at);
      candidates.set(k, { x: pin.at.x, y: pin.at.y });
      ends.set(k, (ends.get(k) ?? 0) + 1);
    }
  }
  const dots: Point[] = [];
  for (const [k, pt] of candidates) {
    let degree = ends.get(k) ?? 0;
    for (const w of doc.wires) {
      const first = w.points[0];
      const last = w.points[w.points.length - 1];
      const hasEnd = (first && samePoint(first, pt)) || (last && samePoint(last, pt));
      if (!hasEnd && pointOnWire(w, pt)) degree += 2;
    }
    if (degree >= 3) dots.push(pt);
  }
  return dots.sort((a, b) => a.x - b.x || a.y - b.y);
}
