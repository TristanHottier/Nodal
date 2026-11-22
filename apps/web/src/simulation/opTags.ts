// Operating-point voltage tags: where on the schematic each net's voltage is drawn.
import type { Point, Schematic } from "@nodal/schema";
import type { SimResult } from "../engine/results";
import { pinPositions } from "../editor/geometry";
import type { CircuitMap } from "../netlist/netlister";
import { formatQuantity } from "../netlist/value";

export interface OpTag {
  net: string;
  at: Point;
  text: string;
}

const GROUND = "0";

function anchorOf(net: string, map: CircuitMap, doc: Schematic): Point | null {
  const label = doc.labels.find((l) => map.netOfLabel.get(l.id) === net);
  if (label) return { x: label.x, y: label.y };
  for (const w of doc.wires) {
    const [a, b] = w.points;
    if (map.netOfWire.get(w.id) !== net || !a || !b) continue;
    return { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
  }
  for (const part of doc.parts) {
    for (const pin of pinPositions(part)) {
      if (map.netOfPin.get(`${part.id}:${pin.name}`) === net) return pin.at;
    }
  }
  return null;
}

/** One voltage tag per non-ground net of an operating-point result; empty for other analyses. */
export function opTags(result: SimResult, map: CircuitMap, doc: Schematic): OpTag[] {
  if (result.type !== "op") return [];
  const tags: OpTag[] = [];
  for (const s of result.signals) {
    const v = s.re[0];
    if (s.kind !== "v" || s.name === GROUND || v === undefined) continue;
    const at = anchorOf(s.name, map, doc);
    if (at) tags.push({ net: s.name, at, text: formatQuantity(v, "V") });
  }
  return tags;
}
