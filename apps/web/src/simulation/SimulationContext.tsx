// React binding for the simulation store, plus the hook that needs both stores.
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
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

const NO_TARGETS = new Set<string>();

/** Ids of schematic items highlighted by a failed run. Empty outside a provider. */
export function useErrorIds(): Set<string> {
  const store = useContext(SimulationContext);
  const [ids, setIds] = useState<Set<string>>(NO_TARGETS);
  useEffect(() => {
    if (!store) return;
    const compute = (s: SimulationState): Set<string> => {
      const st = s.status;
      return st.kind === "failed"
        ? new Set([...st.partIds, ...st.wireIds, ...st.labelIds])
        : NO_TARGETS;
    };
    let lastStatus = store.getState().status;
    setIds(compute(store.getState()));
    return store.subscribe((s) => {
      if (s.status === lastStatus) return;
      lastStatus = s.status;
      setIds(compute(s));
    });
  }, [store]);
  return ids;
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
