// Pure rules for placing, grabbing and stepping the waveform cursors.
import type { CursorState } from "./cursors";

export type CursorId = "a" | "b";

/** Pointer distance, in CSS px, within which a cursor line can be grabbed. */
export const HIT_RADIUS_PX = 6;

/**
 * The cursor a plain click or Shift+click places. Shift always means B. Otherwise the first
 * click sets A, the second sets B, and later clicks move the cursor nearer to the click in
 * pixels (a tie moves A). `toPx` maps an x value to a pixel, so log axes work as drawn.
 */
export function cursorForClick(
  c: CursorState,
  xPx: number,
  toPx: (x: number) => number,
  shift: boolean,
): CursorId {
  if (shift) return "b";
  // A cursor with no finite pixel (a typed x <= 0 on a log axis) counts as unset.
  const pa = c.a === null ? NaN : toPx(c.a);
  const pb = c.b === null ? NaN : toPx(c.b);
  if (!Number.isFinite(pa)) return "a";
  if (!Number.isFinite(pb)) return "b";
  return Math.abs(pb - xPx) < Math.abs(pa - xPx) ? "b" : "a";
}

/** The nearest set cursor within `radiusPx` of the pointer, or null. */
export function cursorUnderPointer(
  c: CursorState,
  xPx: number,
  toPx: (x: number) => number,
  radiusPx = HIT_RADIUS_PX,
): CursorId | null {
  let best: CursorId | null = null;
  let bestDist = Infinity;
  for (const id of ["a", "b"] as const) {
    const x = c[id];
    if (x === null) continue;
    const d = Math.abs(toPx(x) - xPx);
    if (Number.isFinite(d) && d <= radiusPx && d < bestDist) {
      best = id;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Snaps `x` to the nearest sample of `axis` (ascending or descending), then moves `steps`
 * samples along the array order direction of increasing x, clamped to the ends. A null `x`
 * starts at the middle sample. An empty axis returns `x` (or 0).
 */
export function stepCursor(axis: Float64Array, x: number | null, steps: number): number {
  const n = axis.length;
  if (n === 0) return x ?? 0;
  const first = axis[0] as number;
  const last = axis[n - 1] as number;
  const ascending = first <= last;
  let at = Math.floor((n - 1) / 2);
  if (x !== null) {
    let bestDist = Infinity;
    for (let i = 0; i < n; i += 1) {
      const d = Math.abs((axis[i] as number) - x);
      if (d < bestDist) {
        bestDist = d;
        at = i;
      }
    }
  }
  // Positive steps always mean larger x, whichever way the array runs.
  const next = Math.max(0, Math.min(n - 1, at + (ascending ? steps : -steps)));
  return axis[next] as number;
}
