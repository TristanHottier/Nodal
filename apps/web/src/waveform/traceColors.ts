// Trace colors are tokens --color-trace-1 to -6; probe i wears slot (i mod 6) + 1.
import type { CircuitMap } from "../netlist/netlister";

export const TRACE_COUNT = 6;

/** The 1-based color slot of the probe at `index`; the seventh probe reuses slot 1. */
export const traceSlot = (index: number): number => (index % TRACE_COUNT) + 1;

export const traceVar = (index: number): string => `var(--color-trace-${String(traceSlot(index))})`;

/** Color slot of every wire on a probed voltage net. Ground and current probes color no wire. */
export function wireProbeSlots(
  map: CircuitMap | null,
  probes: readonly string[],
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  if (!map) return out;
  const slotOfNet = new Map<string, number>();
  probes.forEach((key, i) => {
    const m = /^V\((.+)\)$/.exec(key);
    const net = m?.[1];
    if (net !== undefined && net !== "0" && !slotOfNet.has(net)) slotOfNet.set(net, traceSlot(i));
  });
  for (const [wireId, net] of map.netOfWire) {
    const slot = slotOfNet.get(net);
    if (slot !== undefined) out.set(wireId, slot);
  }
  return out;
}
