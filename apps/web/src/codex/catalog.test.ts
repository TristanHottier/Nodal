import { MODEL_KINDS, PARAM_SPECS } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { PARAM_FIELDS } from "../editor/params";
import { EXAMPLES } from "../examples";
import { PALETTE } from "../symbols/catalog";
import { CODEX, entryForItem } from "./catalog";
import { FIELD_DOCS, MODEL_PARAM_DOCS } from "./paramDocs";

const parts = CODEX.filter((e) => e.kind === "part");
const ids = new Set(CODEX.map((e) => e.id));
/** Parts with no example yet; Task 6 adds the examples and their tryIt. */
const NO_EXAMPLE_YET = ["isource", "vcvs", "vccs", "ccvs", "cccs", "pnp", "switch"];

describe("codex catalog", () => {
  it("has one part entry per palette item", () => {
    expect(parts.map((e) => e.item).sort()).toEqual([...PALETTE].sort());
    expect(parts.map((e) => e.id).sort()).toEqual([...PALETTE].sort());
    for (const item of PALETTE) expect(entryForItem(item).item).toBe(item);
  });

  it("has four analyses and four concepts", () => {
    const analyses = CODEX.filter((e) => e.kind === "analysis");
    expect(analyses.map((e) => e.analysis)).toEqual(["op", "dc", "ac", "tran"]);
    expect(analyses.map((e) => e.id)).toEqual([
      "operating-point",
      "dc-sweep",
      "ac-analysis",
      "transient",
    ]);
    expect(CODEX.filter((e) => e.kind === "concept").map((e) => e.id)).toEqual([
      "mna",
      "convergence",
      "small-signal",
      "integration",
    ]);
    expect(CODEX).toHaveLength(26);
  });

  it("orders parts, then analyses, then concepts", () => {
    const rank = { part: 0, analysis: 1, concept: 2 } as const;
    const ranks = CODEX.map((e) => rank[e.kind]);
    expect(ranks).toEqual([...ranks].sort());
  });

  it("has unique kebab-case ids and non-empty titles", () => {
    expect(ids.size).toBe(CODEX.length);
    for (const e of CODEX) {
      expect(e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(e.title.length).toBeGreaterThan(0);
    }
  });

  it("only relates to entries that exist", () => {
    for (const e of CODEX)
      for (const r of e.related) expect(ids.has(r), `${e.id} -> ${r}`).toBe(true);
  });

  it("sets model exactly for the parts with a model card", () => {
    const withModel = parts.filter((e) => e.model !== undefined).map((e) => e.id);
    expect(withModel).toEqual(["diode", "npn", "pnp", "nmos", "pmos", "switch"]);
    for (const e of parts) {
      if (e.model === undefined || e.item === undefined || e.item === "label") continue;
      const field = PARAM_FIELDS[e.item].find((f) => f.key === "model");
      expect(field?.modelTypes).toEqual([e.model]);
    }
  });

  it("makes transistor and MOSFET findable by alias", () => {
    const has = (word: string) =>
      parts
        .filter((e) => [e.title, ...e.aliases].some((a) => a.toLowerCase() === word))
        .map((e) => e.id);
    expect(has("transistor").sort()).toEqual(["nmos", "npn", "pmos", "pnp"]);
    expect(has("bjt").sort()).toEqual(["npn", "pnp"]);
    expect(has("mosfet").sort()).toEqual(["nmos", "pmos"]);
  });

  describe("tryIt", () => {
    const withExample = parts.filter((e) => !NO_EXAMPLE_YET.includes(e.id));
    it.each(withExample.map((e) => [e.id, e] as const))("%s names an example with it", (_id, e) => {
      const ex = EXAMPLES.find((x) => x.id === e.tryIt);
      expect(ex, `example ${String(e.tryIt)}`).toBeDefined();
      const schematic = ex?.load().schematic;
      if (e.item === "label") expect(schematic?.labels.length).toBeGreaterThan(0);
      else expect(schematic?.parts.some((p) => p.type === e.item)).toBe(true);
    });
    for (const id of NO_EXAMPLE_YET) it.todo(`${id} names an example with it (Task 6)`);

    it("uses real example ids on analyses", () => {
      for (const e of CODEX.filter((x) => x.kind !== "part" && x.tryIt !== undefined))
        expect(EXAMPLES.some((x) => x.id === e.tryIt)).toBe(true);
    });
  });
});

describe("parameter docs", () => {
  it.each(MODEL_KINDS)("MODEL_PARAM_DOCS.%s covers PARAM_SPECS both ways", (kind) => {
    expect(Object.keys(MODEL_PARAM_DOCS[kind]).sort()).toEqual(
      PARAM_SPECS[kind].map((s) => s.key).sort(),
    );
    for (const doc of Object.values(MODEL_PARAM_DOCS[kind])) {
      expect(doc.meaning.length).toBeGreaterThan(0);
      expect(typeof doc.unit).toBe("string");
    }
  });

  it.each(Object.keys(PARAM_FIELDS) as (keyof typeof PARAM_FIELDS)[])(
    "FIELD_DOCS.%s covers PARAM_FIELDS both ways",
    (type) => {
      const keys = [...new Set(PARAM_FIELDS[type].map((f) => f.key))].sort();
      expect(Object.keys(FIELD_DOCS[type]).sort()).toEqual(keys);
      for (const text of Object.values(FIELD_DOCS[type])) expect(text.length).toBeGreaterThan(0);
    },
  );
});
