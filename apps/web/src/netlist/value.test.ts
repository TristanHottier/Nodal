import { describe, expect, it } from "vitest";
import { parsePwl, parseValue } from "./value";

function ok(text: string): number {
  const r = parseValue(text);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("parseValue", () => {
  it("plain_numbers", () => {
    expect(ok("5")).toBe(5);
    expect(ok("-2.5")).toBe(-2.5);
    expect(ok(".5")).toBe(0.5);
    expect(ok("1e3")).toBe(1000);
    expect(ok("+1E-3")).toBe(1e-3);
    expect(ok("  7 ")).toBe(7);
  });

  it("suffix_values_are_correctly_rounded", () => {
    expect(ok("10u")).toBe(1e-5);
    expect(ok("4.7k")).toBe(4700);
    expect(ok("100n")).toBe(1e-7);
    expect(ok("2.2µ")).toBe(2.2e-6);
    expect(ok("2.2μ")).toBe(2.2e-6);
    expect(ok("1M")).toBe(1e6);
    expect(ok("1m")).toBe(1e-3);
    expect(ok("1meg")).toBe(1e6);
    expect(ok("1Meg")).toBe(1e6);
    expect(ok("1T")).toBe(1e12);
    expect(ok("1G")).toBe(1e9);
    expect(ok("3f")).toBe(3e-15);
    expect(ok("2p")).toBe(2e-12);
    expect(ok("-1.5k")).toBe(-1500);
  });

  it("rejects", () => {
    for (const bad of ["", "1MEG", "1e3k", "4,7k", "1 k", "k", "1kk", "1e999"]) {
      const r = parseValue(bad);
      expect(r.ok, bad).toBe(false);
    }
    const r = parseValue("4,7k");
    expect(!r.ok && r.error).toContain("4,7k");
  });
});

describe("parsePwl", () => {
  it("pwl_pairs", () => {
    const r = parsePwl("0 0; 1m 5\n2m 0");
    expect(r).toEqual({
      ok: true,
      points: [
        [0, 0],
        [1e-3, 5],
        [2e-3, 0],
      ],
    });
  });

  it("pwl_rejects_odd_count", () => {
    expect(parsePwl("0 0; 1m").ok).toBe(false);
    expect(parsePwl("0 0 1").ok).toBe(false);
    expect(parsePwl("").ok).toBe(false);
    expect(parsePwl(" ; \n ").ok).toBe(false);
    const r = parsePwl("0 0; 1m x");
    expect(!r.ok && r.error).toContain("1m x");
  });
});
