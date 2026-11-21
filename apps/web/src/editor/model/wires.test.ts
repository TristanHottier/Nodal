import { describe, expect, it } from "vitest";
import { followEnd, normalizeWire } from "./wires";

const p = (x: number, y: number) => ({ x, y });

describe("normalizeWire", () => {
  it("normalize_drops_duplicates_and_collinear", () => {
    expect(normalizeWire([p(0, 0), p(0, 0), p(3, 0), p(6, 0), p(6, 4)])).toEqual([
      p(0, 0),
      p(6, 0),
      p(6, 4),
    ]);
  });

  it("normalize_null_when_degenerate", () => {
    expect(normalizeWire([p(1, 1), p(1, 1)])).toBeNull();
    expect(normalizeWire([p(1, 1)])).toBeNull();
    expect(normalizeWire([p(0, 0), p(4, 0), p(0, 0)])).toBeNull();
  });
});

describe("followEnd", () => {
  it("follow_horizontal_end", () => {
    expect(followEnd([p(0, 0), p(5, 0)], "end", p(5, 3))).toEqual([p(0, 0), p(5, 0), p(5, 3)]);
    expect(followEnd([p(0, 0), p(5, 0)], "end", p(8, 0))).toEqual([p(0, 0), p(8, 0)]);
  });

  it("follow_vertical_end", () => {
    expect(followEnd([p(0, 0), p(0, 5)], "end", p(4, 5))).toEqual([p(0, 0), p(0, 5), p(4, 5)]);
  });

  it("follow_start_end", () => {
    expect(followEnd([p(0, 0), p(5, 0)], "start", p(0, 3))).toEqual([p(0, 3), p(0, 0), p(5, 0)]);
  });

  it("follow_back_onto_segment_collapses", () => {
    expect(followEnd([p(0, 0), p(5, 0), p(5, 4)], "end", p(5, 0))).toEqual([p(0, 0), p(5, 0)]);
    expect(followEnd([p(0, 0), p(5, 0)], "end", p(0, 0))).toBeNull();
  });
});
