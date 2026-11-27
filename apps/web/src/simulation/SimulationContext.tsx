// React binding for the simulation store, plus the hook that needs both stores.
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { StoreApi } from "zustand";
import { createStore, useStore } from "zustand";
import type { SimResult } from "../engine/results";
import type { CircuitMap } from "../netlist/netlister";
import { useEditor, useEditorStore } from "../editor/EditorContext";
import type { EditorState } from "../editor/store";
import { wireProbeSlots } from "../waveform/traceColors";
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

/** Trace color slot of each wire on a probed net. Empty outside a provider and while results are stale. */
export function useProbeSlots(): ReadonlyMap<string, number> {
  const store = useContext(SimulationContext) ?? NO_RESULT;
  const map = useStore(store, (s) => s.map);
  const probes = useStore(store, (s) => s.probes);
  // After an edit the last run's net map can name the wrong wires, so the colors go with it.
  const stale = useStaleOf(store);
  return useMemo(() => (stale ? NO_SLOTS : wireProbeSlots(map, probes)), [map, probes, stale]);
}

const NO_SLOTS: ReadonlyMap<string, number> = new Map();

function useStaleOf(store: StoreApi<SimulationState>): boolean {
  const ranDoc = useStore(store, (s) => s.ranDoc);
  const ranSimulation = useStore(store, (s) => s.ranSimulation);
  const hasResult = useStore(store, (s) => s.result !== null);
  const doc = useEditor((s) => s.doc);
  const simulation = useEditor((s) => s.project.simulation);
  return hasResult && (doc !== ranDoc || simulation !== ranSimulation);
}

/** True when a result exists and the schematic or simulation settings changed since it ran. */
export function useResultsStale(): boolean {
  return useStaleOf(useSimulationStore());
}

/** What the schematic and inspector need to show operating-point values. */
export interface OpView {
  result: SimResult;
  map: CircuitMap;
  stale: boolean;
}

// Stands in outside a provider so components using useOpView need none in their tests.
const NO_RESULT = createStore<SimulationState>(
  // Only the fields the hooks here read exist; the cast documents that.
  () =>
    ({
      result: null,
      map: null,
      probes: [],
      analysisIndex: 0,
      ranDoc: null,
      ranSimulation: null,
    }) as unknown as SimulationState,
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

/** Index of the analysis the run bar will run. 0 outside a provider. */
export function useRunIndex(): number {
  const store = useContext(SimulationContext) ?? NO_RESULT;
  return useStore(store, (s) => s.analysisIndex);
}

/** The latest result object, or null. Its identity changes with every run. Null outside a provider. */
export function useResultObject(): SimResult | null {
  const store = useContext(SimulationContext) ?? NO_RESULT;
  return useStore(store, (s) => s.result);
}

/**
 * Resets the simulation store whenever a project is loaded (Open, New, a codex "Try it"): nothing
 * from the old one may linger. Returns the unsubscribe function. App calls it so it also works
 * while the editor is unmounted, as on a codex page.
 */
export function resetOnProjectLoad(
  editor: StoreApi<EditorState>,
  sim: StoreApi<SimulationState>,
): () => void {
  let generation = editor.getState().projectGeneration;
  return editor.subscribe((s) => {
    if (s.projectGeneration === generation) return;
    generation = s.projectGeneration;
    sim.getState().reset();
  });
}

/** The same reset for a provider tree that has no App above it (the editor on its own, in tests). */
export function useResetOnProjectLoad(): void {
  const sim = useContext(SimulationContext);
  const editor = useEditorStore();
  useEffect(() => {
    if (!sim) return;
    return resetOnProjectLoad(editor, sim);
  }, [sim, editor]);
}
