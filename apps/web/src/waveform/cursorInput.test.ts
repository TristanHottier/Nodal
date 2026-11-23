import { describe, expect, it } from "vitest";
import { cursorForClick, cursorUnderPointer, stepCursor } from "./cursorInput";

const linear = (x: number) => x * 10;
const log = (x: number) => Math.log10(x) * 100;
const f = (...v: number[]) => new Float64Array(v);

describe("cursorForClick", () => {
  it("empty_places_a", () => {
    expect(cursorForClick({ a: null, b: null }, 50, linear, false)).toBe("a");
  });
  it("a_only_places_b", () => {
    expect(cursorForClick({ a: 1, b: null }, 5, linear, false)).toBe("b");
  });
  it("b_only_places_a", () => {
    expect(cursorForClick({ a: null, b: 1 }, 5, linear, false)).toBe("a");
  });
  it("both_set_picks_the_nearer_cursor", () => {
    const c = { a: 2, b: 8 };
    expect(cursorForClick(c, 30, linear, false)).toBe("a");
    expect(cursorForClick(c, 70, linear, false)).toBe("b");
  });
  it("nearest_is_measured_in_log_pixels", () => {
    // A = 10, B = 1000: 200 px (log) apart, midpoint x = 100 sits at 200 px.
    const c = { a: 10, b: 1000 };
    // 300 is nearer B in pixels, though nearer A in linear distance.
    expect(cursorForClick(c, log(300), log, false)).toBe("b");
    expect(cursorForClick(c, log(30), log, false)).toBe("a");
  });
  it("shift_always_places_b", () => {
    expect(cursorForClick({ a: null, b: null }, 5, linear, true)).toBe("b");
    expect(cursorForClick({ a: 1, b: null }, 5, linear, true)).toBe("b");
    expect(cursorForClick({ a: 1, b: 2 }, 5, linear, true)).toBe("b");
  });
  it("a_cursor_without_a_finite_pixel_counts_as_unset", () => {
    expect(cursorForClick({ a: 0, b: 5 }, 30, log, false)).toBe("a");
    expect(cursorForClick({ a: 5, b: -1 }, 30, log, false)).toBe("b");
  });
  it("tie_goes_to_a", () => {
    expect(cursorForClick({ a: 2, b: 8 }, 50, linear, false)).toBe("a");
  });
});

describe("cursorUnderPointer", () => {
  const c = { a: 2, b: 8 };
  it("inside_the_radius", () => {
    expect(cursorUnderPointer(c, 24, linear)).toBe("a");
    expect(cursorUnderPointer(c, 76, linear)).toBe("b");
  });
  it("outside_the_radius_is_null", () => {
    expect(cursorUnderPointer(c, 40, linear)).toBeNull();
    expect(cursorUnderPointer(c, 27, linear)).toBeNull();
  });
  it("unset_cursors_are_ignored", () => {
    expect(cursorUnderPointer({ a: null, b: null }, 0, linear)).toBeNull();
    expect(cursorUnderPointer({ a: null, b: 8 }, 80, linear)).toBe("b");
  });
  it("nearest_wins_when_both_are_within_the_radius", () => {
    expect(cursorUnderPointer({ a: 5, b: 5.8 }, 57, linear)).toBe("b");
    expect(cursorUnderPointer({ a: 5, b: 5.8 }, 53, linear)).toBe("a");
  });
  it("a_cursor_without_a_finite_pixel_is_never_grabbed", () => {
    expect(cursorUnderPointer({ a: 0, b: null }, 0, log)).toBeNull();
  });
  it("custom_radius", () => {
    expect(cursorUnderPointer(c, 27, linear, 8)).toBe("a");
  });
});

describe("stepCursor", () => {
  const asc = f(0, 1, 2, 3, 4);
  it("moves_by_samples_on_an_ascending_axis", () => {
    expect(stepCursor(asc, 1, 2)).toBe(3);
    expect(stepCursor(asc, 3, -2)).toBe(1);
  });
  it("moves_by_samples_on_a_descending_axis", () => {
    const desc = f(4, 3, 2, 1, 0);
    // Positive steps mean larger x, as drawn: the plot shows a descending axis reversed.
    expect(stepCursor(desc, 3, 1)).toBe(4);
    expect(stepCursor(desc, 3, -1)).toBe(2);
  });
  it("clamps_at_both_ends", () => {
    expect(stepCursor(asc, 3, 10)).toBe(4);
    expect(stepCursor(asc, 1, -10)).toBe(0);
    expect(stepCursor(f(4, 3, 2), 3, -10)).toBe(2);
    expect(stepCursor(f(4, 3, 2), 3, 10)).toBe(4);
  });
  it("null_starts_at_the_middle_sample", () => {
    expect(stepCursor(asc, null, 0)).toBe(2);
    expect(stepCursor(asc, null, 1)).toBe(3);
  });
  it("snaps_a_between_samples_x_first", () => {
    expect(stepCursor(asc, 1.4, 1)).toBe(2);
    expect(stepCursor(asc, 1.6, 1)).toBe(3);
    expect(stepCursor(asc, 1.6, 0)).toBe(2);
  });
  it("snaps_from_outside_the_axis", () => {
    expect(stepCursor(asc, 99, -1)).toBe(3);
  });
  it("empty_axis_returns_the_input_or_zero", () => {
    expect(stepCursor(f(), null, 1)).toBe(0);
    expect(stepCursor(f(), 3, 1)).toBe(3);
  });
});
