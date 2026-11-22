import { describe, expect, it } from "vitest";
import { projectToNetlist } from "../netlist/netlister";
import { bigProject } from "./bigProject";

describe("bigProject", () => {
  it("big_project_has_500_parts_and_netlists", () => {
    const p = bigProject();
    const parts = p.schematic.parts.filter((x) => x.type !== "ground");
    expect(parts).toHaveLength(500);
    expect(p.schematic.parts.filter((x) => x.type === "ground")).toHaveLength(1);
    expect(new Set(parts.map((x) => x.type))).toEqual(
      new Set(["resistor", "capacitor", "diode", "nmos"]),
    );
    expect(p.schematic.wires.length).toBeGreaterThanOrEqual(240);
    const r = projectToNetlist(p);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.ir).not.toBeNull();
  });
});
