import type { Schematic } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import type { CircuitMap } from "../netlist/netlister";
import { errorTargets } from "./errorTargets";

const doc: Schematic = {
  parts: [],
  wires: [
    {
      id: "w1",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    },
    {
      id: "w2",
      points: [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    },
    {
      id: "w3",
      points: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ],
    },
    {
      id: "wg",
      points: [
        { x: 9, y: 9 },
        { x: 9, y: 8 },
      ],
    },
  ],
  labels: [
    { id: "L1", text: "out", x: 0, y: 0, rotation: 0 },
    { id: "L2", text: "x", x: 5, y: 5, rotation: 0 },
  ],
};

const map: CircuitMap = {
  partOfElement: new Map([
    ["V1", "pV1"],
    ["V2", "pV2"],
    ["D1", "pD1"],
    ["EU1", "pU1"],
  ]),
  netOfPin: new Map([
    ["pV1:p", "a"],
    ["pR1:1", "a"],
    ["pR2:1", "lonely"],
    ["pR3:2", "lonely"],
    ["pV1:n", "0"],
  ]),
  netOfWire: new Map([
    ["w1", "a"],
    ["w2", "a"],
    ["w3", "b"],
    ["wg", "0"],
  ]),
  netOfLabel: new Map([
    ["L1", "a"],
    ["L2", "b"],
  ]),
};

const info = (elements: string[], nodes: string[]) => ({ message: "m", elements, nodes });

describe("errorTargets", () => {
  it("floating_node_highlights_its_wires", () => {
    const t = errorTargets(info([], ["a"]), map, doc);
    expect(t).toEqual({ partIds: [], wireIds: ["w1", "w2"], labelIds: ["L1"] });
  });

  it("source_loop_highlights_parts", () => {
    const t = errorTargets(info(["v2", "V1", "V1"], []), map, doc);
    expect(t).toEqual({ partIds: ["pV1", "pV2"], wireIds: [], labelIds: [] });
  });

  it("opamp_and_internal_names_map_to_parts", () => {
    const t = errorTargets(info(["EU1"], ["D1#internal"]), map, doc);
    expect(t.partIds).toEqual(["pD1", "pU1"]);
    expect(t.wireIds).toEqual([]);
  });

  it("pin_only_net_highlights_parts", () => {
    const t = errorTargets(info([], ["lonely"]), map, doc);
    expect(t).toEqual({ partIds: ["pR2", "pR3"], wireIds: [], labelIds: [] });
  });

  it("ground_never_highlighted", () => {
    const t = errorTargets(info([], ["0"]), map, doc);
    expect(t).toEqual({ partIds: [], wireIds: [], labelIds: [] });
  });
});
