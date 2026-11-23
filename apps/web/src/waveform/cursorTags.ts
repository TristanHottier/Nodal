// Placement of the A and B tags on the plot. Pure geometry, so the collision rule is unit-tested.

/** Where a tag goes: the left edge in the same unit as the inputs, and the row (0 is the top). */
export interface TagRect {
  left: number;
  row: 0 | 1;
}

/** The gap between a cursor line and its tag. */
export const TAG_GAP = 2;

/**
 * Places the tags of cursors A and B. Each prefers the right of its line and falls to the left when the
 * right has no room. If the two tags would collide, or a tag would cover the other cursor's line, they go to the outer sides (the left cursor's tag on
 * its left, the right cursor's tag on its right; at equal positions A is right and B left). If that does
 * not fit either, B moves down one row. Both letters stay readable at any separation.
 *
 * @param px Cursor line positions, or null for an unset cursor.
 * @param width Tag width.
 * @param plot Left edge and width of the plot area.
 */
export function placeCursorTags(
  px: { a: number | null; b: number | null },
  width: number,
  plot: { left: number; width: number },
  gap: number = TAG_GAP,
): { a: TagRect | null; b: TagRect | null } {
  const right = plot.left + plot.width;
  const fits = (left: number) => left >= plot.left && left + width <= right;
  const onRight = (x: number) => x + gap;
  const onLeft = (x: number) => x - gap - width;
  const preferred = (x: number) => (fits(onRight(x)) || !fits(onLeft(x)) ? onRight(x) : onLeft(x));
  const hit = (p: TagRect, q: TagRect) =>
    p.row === q.row && p.left < q.left + width && q.left < p.left + width;
  const rect = (left: number): TagRect => ({ left, row: 0 });
  const { a, b } = px;
  if (a === null || b === null) {
    return { a: a === null ? null : rect(preferred(a)), b: b === null ? null : rect(preferred(b)) };
  }
  const covers = (r: TagRect, line: number) => r.left <= line && line <= r.left + width;
  const pa = rect(preferred(a));
  const pb = rect(preferred(b));
  // Collision means a tag over the other tag or over the other cursor's line.
  if (!hit(pa, pb) && !covers(pa, b) && !covers(pb, a)) return { a: pa, b: pb };
  // Outer sides: the tags then sit away from each other whatever the separation.
  const aLeft = a < b;
  const oa = rect(aLeft ? onLeft(a) : onRight(a));
  const ob = rect(aLeft ? onRight(b) : onLeft(b));
  if (fits(oa.left) && fits(ob.left) && !hit(oa, ob)) return { a: oa, b: ob };
  // No room on the outside (the cursors sit at the plot edges): stack B under A.
  return { a: pa, b: { left: pb.left, row: 1 } };
}
