// Viewport culling: items far outside the visible world box are not rendered, so pan and
// zoom paint only what can be seen. The box is snapped outward to coarse cells, so the
// visible lists change (and React reconciles) only when the view crosses a cell border.
import type { Schematic } from "@nodal/schema";
import { GRID } from "../geometry";
import type { View } from "../store";

/** Cell size (grid units) of the snapped box, and the margin around the viewport. */
const CELL = 20;
/** No symbol or label reaches farther than this from its anchor (grid units). */
const REACH = 8;

export interface WorldBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Visible world box, padded by `CELL` and snapped outward to multiples of `CELL`. */
export function visibleBox(view: View, size: Size): WorldBox {
  const scale = GRID * view.zoom;
  return {
    x0: Math.floor((-view.x / scale - CELL) / CELL) * CELL,
    y0: Math.floor((-view.y / scale - CELL) / CELL) * CELL,
    x1: Math.ceil(((size.width - view.x) / scale + CELL) / CELL) * CELL,
    y1: Math.ceil(((size.height - view.y) / scale + CELL) / CELL) * CELL,
  };
}

const near = (b: WorldBox, x: number, y: number): boolean =>
  x >= b.x0 - REACH && x <= b.x1 + REACH && y >= b.y0 - REACH && y <= b.y1 + REACH;

/** The items of `doc` that can touch `box`. Keeps the item objects, so memoized views still match. */
export function cullDoc(doc: Schematic, box: WorldBox): Schematic {
  return {
    parts: doc.parts.filter((p) => near(box, p.x, p.y)),
    labels: doc.labels.filter((l) => near(box, l.x, l.y)),
    wires: doc.wires.filter((w) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of w.points) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
      return x1 >= box.x0 && x0 <= box.x1 && y1 >= box.y0 && y0 <= box.y1;
    }),
  };
}
