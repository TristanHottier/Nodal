// Wire polyline helpers. Wires stay orthogonal: following a moved end adds a bend.
import type { Point } from "@nodal/schema";

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

/** Drops repeated and collinear middle points; `null` if fewer than two points remain. */
export function normalizeWire(points: readonly Point[]): Point[] | null {
  let cur = points.map((p) => ({ x: p.x, y: p.y }));
  for (;;) {
    const next: Point[] = [];
    for (const p of cur) {
      const last = next[next.length - 1];
      if (last && same(last, p)) continue;
      const prev = next[next.length - 2];
      if (prev && last && cross(prev, last, p) === 0) next.pop();
      next.push(p);
    }
    if (next.length === cur.length) {
      cur = next;
      break;
    }
    cur = next;
  }
  return cur.length >= 2 ? cur : null;
}

/**
 * Moves one end of the wire to `to`. The end segment keeps its direction, so a
 * bend is inserted instead of a diagonal. `null` if the wire collapses.
 */
export function followEnd(
  points: readonly Point[],
  end: "start" | "end",
  to: Point,
): Point[] | null {
  const pts = end === "start" ? [...points].reverse() : [...points];
  const n = pts.length;
  const e = pts[n - 1];
  const nb = pts[n - 2];
  if (!e || !nb) return null;
  const horizontal = e.y === nb.y;
  const bend: Point = horizontal ? { x: to.x, y: nb.y } : { x: nb.x, y: to.y };
  const moved = [...pts.slice(0, n - 1), bend, { x: to.x, y: to.y }];
  const result = normalizeWire(moved);
  if (!result) return null;
  return end === "start" ? result.reverse() : result;
}
