import { parseNetlist, type Netlist } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { compareNetlists } from "./equivalence";

function make(over: Record<string, unknown> = {}): Netlist {
  const r = parseNetlist({
    irVersion: 1,
    title: "t",
    elements: [
      { kind: "V", name: "V1", nodes: ["in", "0"], dc: 10 },
      { kind: "R", name: "R1", nodes: ["in", "out"], value: 1000 },
      { kind: "R", name: "R2", nodes: ["out", "0"], value: 3000 },
    ],
    analyses: [{ type: "op" }],
    ...over,
  });
  if (!r.ok) throw new Error(r.issues.join("; "));
  return r.value;
}

describe("compareNetlists", () => {
  it("identical_is_equal", () => {
    expect(compareNetlists(make(), make())).toEqual([]);
  });

  it("renamed_nodes_are_equal", () => {
    const b = make({
      elements: [
        { kind: "V", name: "V1", nodes: ["N001", "0"], dc: 10 },
        { kind: "R", name: "R1", nodes: ["N001", "N002"], value: 1000 },
        { kind: "R", name: "R2", nodes: ["N002", "0"], value: 3000 },
      ],
    });
    expect(compareNetlists(make(), b)).toEqual([]);
  });

  it("non_bijective_renaming_differs", () => {
    const a = make({
      elements: [
        { kind: "V", name: "V1", nodes: ["in", "0"], dc: 10 },
        { kind: "R", name: "R1", nodes: ["in", "mid"], value: 1000 },
        { kind: "R", name: "R2", nodes: ["mid", "out"], value: 1000 },
        { kind: "R", name: "R3", nodes: ["out", "0"], value: 1000 },
      ],
    });
    const b = make({
      elements: [
        { kind: "V", name: "V1", nodes: ["x", "0"], dc: 10 },
        { kind: "R", name: "R1", nodes: ["x", "y"], value: 1000 },
        { kind: "R", name: "R2", nodes: ["y", "x"], value: 1000 },
        { kind: "R", name: "R3", nodes: ["x", "0"], value: 1000 },
      ],
    });
    const diffs = compareNetlists(a, b);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.join("\n")).toContain("R2");
  });

  it("ground_must_map_to_ground", () => {
    const b = make({
      elements: [
        { kind: "V", name: "V1", nodes: ["0", "in"], dc: 10 },
        { kind: "R", name: "R1", nodes: ["0", "out"], value: 1000 },
        { kind: "R", name: "R2", nodes: ["out", "in"], value: 3000 },
      ],
    });
    expect(compareNetlists(make(), b).join("\n")).toContain("V1");
  });

  it("value_difference_reported", () => {
    const b = make({
      elements: [
        { kind: "V", name: "V1", nodes: ["in", "0"], dc: 10 },
        { kind: "R", name: "R1", nodes: ["in", "out"], value: 1000 },
        { kind: "R", name: "R2", nodes: ["out", "0"], value: 3001 },
      ],
    });
    const diffs = compareNetlists(make(), b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain("R2");
    expect(diffs[0]).toContain("value");
  });

  it("element_order_ignored", () => {
    const a = make();
    const b = make({
      elements: [...a.elements].reverse(),
    });
    expect(compareNetlists(a, b)).toEqual([]);
  });

  it("missing_and_extra_elements_reported", () => {
    const b = make({
      elements: [
        { kind: "V", name: "V1", nodes: ["in", "0"], dc: 10 },
        { kind: "R", name: "R1", nodes: ["in", "out"], value: 1000 },
        { kind: "R", name: "R9", nodes: ["out", "0"], value: 3000 },
      ],
    });
    const text = compareNetlists(make(), b).join("\n");
    expect(text).toContain("R2");
    expect(text).toContain("R9");
  });

  it("missing_model_reported", () => {
    const withModel = make({
      elements: [
        { kind: "V", name: "V1", nodes: ["a", "0"], dc: 1 },
        { kind: "D", name: "D1", nodes: ["a", "0"], model: "DM" },
      ],
      models: [{ name: "DM", type: "D", params: { IS: 1e-14 } }],
    });
    const other = make({
      elements: [
        { kind: "V", name: "V1", nodes: ["a", "0"], dc: 1 },
        { kind: "D", name: "D1", nodes: ["a", "0"], model: "DM" },
      ],
      models: [{ name: "DM", type: "D", params: { IS: 2e-14 } }],
    });
    expect(compareNetlists(withModel, other).join("\n")).toContain("DM");
    expect(compareNetlists(withModel, { ...other, models: [] }).join("\n")).toContain("DM");
  });

  it("analyses_and_options_compared", () => {
    const b = make({ analyses: [{ type: "dc", source: "V1", start: 0, stop: 1, step: 0.5 }] });
    expect(compareNetlists(make(), b).join("\n")).toContain("analyses");
    const c = make({ options: { reltol: 1e-6 } });
    expect(compareNetlists(make(), c).join("\n")).toContain("options");
  });

  it("title_compared", () => {
    expect(compareNetlists(make(), make({ title: "other" })).join("\n")).toContain("title");
  });
});
