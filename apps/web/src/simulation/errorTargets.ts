// Maps an engine error (element and node names) back to schematic items.
import type { Schematic } from "@nodal/schema";
import type { EngineErrorInfo } from "../engine/results";
import type { CircuitMap } from "../netlist/netlister";

export interface ErrorTargets {
  partIds: string[];
  wireIds: string[];
  labelIds: string[];
}

const GROUND = "0";

/** Parts, wires and labels involved in an engine error. Sorted and deduplicated. */
export function errorTargets(info: EngineErrorInfo, map: CircuitMap, doc: Schematic): ErrorTargets {
  const parts = new Set<string>();
  const wires = new Set<string>();
  const labels = new Set<string>();

  const byLowerName = new Map<string, string>();
  for (const [name, partId] of map.partOfElement) byLowerName.set(name.toLowerCase(), partId);
  const addElement = (name: string) => {
    const id = byLowerName.get(name.toLowerCase());
    if (id !== undefined) parts.add(id);
  };

  for (const el of info.elements) addElement(el);

  for (const raw of info.nodes) {
    const hash = raw.indexOf("#");
    if (hash >= 0) {
      // An internal node such as `D1#internal` belongs to its element.
      addElement(raw.slice(0, hash));
      continue;
    }
    if (raw === GROUND) continue;
    let hasWire = false;
    for (const w of doc.wires) {
      if (map.netOfWire.get(w.id) === raw) {
        wires.add(w.id);
        hasWire = true;
      }
    }
    for (const l of doc.labels) {
      if (map.netOfLabel.get(l.id) === raw) labels.add(l.id);
    }
    if (!hasWire) {
      for (const [key, net] of map.netOfPin) {
        if (net !== raw) continue;
        const sep = key.lastIndexOf(":");
        parts.add(sep >= 0 ? key.slice(0, sep) : key);
      }
    }
  }

  const sorted = (s: Set<string>) => [...s].sort();
  return { partIds: sorted(parts), wireIds: sorted(wires), labelIds: sorted(labels) };
}
