// Frequency count of an AC sweep. Mirrors `ac_frequencies` in
// crates/nodal-engine/src/ir/mod.rs, which follows ngspice
// `src/spicelib/analysis/acan.c`. Only the number of points is needed here.

export type AcSweep = "lin" | "dec" | "oct";

/**
 * Number of frequencies of the sweep, or `null` when the arguments do not
 * describe a sweep or it has more than `limit` points.
 */
export function acFrequencyCount(
  sweep: AcSweep,
  points: number,
  fstart: number,
  fstop: number,
  reltol: number,
  limit: number,
): number | null {
  if (!(points >= 1) || !Number.isFinite(fstart) || !Number.isFinite(fstop)) return null;
  if (!Number.isFinite(reltol)) return null;
  let delta: number;
  if (sweep === "lin") {
    // ngspice stops after the first frequency for one point or an empty range.
    if (points === 1 || fstart === fstop) return 1;
    return points > limit ? null : points;
  } else if (sweep === "dec") {
    if (fstart <= 0 || fstop <= 0) return null;
    if (fstop / 10 < fstart) {
      delta = fstop === fstart ? 1 : Math.exp(Math.log(10) / points);
    } else {
      const steps = Math.floor(Math.abs(Math.log10(fstop / fstart)) * points);
      delta = Math.exp(Math.log(fstop / fstart) / steps);
    }
  } else {
    if (fstart <= 0) return null;
    delta = Math.exp(Math.log(2) / points);
  }
  if (!Number.isFinite(delta)) return null;
  const tol = delta * fstop * reltol;
  let count = 0;
  let f = fstart;
  while (f <= fstop + tol) {
    if (count >= limit) return null;
    count += 1;
    if (delta === 1) break;
    f *= delta;
  }
  return count;
}
