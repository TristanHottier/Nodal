import { describe, expect, it } from "vitest";
import { placeCursorTags, type TagRect } from "./cursorTags";

const W = 15;
const PLOT = { left: 0, width: 400 };
const overlap = (p: TagRect, q: TagRect) =>
  p.left < q.left + W && q.left < p.left + W && p.row === q.row;

describe("placeCursorTags", () => {
  it("puts a lone tag on the right of its line when there is room", () => {
    const t = placeCursorTags({ a: 100, b: null }, W, PLOT);
    expect(t.a).toEqual({ left: 102, row: 0 });
    expect(t.b).toBeNull();
  });

  it("puts a tag on the left when the right side has no room", () => {
    const t = placeCursorTags({ a: 395, b: null }, W, PLOT);
    expect(t.a?.left).toBe(395 - 2 - W);
  });

  it("never overlaps the two tags at any separation, including 0", () => {
    for (const x of [100, 0, 399, 1, 398]) {
      for (const sep of [0, 1, 3, 6, 10, 14, 17, 19, 20, 25, 40]) {
        for (const [a, b] of [
          [x, x + sep],
          [x + sep, x],
        ]) {
          if (a === undefined || b === undefined || a > 400 || b > 400) continue;
          const t = placeCursorTags({ a, b }, W, PLOT);
          if (t.a === null || t.b === null) throw new Error("both tags expected");
          expect(overlap(t.a, t.b), `a=${String(a)} b=${String(b)}`).toBe(false);
        }
      }
    }
  });

  it("moves the tags to the outer sides when the tags would collide", () => {
    const t = placeCursorTags({ a: 100, b: 106 }, W, PLOT);
    // The left cursor's tag goes left and the right cursor's tag goes right.
    expect(t.a).toEqual({ left: 100 - 2 - W, row: 0 });
    expect(t.b).toEqual({ left: 108, row: 0 });
  });

  it("stacks B under A when neither side is free", () => {
    const narrow = { left: 0, width: W + 7 };
    const t = placeCursorTags({ a: 11, b: 11 }, W, narrow);
    expect(t.b?.row).toBe(1);
  });

  it("keeps B beside its line when A is far away", () => {
    const t = placeCursorTags({ a: 50, b: 300 }, W, PLOT);
    expect(t.b).toEqual({ left: 302, row: 0 });
  });
});
