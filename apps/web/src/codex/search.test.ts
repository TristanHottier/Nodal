import { describe, expect, it } from "vitest";
import { CODEX } from "./catalog";
import { searchCodex } from "./search";

const ids = (q: string) => searchCodex(q, CODEX).map((e) => e.id);

describe("searchCodex", () => {
  it("returns everything in catalog order for an empty query", () => {
    expect(ids("")).toEqual(CODEX.map((e) => e.id));
    expect(ids("   ")).toEqual(CODEX.map((e) => e.id));
  });

  it("finds all four transistors", () => {
    expect(ids("transistor")).toEqual(expect.arrayContaining(["npn", "pnp", "nmos", "pmos"]));
  });

  it("finds the bipolar transistors by BJT", () => {
    const found = ids("BJT");
    expect(found).toEqual(expect.arrayContaining(["npn", "pnp"]));
    expect(found).not.toContain("nmos");
  });

  it("ignores case and accents", () => {
    expect(ids("Résistance")).toContain("resistor");
    expect(ids("RESISTANCE")).toContain("resistor");
    expect(ids("resistance")).toEqual(ids("Résistance"));
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(ids("zzzqqq")).toEqual([]);
  });

  it("ranks title prefix, then title substring, then alias, then keyword", () => {
    const entries = [
      { id: "k", kind: "concept", title: "Zed", aliases: [], keywords: ["gain"], related: [] },
      {
        id: "a",
        kind: "concept",
        title: "Zed",
        aliases: ["gain stage"],
        keywords: [],
        related: [],
      },
      { id: "s", kind: "concept", title: "Unity gain", aliases: [], keywords: [], related: [] },
      { id: "p", kind: "concept", title: "Gain block", aliases: [], keywords: [], related: [] },
    ] as const;
    expect(searchCodex("gain", entries).map((e) => e.id)).toEqual(["p", "s", "a", "k"]);
  });

  it("keeps catalog order within a rank", () => {
    const entries = [
      { id: "b", kind: "concept", title: "Beta", aliases: [], keywords: [], related: [] },
      { id: "a", kind: "concept", title: "Beta two", aliases: [], keywords: [], related: [] },
    ] as const;
    expect(searchCodex("beta", entries).map((e) => e.id)).toEqual(["b", "a"]);
  });
});
