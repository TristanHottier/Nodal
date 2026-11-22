// Simulation state: the run lifecycle, the latest result and the probe list.
// The store builds netlists (through the pure netlister); components never do.
import type { Netlist, Project, Schematic } from "@nodal/schema";
import { createStore, type StoreApi } from "zustand/vanilla";
import { CancelledError, EngineRunError, type EngineRunner } from "../engine/client";
import { type SimResult, signalKey } from "../engine/results";
import { type CircuitMap, projectToNetlist } from "../netlist/netlister";
import type { CursorState } from "../waveform/cursors";
import { withDerivedCurrents } from "../waveform/traces";
import { type ErrorTargets, errorTargets } from "./errorTargets";

export type { ErrorTargets };

export type RunStatus =
  | { kind: "idle" }
  | { kind: "running"; index: number; progress: number }
  | { kind: "done" }
  | ({ kind: "failed"; message: string } & ErrorTargets);

export interface SimulationState {
  status: RunStatus;
  result: SimResult | null;
  /** The schematic and simulation settings the current result came from. */
  ranDoc: Schematic | null;
  ranSimulation: Project["simulation"] | null;
  /** The IR that produced the current result. */
  ranIr: Netlist | null;
  map: CircuitMap | null;
  /** Signal keys such as `V(out)`. */
  probes: string[];
  /** The analysis picked in the run bar. Lives here so it survives the editor/read-only switch. */
  analysisIndex: number;
  /** Cursor positions, owned by one analysis kind; a different kind starts clean. */
  cursors: { type: SimResult["type"] | null; cursors: CursorState };
  setAnalysisIndex(index: number): void;
  setCursors(type: SimResult["type"], cursors: CursorState): void;
  run(project: Project, index: number): Promise<void>;
  cancel(): void;
  addProbe(key: string): void;
  removeProbe(key: string): void;
  /** Cancel any run and forget the result, status, map and probes (a new project was loaded). */
  reset(): void;
}

const NO_CURSORS = { type: null, cursors: { a: null, b: null } } as const;

const NO_TARGETS: ErrorTargets = { partIds: [], wireIds: [], labelIds: [] };

/** Keep probes present in the result; fall back to the first node voltage (not for op). */
function nextProbes(probes: string[], result: SimResult): string[] {
  const keys = new Set(result.signals.map(signalKey));
  const kept = probes.filter((k) => keys.has(k));
  if (kept.length > 0 || result.type === "op") return kept;
  const first = result.signals.find((s) => s.kind === "v");
  return first ? [signalKey(first)] : [];
}

export function createSimulationStore(opts: { runner: EngineRunner }): StoreApi<SimulationState> {
  const { runner } = opts;
  let runId = 0;
  return createStore<SimulationState>()((set, get) => {
    const fail = (message: string, targets: ErrorTargets = NO_TARGETS) => {
      set({ status: { kind: "failed", message, ...targets } });
    };
    return {
      status: { kind: "idle" },
      result: null,
      ranDoc: null,
      ranSimulation: null,
      ranIr: null,
      map: null,
      probes: [],
      analysisIndex: 0,
      cursors: NO_CURSORS,

      setAnalysisIndex(index) {
        set({ analysisIndex: index });
      },
      setCursors(type, cursors) {
        set({ cursors: { type, cursors } });
      },

      async run(project, requested) {
        // EngineClient.run supersedes a run still in flight, so no cancel is needed here.
        const id = ++runId;
        const { ir, diagnostics, map } = projectToNetlist(project);
        const errors = diagnostics.filter((d) => d.severity === "error");
        if (errors.length > 0 || !ir) {
          const ids = new Set(errors.flatMap((d) => d.itemIds));
          const { parts, wires, labels } = project.schematic;
          const of = (items: { id: string }[]) => new Set(items.map((i) => i.id));
          const [partSet, wireSet, labelSet] = [of(parts), of(wires), of(labels)];
          fail("Fix the problems listed before simulating", {
            partIds: [...ids].filter((i) => partSet.has(i)),
            wireIds: [...ids].filter((i) => wireSet.has(i)),
            labelIds: [...ids].filter((i) => labelSet.has(i)),
          });
          return;
        }
        const ranDoc = project.schematic;
        const ranSimulation = project.simulation;
        const index = Math.max(0, Math.min(requested, ir.analyses.length - 1));
        set({ status: { kind: "running", index, progress: 0 } });
        try {
          const raw = await runner.run(JSON.stringify(ir), index, {
            onProgress: (progress) => {
              if (id === runId) set({ status: { kind: "running", index, progress } });
            },
          });
          if (id !== runId) return;
          const result = withDerivedCurrents(raw, ir);
          set({
            status: { kind: "done" },
            result,
            ranDoc,
            ranSimulation,
            ranIr: ir,
            map,
            probes: nextProbes(get().probes, result),
          });
        } catch (e) {
          if (id !== runId) return;
          if (e instanceof CancelledError) set({ status: { kind: "idle" } });
          else if (e instanceof EngineRunError)
            fail(e.message, map ? errorTargets(e.info, map, ranDoc) : NO_TARGETS);
          else fail(e instanceof Error ? e.message : String(e));
        }
      },

      cancel() {
        if (get().status.kind !== "running") return;
        runId += 1;
        runner.cancel();
        set({ status: { kind: "idle" } });
      },

      reset() {
        get().cancel();
        // A run that failed or finished is not running; bump the id so late callbacks are ignored.
        runId += 1;
        set({
          status: { kind: "idle" },
          result: null,
          ranDoc: null,
          ranSimulation: null,
          ranIr: null,
          map: null,
          probes: [],
          analysisIndex: 0,
          cursors: NO_CURSORS,
        });
      },

      addProbe(key) {
        const { probes } = get();
        if (!probes.includes(key)) set({ probes: [...probes, key] });
      },
      removeProbe(key) {
        const { probes } = get();
        if (probes.includes(key)) set({ probes: probes.filter((k) => k !== key) });
      },
    };
  });
}
