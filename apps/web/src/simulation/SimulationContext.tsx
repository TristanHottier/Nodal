// React binding for the simulation store, plus the hook that needs both stores.
import { createContext, type ReactNode, useContext } from "react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { useEditor } from "../editor/EditorContext";
import type { SimulationState } from "./store";

const SimulationContext = createContext<StoreApi<SimulationState> | null>(null);

export function SimulationProvider({
  store,
  children,
}: {
  store: StoreApi<SimulationState>;
  children: ReactNode;
}) {
  return <SimulationContext.Provider value={store}>{children}</SimulationContext.Provider>;
}

export function useSimulationStore(): StoreApi<SimulationState> {
  const store = useContext(SimulationContext);
  if (!store) throw new Error("useSimulation must be used inside a <SimulationProvider>");
  return store;
}

export function useSimulation<T>(selector: (s: SimulationState) => T): T {
  return useStore(useSimulationStore(), selector);
}

/** True when a result exists and the schematic or simulation settings changed since it ran. */
export function useResultsStale(): boolean {
  const ranDoc = useSimulation((s) => s.ranDoc);
  const ranSimulation = useSimulation((s) => s.ranSimulation);
  const hasResult = useSimulation((s) => s.result !== null);
  const doc = useEditor((s) => s.doc);
  const simulation = useEditor((s) => s.project.simulation);
  return hasResult && (doc !== ranDoc || simulation !== ranSimulation);
}
