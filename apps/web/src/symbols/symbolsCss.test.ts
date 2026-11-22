// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STROKE } from "./stroke";

const css = readFileSync(new URL("./symbols.css", import.meta.url), "utf8");

describe("symbols.css", () => {
  it("keeps symbol strokes thin at any zoom", () => {
    expect(css).toContain(`.${STROKE.className}`);
    expect(css).toMatch(/:is\(path, line, circle, rect, polyline, polygon, ellipse\)/);
    expect(css).toMatch(/vector-effect:\s*non-scaling-stroke/);
  });
});
