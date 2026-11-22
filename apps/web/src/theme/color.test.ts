// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  inSrgbGamut,
  oklabDistance,
  oklchToSrgb,
  parseOklch,
  simulateCvd,
  type Rgb,
} from "./color";

const close = (a: Rgb, b: Rgb, eps: number) => {
  a.forEach((x, i) => {
    expect(Math.abs(x - (b[i] ?? 0))).toBeLessThan(eps);
  });
};

describe("color", () => {
  it("gives 21:1 for white on black", () => {
    expect(contrastRatio([1, 1, 1], [0, 0, 0])).toBeCloseTo(21, 2);
  });

  it("maps OKLCH white and black to sRGB white and black", () => {
    close(oklchToSrgb(1, 0, 0), [1, 1, 1], 1e-4);
    close(oklchToSrgb(0, 0, 0), [0, 0, 0], 1e-4);
    expect(inSrgbGamut(oklchToSrgb(0.5, 0.4, 150))).toBe(false);
  });

  it("parses oklch() with plain and percentage lightness", () => {
    expect(parseOklch("oklch(0.62 0.19 259)")).toEqual([0.62, 0.19, 259]);
    expect(parseOklch("oklch(62% 0.19 259deg)")).toEqual([0.62, 0.19, 259]);
    expect(() => parseOklch("#fff")).toThrow();
  });

  it("leaves greys unchanged under every simulated deficiency", () => {
    for (const kind of ["protan", "deutan", "tritan"] as const) {
      close(simulateCvd([0.5, 0.5, 0.5], kind), [0.5, 0.5, 0.5], 1e-3);
    }
  });

  it("brings red and green together for deuteranopia", () => {
    const red: Rgb = [1, 0, 0];
    const green: Rgb = [0, 1, 0];
    expect(oklabDistance(simulateCvd(red, "deutan"), simulateCvd(green, "deutan"))).toBeLessThan(
      oklabDistance(red, green),
    );
  });
});
