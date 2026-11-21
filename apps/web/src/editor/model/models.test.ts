import type { ProjectModel } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { addModel, removeModel, renameModel, setModelParam, setModelType } from "./models";

const d: ProjectModel = { name: "DMOD", type: "D", params: { IS: "1e-14", N: "1" } };

describe("models", () => {
  it("add_names_unique", () => {
    const a = addModel([], "D");
    expect(a.name).toBe("DMOD");
    expect(a.models).toEqual([{ name: "DMOD", type: "D", params: {} }]);
    const b = addModel(a.models, "D");
    expect(b.name).toBe("DMOD2");
    const c = addModel([{ name: "dmod3", type: "D", params: {} }, ...b.models], "D");
    expect(c.name).toBe("DMOD4");
    expect(addModel([], "SW").name).toBe("SWMOD");
    expect(addModel([], "NPN").name).toBe("NPNMOD");
  });

  it("rename", () => {
    const models = [d, { name: "Other", type: "D" as const, params: {} }];
    expect(renameModel(models, "DMOD", "Fast")[0]?.name).toBe("Fast");
    expect(renameModel(models, "DMOD", "other")).toBe(models);
    expect(renameModel(models, "DMOD", "")).toBe(models);
    expect(renameModel(models, "DMOD", "dmod")[0]?.name).toBe("dmod");
    expect(renameModel(models, "nope", "X")).toBe(models);
    expect(renameModel(models, "DMOD", "DMOD")).toBe(models);
  });

  it("type_change_drops_params", () => {
    const models = [d];
    const next = setModelType(models, "DMOD", "SW");
    expect(next[0]?.type).toBe("SW");
    expect(Object.keys(next[0]?.params ?? {})).not.toContain("IS");
    expect(setModelType(models, "DMOD", "D")).toBe(models);
    expect(setModelType(models, "nope", "SW")).toBe(models);
    const kept = setModelType(models, "DMOD", "NPN");
    expect(kept[0]?.params["IS"]).toBe("1e-14");
  });

  it("set_and_clear_param", () => {
    const a = setModelParam([d], "DMOD", "IS", " 2e-14 ");
    expect(a[0]?.params["IS"]).toBe("2e-14");
    const b = setModelParam(a, "DMOD", "IS", "");
    expect(b[0]?.params).toEqual({ N: "1" });
    expect(setModelParam([d], "DMOD", "IS", "1e-14")).toEqual([d]);
    const same = [d];
    expect(setModelParam(same, "DMOD", "IS", "1e-14")).toBe(same);
    expect(setModelParam(same, "DMOD", "zz", "")).toBe(same);
    expect(setModelParam(same, "nope", "IS", "1")).toBe(same);
  });

  it("remove", () => {
    const models = [d];
    expect(removeModel(models, "DMOD")).toEqual([]);
    expect(removeModel(models, "nope")).toBe(models);
  });
});
