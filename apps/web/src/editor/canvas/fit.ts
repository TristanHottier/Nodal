// Zoom-to-fit for the schematic: the world box of the drawn items and a view that shows it.
import type { Schematic } from "@nodal/schema";
import { LABEL_SYMBOL } from "../../symbols/catalog";
import { GRID, partBounds, type Box } from "../geometry";
import { MAX_ZOOM, MIN_ZOOM, type View } from "../store";
import type { Size } from "./cull";

/** Margin around the circuit when it is fitted, in screen px. */
export const FIT_MARGIN = 24;

/** World box (grid units) of every part, wire and label, or null for an empty schematic. */
export function contentBox(doc: Schematic): Box | null {
  let box: Box | null = null;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    box = box
      ? {
          x0: Math.min(box.x0, x0),
          y0: Math.min(box.y0, y0),
          x1: Math.max(box.x1, x1),
          y1: Math.max(box.y1, y1),
        }
      : { x0, y0, x1, y1 };
  };
  for (const p of doc.parts) {
    const b = partBounds(p);
    add(b.x0, b.y0, b.x1, b.y1);
  }
  for (const w of doc.wires) for (const pt of w.points) add(pt.x, pt.y, pt.x, pt.y);
  // A label turns with its rotation, so the largest reach of its bounds covers every angle.
  const { x0, y0, x1, y1 } = LABEL_SYMBOL.bounds;
  const reach = Math.max(Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1));
  for (const l of doc.labels) add(l.x - reach, l.y - reach, l.x + reach, l.y + reach);
  return box;
}

const showsAll = (view: View, box: Box, size: Size, margin: number): boolean => {
  const scale = GRID * view.zoom;
  return (
    view.x + box.x0 * scale >= margin &&
    view.y + box.y0 * scale >= margin &&
    view.x + box.x1 * scale <= size.width - margin &&
    view.y + box.y1 * scale <= size.height - margin
  );
};

/**
 * The view to use after the canvas shrank to `size`. Returns `view` itself (same object) when the
 * whole circuit is already visible with its margin, so a view the user chose is kept. Otherwise the
 * zoom drops just enough to fit, never rises above the current zoom, and the circuit is centered.
 */
export function refitView(
  view: View,
  doc: Schematic,
  size: Size,
  margin: number = FIT_MARGIN,
): View {
  const box = contentBox(doc);
  if (!box || size.width <= 2 * margin || size.height <= 2 * margin) return view;
  if (showsAll(view, box, size, margin)) return view;
  const w = Math.max(box.x1 - box.x0, 1);
  const h = Math.max(box.y1 - box.y0, 1);
  const fit = Math.min(
    (size.width - 2 * margin) / (w * GRID),
    (size.height - 2 * margin) / (h * GRID),
  );
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(view.zoom, fit)));
  const scale = GRID * zoom;
  return {
    zoom,
    x: (size.width - (box.x0 + box.x1) * scale) / 2,
    y: (size.height - (box.y0 + box.y1) * scale) / 2,
  };
}
