import { describe, expect, it } from "vitest";
import { PALETTE } from "../symbols/catalog";
import { GROUPS } from "./Palette";

describe("palette groups", () => {
  it("cover_every_palette_item_exactly_once", () => {
    const grouped = GROUPS.flatMap((g) => g.items);
    expect([...grouped].sort()).toEqual([...PALETTE].sort());
  });
});
