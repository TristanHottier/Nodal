// Cursor readouts: interpolated trace values at two x positions.
import type { SimResult } from "../engine/results";
import { type TraceView, traceValues } from "./traces";

/** Interpolated y at x (in log10(x) when `logX`); null outside the range or next to a NaN. */
export function valueAt(
  xs: Float64Array,
  ys: Float64Array,
  x: number,
  logX: boolean,
): number | null {
  const n = xs.length;
  if (n === 0 || Number.isNaN(x)) return null;
  const first = xs[0] as number;
  const last = xs[n - 1] as number;
  if (x < first || x > last) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] as number) <= x) lo = mid;
    else hi = mid;
  }
  const x0 = xs[lo] as number;
  const x1 = xs[hi] as number;
  const y0 = ys[lo] as number;
  const y1 = ys[hi] as number;
  if (x === x0) return Number.isNaN(y0) ? null : y0;
  if (x === x1) return Number.isNaN(y1) ? null : y1;
  if (Number.isNaN(y0) || Number.isNaN(y1)) return null;
  const t = logX
    ? (Math.log10(x) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))
    : (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}

export interface Readout {
  rows: { key: string; a: number | null; b: number | null; delta: number | null }[];
  dx: number | null;
  inverseDx: number | null;
}

export function cursorReadout(
  result: SimResult,
  keys: string[],
  view: TraceView,
  a: number | null,
  b: number | null,
): Readout {
  const logX = result.type === "ac";
  const at = (ys: Float64Array, x: number | null) =>
    x === null ? null : valueAt(result.axis, ys, x, logX);
  const rows = keys.map((key) => {
    const ys = traceValues(result, key, view);
    const va = at(ys, a);
    const vb = at(ys, b);
    return { key, a: va, b: vb, delta: va !== null && vb !== null ? vb - va : null };
  });
  const dx = a !== null && b !== null ? b - a : null;
  return { rows, dx, inverseDx: dx !== null && dx !== 0 ? 1 / Math.abs(dx) : null };
}
