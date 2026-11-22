// Keyboard selection order: parts, then wires, then net labels, each in document order.
import type { Schematic } from "@nodal/schema";

export function selectionOrder(doc: Schematic): string[] {
  return [...doc.parts, ...doc.wires, ...doc.labels].map((i) => i.id);
}

/**
 * The selection after one step through the items: next (+1) or previous (-1), wrapping.
 * With nothing or several items selected, a step forward picks the first item and a step back the last.
 */
export function cycleSelection(
  doc: Schematic,
  selection: readonly string[],
  step: 1 | -1,
): string[] {
  const order = selectionOrder(doc);
  if (order.length === 0) return [];
  const current = selection.length === 1 ? order.indexOf(selection[0] ?? "") : -1;
  if (current < 0) return [step === 1 ? (order[0] ?? "") : (order[order.length - 1] ?? "")];
  return [order[(current + step + order.length) % order.length] ?? ""];
}
