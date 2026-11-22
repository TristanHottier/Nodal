// React binding for the simulation store, plus the hook that needs both stores.
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { StoreApi } from "zustand";
import { createStore, useStore } from "zustand";
import type { SimResult } from "../engine/results";
import type { CircuitMap } from "../netlist/netlister";
import { useEditor, useEditorStore } from "../editor/EditorContext";
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

/** What the schematic and inspector need to show operating-point values. */
export interface OpView {
  result: SimResult;
  map: CircuitMap;
  stale: boolean;
}

// Stands in outside a provider so components using useOpView need none in their tests.
const NO_RESULT = createStore<SimulationState>(
  // Only the fields useOpView reads exist; the cast documents that.
  () =>
    ({ result: null, map: null, ranDoc: null, ranSimulation: null }) as unknown as SimulationState,
);

/** The latest operating-point result with its circuit map. Null outside a provider or for other analyses. */
export function useOpView(): OpView | null {
  const store = useContext(SimulationContext) ?? NO_RESULT;
  const result = useStore(store, (s) => s.result);
  const map = useStore(store, (s) => s.map);
  const ranDoc = useStore(store, (s) => s.ranDoc);
  const ranSimulation = useStore(store, (s) => s.ranSimulation);
  const doc = useEditor((s) => s.doc);
  const simulation = useEditor((s) => s.project.simulation);
  if (!result || !map || result.type !== "op") return null;
  return { result, map, stale: doc !== ranDoc || simulation !== ranSimulation };
}

/** Resets the simulation whenever a project is loaded (Open, New): nothing from the old one may linger. */
export function useResetOnProjectLoad(): void {
  const sim = useContext(SimulationContext);
  const editor = useEditorStore();
  useEffect(() => {
    if (!sim) return;
    let generation = editor.getState().projectGeneration;
    return editor.subscribe((s) => {
      if (s.projectGeneration === generation) return;
      generation = s.projectGeneration;
      sim.getState().reset();
    });
  }, [sim, editor]);
}
