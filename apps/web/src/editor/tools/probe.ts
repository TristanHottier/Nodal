// Probe tool: click a wire or label to probe its net voltage, a part to probe its current.
import { useMemo } from "react";
import { signalKey } from "../../engine/results";
import { irName } from "../../netlist/elements";
import { useSimulationStore } from "../../simulation/SimulationContext";
import type { CanvasToolHandlers } from "../canvas/useCanvasPointer";
import { useEditorStore } from "../EditorContext";

export function useProbeTool(): CanvasToolHandlers {
  const editor = useEditorStore();
  const sim = useSimulationStore();
  return useMemo<CanvasToolHandlers>(
    () => ({
      onPointerMove() {
        // Nothing to preview.
      },
      onPointerDown(_world, e) {
        const ed = editor.getState();
        const { result, map } = sim.getState();
        if (!result || !map) {
          ed.setStatusMessage("Run a simulation first");
          return;
        }
        const id = (e.target as Element).closest("[data-item-id]")?.getAttribute("data-item-id");
        if (!id) return;
        const find = (kind: "v" | "i", name: string) =>
          result.signals.find(
            (s) => s.kind === kind && s.name.toLowerCase() === name.toLowerCase(),
          );
        const doc = ed.doc;

        const part = doc.parts.find((p) => p.id === id);
        if (part) {
          if (part.type === "ground") return;
          const name = irName(part);
          const sig = find("i", name);
          if (sig) {
            sim.getState().addProbe(signalKey(sig));
            ed.setStatusMessage(null);
          } else ed.setStatusMessage(`No current available for ${part.name}`);
          return;
        }
        const net = map.netOfWire.get(id) ?? map.netOfLabel.get(id);
        if (net === undefined || net === "0") return;
        const sig = find("v", net);
        if (sig) {
          sim.getState().addProbe(signalKey(sig));
          ed.setStatusMessage(null);
        } else ed.setStatusMessage(`No voltage available for net ${net}`);
      },
    }),
    [editor, sim],
  );
}
