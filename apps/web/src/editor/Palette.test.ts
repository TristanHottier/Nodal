import { describe, expect, it } from "vitest";
import { PALETTE } from "../symbols/catalog";
import { entryForItem } from "../codex/catalog";
import { aboutButtonName, GROUPS } from "./Palette";

describe("palette groups", () => {
  it("cover_every_palette_item_exactly_once", () => {
    const grouped = GROUPS.flatMap((g) => g.items);
    expect([...grouped].sort()).toEqual([...PALETTE].sort());
  });
});

describe("palette info buttons", () => {
  it("name_every_item_About_plus_its_full_name", () => {
    expect(aboutButtonName("diode")).toBe("About Diode");
    expect(aboutButtonName("label")).toBe("About net label");
    expect(aboutButtonName("opamp")).toBe("About Operational amplifier");
  });

  it("have_a_codex_entry_for_every_item", () => {
    for (const item of PALETTE) expect(entryForItem(item).item).toBe(item);
  });
});
