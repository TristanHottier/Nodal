import type { Part, PartType, Project, Wire } from "@nodal/schema";
import { newProject } from "@nodal/schema";

const COLUMNS = 25;
const SPACING = 10;
const TYPES: readonly PartType[] = ["resistor", "capacitor", "diode", "nmos"];
const PREFIX: Record<string, string> = { resistor: "R", capacitor: "C", diode: "D", nmos: "M" };
/** Local x of each type's top pin (y is -3 for all four types). */
const TOP_PIN_X: Record<string, number> = { resistor: 0, capacitor: 0, diode: 0, nmos: 2 };

const PARAMS: Record<string, Record<string, string>> = {
  resistor: { value: "1k" },
  capacitor: { value: "1u" },
  diode: { model: "DBENCH" },
  nmos: { model: "NBENCH", w: "", l: "" },
};

/**
 * A benchmark schematic: `parts` parts in rows of 25 on a 10-unit grid, types cycling
 * resistor, capacitor, diode, NMOS. Neighbours 2k and 2k+1 in a row share a wire between
 * their top pins, and one ground sits on the bottom pin of the first part. It netlists
 * without error diagnostics.
 */
export function bigProject(parts = 500): Project {
  const project = newProject("bench-500", "2026-11-21T00:00:00.000Z");
  const placed: Part[] = [];
  for (let i = 0; i < parts; i++) {
    const type = TYPES[i % TYPES.length] ?? "resistor";
    placed.push({
      id: `p${String(i)}`,
      type,
      name: `${PREFIX[type] ?? "X"}${String(i)}`,
      x: (i % COLUMNS) * SPACING,
      y: Math.floor(i / COLUMNS) * SPACING,
      rotation: 0,
      mirror: false,
      params: { ...PARAMS[type] },
    });
  }
  const wires: Wire[] = [];
  for (let i = 0; i + 1 < parts; i += 2) {
    const a = placed[i];
    const b = placed[i + 1];
    // A pair never straddles a row: the last column of an odd-width row stays unpaired.
    if (!a || !b || a.y !== b.y) continue;
    const y = a.y - 3;
    wires.push({
      id: `w${String(i / 2)}`,
      points: [
        { x: a.x + (TOP_PIN_X[a.type] ?? 0), y },
        { x: b.x + (TOP_PIN_X[b.type] ?? 0), y },
      ],
    });
  }
  placed.push({
    id: "gnd",
    type: "ground",
    name: "GND",
    x: 0,
    y: 3,
    rotation: 0,
    mirror: false,
    params: {},
  });
  project.schematic = { parts: placed, wires, labels: [] };
  project.models = [
    { name: "DBENCH", type: "D", params: {} },
    { name: "NBENCH", type: "NMOS", params: {} },
  ];
  return project;
}
