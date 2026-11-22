export interface Rgb8 {
  r: number;
  g: number;
  b: number;
}

export interface ColorRefs {
  dominant: Rgb8;
  secondary: Rgb8;
  accent: Rgb8;
}

export interface ColorShares {
  dominant: number;
  secondary: number;
  accent: number;
  /** Pixels that matched one of the three refs. */
  classified: number;
}

/**
 * Share of the classified pixels that match each ref, a pixel matching when every channel is
 * within `tolerance`. Self-contained (no imports, no outer references) because Playwright
 * serializes it into the page through `page.evaluate`.
 */
export function colorShares(
  pixels: Uint8ClampedArray,
  refs: ColorRefs,
  tolerance = 6,
): ColorShares {
  const list = [refs.dominant, refs.secondary, refs.accent];
  const counts = [0, 0, 0];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    for (let k = 0; k < 3; k++) {
      const ref = list[k];
      if (
        ref !== undefined &&
        Math.abs(r - ref.r) <= tolerance &&
        Math.abs(g - ref.g) <= tolerance &&
        Math.abs(b - ref.b) <= tolerance
      ) {
        counts[k] = (counts[k] ?? 0) + 1;
        break;
      }
    }
  }
  const [d = 0, s = 0, a = 0] = counts;
  const classified = d + s + a;
  const share = (n: number) => (classified === 0 ? 0 : n / classified);
  return { dominant: share(d), secondary: share(s), accent: share(a), classified };
}
