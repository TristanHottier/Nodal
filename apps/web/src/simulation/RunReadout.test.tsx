import { describe, expect, it } from "vitest";
import { formatElapsed } from "./RunReadout";

describe("formatElapsed", () => {
  it("uses ms below one second and seconds above", () => {
    expect(formatElapsed(0.2)).toBe("1 ms");
    expect(formatElapsed(38.4)).toBe("38 ms");
    expect(formatElapsed(1234)).toBe("1.2 s");
  });
});
