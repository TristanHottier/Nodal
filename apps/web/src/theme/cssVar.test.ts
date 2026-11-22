import { afterEach, describe, expect, it } from "vitest";
import { readCssVar } from "./cssVar";

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

describe("readCssVar", () => {
  it("reads_a_trimmed_custom_property", () => {
    document.documentElement.style.setProperty("--color-plot-grid", "  oklch(0.9 0 0) ");
    expect(readCssVar("--color-plot-grid")).toBe("oklch(0.9 0 0)");
  });

  it("returns_empty_for_unset", () => {
    expect(readCssVar("--nope")).toBe("");
  });
});
