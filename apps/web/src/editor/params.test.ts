import { PART_TYPES, type Part } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { parseValue } from "../netlist/value";
import { SYMBOLS } from "../symbols/catalog";
import { PARAM_FIELDS, paramValue } from "./params";

function part(type: Part["type"], params: Record<string, string> = {}): Part {
  return { id: "p1", type, name: "X1", x: 0, y: 0, rotation: 0, mirror: false, params };
}

describe("PARAM_FIELDS", () => {
  it("every_part_type_has_fields", () => {
    expect(Object.keys(PARAM_FIELDS).sort()).toEqual([...PART_TYPES].sort());
  });

  it("defaults_parse", () => {
    for (const type of PART_TYPES) {
      for (const f of PARAM_FIELDS[type]) {
        const d = paramValue(part(type), f.key);
        if (f.kind === "number" || f.kind === "optionalNumber") {
          if (d !== "") expect(parseValue(d).ok, `${type}.${f.key}=${d}`).toBe(true);
        } else if (f.kind === "choice") {
          expect(d === "" || f.choices?.includes(d), `${type}.${f.key}`).toBe(true);
        } else if (f.kind === "modelRef" || f.kind === "sourceRef") {
          expect(d).toBe("");
        }
      }
      for (const [k, v] of Object.entries(SYMBOLS[type].defaultParams)) {
        if (v === "") continue;
        expect(parseValue(v).ok, `${type}.${k}=${v}`).toBe(true);
      }
    }
  });

  it("param_value_falls_back_to_default", () => {
    expect(paramValue(part("resistor"), "value")).toBe("1k");
    expect(paramValue(part("resistor", { value: "" }), "value")).toBe("");
    expect(paramValue(part("resistor", { value: "2k" }), "value")).toBe("2k");
    expect(paramValue(part("vsource"), "wave")).toBe("none");
    expect(paramValue(part("vsource"), "td")).toBe("");
    expect(paramValue(part("opamp"), "gain")).toBe("1e6");
  });

  it("gated_fields_share_td", () => {
    const tds = PARAM_FIELDS.vsource.filter((f) => f.key === "td");
    expect(tds.map((f) => f.when?.equals).sort()).toEqual(["pulse", "sin"]);
  });
});
