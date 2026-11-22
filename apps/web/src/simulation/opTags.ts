// Operating-point voltage tags: where on the schematic each net's voltage is drawn.
import type { NetLabel, Point, Schematic } from "@nodal/schema";
import type { SimResult } from "../engine/results";
import { pinPositions } from "../editor/geometry";
import { LABEL_SYMBOL } from "../symbols/catalog";
import type { CircuitMap } from "../netlist/netlister";
import { formatQuantity } from "../netlist/value";

export interface OpTag {
  net: string;
  at: Point;
  text: string;
}

const GROUND = "0";

/** Lowest world y of the (rotated) net-label flag, in grid units. */
function flagBottom(label: NetLabel): number {
  const { x0, y0, x1, y1 } = LABEL_SYMBOL.bounds;
  const a = (label.rotation * Math.PI) / 180;
  const ys = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].map(([x = 0, y = 0]) => Math.sin(a) * x + Math.cos(a) * y);
  return label.y + Math.round(Math.max(...ys) * 1e6) / 1e6;
}

/** A tag anchored on a label sits one grid step below the flag, never on top of its text. */
function belowFlag(label: NetLabel): Point {
  return { x: label.x, y: flagBottom(label) + 1 };
}

function anchorOf(net: string, map: CircuitMap, doc: Schematic): Point | null {
  const label = doc.labels.find((l) => map.netOfLabel.get(l.id) === net);
  if (label) return belowFlag(label);
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
