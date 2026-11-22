import type { Schematic } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import type { SimResult } from "../engine/results";
import { projectToNetlist } from "../netlist/netlister";
import { project } from "../netlist/testDoc";
import { LABEL_SYMBOL } from "../symbols/catalog";
import { opTags } from "./opTags";
import { dividerProject, tranResult } from "./testFixtures";

function build(doc: Schematic) {
  const map = projectToNetlist(project(doc)).map;
  if (!map) throw new Error("no map");
  return map;
}

const withValues = (vals: Record<string, number>): SimResult => ({
  type: "op",
  axis: new Float64Array(0),
  signals: Object.entries(vals).map(([name, v]) => ({
    name,
    kind: "v" as const,
    re: new Float64Array([v]),
  })),
});

describe("opTags", () => {
  it("tags_one_per_net_skip_ground", () => {
    const doc = dividerProject().schematic;
    const tags = opTags(withValues({ in: 10, out: 7.5, "0": 0 }), build(doc), doc);
    expect(tags.map((t) => t.net).sort()).toEqual(["in", "out"]);
    expect(tags.find((t) => t.net === "out")?.text).toBe("7.5 V");
    expect(tags.find((t) => t.net === "in")?.text).toBe("10 V");
  });

  it("tag_prefers_label_anchor", () => {
    const doc = dividerProject().schematic;
    const tags = opTags(withValues({ in: 10, out: 7.5 }), build(doc), doc);
    // Below the flag (bounds y1 = 1, plus 1), not on the anchor.
    expect(tags.find((t) => t.net === "in")?.at).toEqual({ x: 2, y: -1 });
    expect(tags.find((t) => t.net === "out")?.at).toEqual({ x: 10, y: 1 });
  });

  it("tags_clear_of_net_label_flags", () => {
    const doc = dividerProject().schematic;
    const tags = opTags(withValues({ in: 10, out: 7.5 }), build(doc), doc);
    const fontSize = 0.7;
    const { x0, y0, x1, y1 } = LABEL_SYMBOL.bounds;
    expect(doc.labels.length).toBeGreaterThan(0);
    for (const t of tags) {
      const w = 0.42 * fontSize * t.text.length;
      const tx0 = t.at.x + 0.3;
      const ty1 = t.at.y - 0.3;
      const ty0 = ty1 - fontSize;
      for (const l of doc.labels) {
        const hit = tx0 < l.x + x1 && tx0 + w > l.x + x0 && ty0 < l.y + y1 && ty1 > l.y + y0;
        expect(hit, `tag ${t.net} overlaps flag ${l.text}`).toBe(false);
      }
    }
  });

  it("tag_on_pin_only_net", () => {
    const doc = dividerProject().schematic;
    const bare: Schematic = { ...doc, labels: [] };
    const map = build(bare);
    const net = map.netOfWire.get(bare.wires[0]?.id ?? "") ?? "";
    const tags = opTags(withValues({ [net]: 3 }), map, bare);
    // Wire anchor: midpoint of the first segment of the first wire on that net.
    expect(tags).toHaveLength(1);
    expect(tags[0]?.at).toEqual({ x: 2, y: -3 });

    // No wires at all: the first pin of the net.
    const noWires: Schematic = { ...bare, wires: [] };
    const m2 = build(noWires);
    const pinNet = m2.netOfPin.get("r2:1") ?? "";
    const t2 = opTags(withValues({ [pinNet]: 1 }), m2, noWires);
    expect(t2).toHaveLength(1);
    expect(Number.isFinite(t2[0]?.at.x)).toBe(true);
  });

  it("non_op_result_has_no_tags", () => {
    const doc = dividerProject().schematic;
    expect(opTags(tranResult(["out"]), build(doc), doc)).toEqual([]);
  });
});
