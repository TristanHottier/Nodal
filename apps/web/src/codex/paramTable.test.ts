import { PARAM_SPECS, type ModelKind, type ParamSpec } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { PARAM_FIELDS } from "../editor/params";
import { MODEL_PARAM_DOCS } from "./paramDocs";
import { fieldRows, modelRows } from "./paramTable";

const specs = (): Record<ModelKind, readonly ParamSpec[]> => structuredClone(PARAM_SPECS);

describe("modelRows", () => {
  it("follows the spec order", () => {
    for (const kind of Object.keys(PARAM_SPECS) as ModelKind[])
      expect(modelRows(kind).map((r) => r.key)).toEqual(PARAM_SPECS[kind].map((s) => s.key));
  });

  it("formats defaults from the spec", () => {
    const row = (kind: ModelKind, key: string) => modelRows(kind).find((r) => r.key === key);
    expect(row("NPN", "VAF")?.default).toBe("∞");
    expect(row("SW", "ROFF")?.default).toBe("1/gmin");
    expect(row("NPN", "BF")?.default).toBe("100");
    expect(row("D", "IS")?.default).toBe("10f");
    expect(row("NPN", "BF")?.unit).toBe("");
    expect(row("D", "RS")?.unit).toBe("Ω");
  });

  it("follows a changed spec", () => {
    const copy = specs();
    copy.NPN = copy.NPN.map((s) => (s.key === "BF" ? { ...s, default: 50 } : s));
    expect(modelRows("NPN", copy).find((r) => r.key === "BF")?.default).toBe("50");
  });

  it("throws on a spec key with no documentation", () => {
    const copy = specs();
    copy.D = [...copy.D, { key: "BV", default: 5, range: "positive" }];
    expect(() => modelRows("D", copy)).toThrow("undocumented parameter");
  });

  it("throws when the docs miss a key", () => {
    const docs = structuredClone(MODEL_PARAM_DOCS);
    delete docs.D.TT;
    expect(() => modelRows("D", PARAM_SPECS, docs)).toThrow("undocumented parameter");
  });
});

describe("fieldRows", () => {
  it("lists the fields with defaults, units and conditions", () => {
    const rows = fieldRows("resistor");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "value", label: "Value", unit: "Ω", default: "1k" });
    expect(rows[0]?.meaning.length).toBeGreaterThan(0);
    const src = fieldRows("vsource");
    expect(src.find((r) => r.key === "v1")?.when).toBe("Waveform = pulse");
    expect(src.find((r) => r.key === "td")?.when).toBe("Waveform = pulse or sin");
    expect(src).toHaveLength(new Set(PARAM_FIELDS.vsource.map((f) => f.key)).size);
    expect(fieldRows("ground")).toEqual([]);
  });
});
