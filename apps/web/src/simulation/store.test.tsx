import { act, cleanup, render, screen } from "@testing-library/react";
import { newProject } from "@nodal/schema";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorStore } from "../editor/store";
import { EditorProvider } from "../editor/EditorContext";
import { EngineRunError } from "../engine/client";
import { project as projectOf, emptyDoc } from "../netlist/testDoc";
import { SimulationProvider, useResetOnProjectLoad, useResultsStale } from "./SimulationContext";
import { createSimulationStore } from "./store";
import { dividerProject, fakeRunner, opResult, tranResult } from "./testFixtures";

afterEach(cleanup);

function setup() {
  const runner = fakeRunner();
  const store = createSimulationStore({ runner });
  return { runner, store, get: () => store.getState() };
}

const withTran = () => {
  const p = dividerProject();
  return {
    ...p,
    simulation: {
      ...p.simulation,
      analyses: [
        { type: "tran" as const, tstep: 1e-6, tstop: 1e-3, tstart: 0, tmax: undefined, uic: false },
      ],
    },
  };
};

describe("simulation store", () => {
  it("run_success_sets_result", async () => {
    const { runner, get } = setup();
    const p = dividerProject();
    const done = get().run(p, 0);
    expect(get().status.kind).toBe("running");
    const call = runner.calls[0];
    expect(call?.index).toBe(0);
    expect(call?.netlist).toContain("irVersion");
    call?.progress(0.5);
    expect(get().status).toEqual({ kind: "running", index: 0, progress: 0.5 });
    const result = opResult(["a"]);
    call?.resolve(result);
    await done;
    expect(get().status).toEqual({ kind: "done" });
    expect(get().result).toBe(result);
    expect(get().ranDoc).toBe(p.schematic);
    expect(get().ranSimulation).toBe(p.simulation);
    expect(get().map).not.toBeNull();
    expect(get().ranIr).not.toBeNull();
  });

  it("op_run_exposes_derived_resistor_current", async () => {
    const { runner, get } = setup();
    const done = get().run(dividerProject(), 0);
    runner.calls[0]?.resolve({
      type: "op",
      axis: new Float64Array(0),
      signals: [
        { name: "in", kind: "v", re: new Float64Array([10]) },
        { name: "out", kind: "v", re: new Float64Array([7.5]) },
      ],
    });
    await done;
    const i = get().result?.signals.find((s) => s.kind === "i" && s.name === "R1");
    expect(i?.re[0]).toBeCloseTo(2.5e-3, 12);
  });

  it("netlist_errors_block_run", async () => {
    const { runner, get } = setup();
    await get().run(projectOf(emptyDoc()), 0);
    const s = get().status;
    expect(s.kind).toBe("failed");
    if (s.kind === "failed") expect(s.message).toBe("Fix the problems listed before simulating");
    expect(runner.calls).toHaveLength(0);
  });

  it("engine_error_sets_failed", async () => {
    const { runner, get } = setup();
    const done = get().run(dividerProject(), 0);
    runner.calls[0]?.reject(
      new EngineRunError({ message: "singular matrix", elements: ["R1"], nodes: ["a"] }),
    );
    await done;
    expect(get().status).toMatchObject({
      kind: "failed",
      message: "singular matrix",
      partIds: ["r1"],
    });
    expect(get().result).toBeNull();
  });

  it("cancel_keeps_previous_result", async () => {
    const { runner, get } = setup();
    const first = get().run(dividerProject(), 0);
    runner.calls[0]?.resolve(opResult());
    await first;
    const prev = get().result;
    const second = get().run(dividerProject(), 0);
    get().cancel();
    await second;
    expect(get().status).toEqual({ kind: "idle" });
    expect(get().result).toBe(prev);
    expect(runner.cancelled).toBeGreaterThan(0);
  });

  it("stale_run_is_ignored", async () => {
    const { runner, get } = setup();
    const first = get().run(dividerProject(), 0);
    const second = get().run(dividerProject(), 0);
    const r2 = opResult(["b"]);
    runner.calls[1]?.resolve(r2);
    await second;
    runner.calls[0]?.resolve(opResult(["old"]));
    await first;
    expect(get().result).toBe(r2);
    expect(get().status).toEqual({ kind: "done" });
  });

  it("missing_probes_dropped_on_rerun", async () => {
    const { runner, get } = setup();
    const p = withTran();
    const first = get().run(p, 0);
    runner.calls[0]?.resolve(tranResult(["a", "b"]));
    await first;
    get().addProbe("V(b)");
    get().addProbe("V(b)");
    expect(get().probes).toEqual(["V(a)", "V(b)"]);
    get().removeProbe("V(a)");
    get().addProbe("V(a)");
    const second = get().run(p, 0);
    runner.calls[1]?.resolve(tranResult(["a", "c"]));
    await second;
    expect(get().probes).toEqual(["V(a)"]);
  });

  it("first_node_probed_by_default", async () => {
    const { runner, get } = setup();
    const first = get().run(withTran(), 0);
    runner.calls[0]?.resolve(tranResult(["a", "b"]));
    await first;
    expect(get().probes).toEqual(["V(a)"]);
    const op = get().run(dividerProject(), 0);
    runner.calls[1]?.resolve(opResult(["a"]));
    await op;
    expect(get().probes).toEqual(["V(a)"]);
    const fresh = setup();
    const o = fresh.get().run(dividerProject(), 0);
    fresh.runner.calls[0]?.resolve(opResult(["a"]));
    await o;
    expect(fresh.get().probes).toEqual([]);
  });

  it("results_marked_stale_after_edit", async () => {
    const { runner, store, get } = setup();
    const editor = createEditorStore({ project: dividerProject() });
    function Probe() {
      return <span data-testid="stale">{String(useResultsStale())}</span>;
    }
    render(
      <EditorProvider store={editor}>
        <SimulationProvider store={store}>
          <Probe />
        </SimulationProvider>
      </EditorProvider>,
    );
    expect(screen.getByTestId("stale").textContent).toBe("false");
    const done = get().run(editor.getState().getProject(), 0);
    runner.calls[0]?.resolve(opResult());
    await act(async () => {
      await done;
    });
    expect(screen.getByTestId("stale").textContent).toBe("false");
    act(() => {
      editor.getState().setSimulation({ ...editor.getState().project.simulation });
    });
    expect(screen.getByTestId("stale").textContent).toBe("true");
  });

  it("keeps_the_chosen_analysis_and_the_cursors_and_reset_clears_them", () => {
    const { get } = setup();
    expect(get().analysisIndex).toBe(0);
    expect(get().cursors).toEqual({ type: null, cursors: { a: null, b: null } });
    get().setAnalysisIndex(2);
    get().setCursors("tran", { a: 1e-3, b: null });
    expect(get().analysisIndex).toBe(2);
    expect(get().cursors).toEqual({ type: "tran", cursors: { a: 1e-3, b: null } });
    get().reset();
    expect(get().analysisIndex).toBe(0);
    expect(get().cursors.cursors).toEqual({ a: null, b: null });
  });

  it("reset_clears_result_status_and_probes", async () => {
    const { runner, get } = setup();
    const done = get().run(dividerProject(), 0);
    runner.calls[0]?.resolve(opResult(["a"]));
    await done;
    get().addProbe("V(a)");
    get().reset();
    const s = get();
    expect(s.status).toEqual({ kind: "idle" });
    expect([s.result, s.ranDoc, s.ranSimulation, s.ranIr, s.map]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(s.probes).toEqual([]);
  });

  it("open_project_resets_simulation", async () => {
    const { runner, store, get } = setup();
    const editor = createEditorStore({ project: dividerProject() });
    function Reset() {
      useResetOnProjectLoad();
      return null;
    }
    render(
      <EditorProvider store={editor}>
        <SimulationProvider store={store}>
          <Reset />
        </SimulationProvider>
      </EditorProvider>,
    );
    const done = get().run(editor.getState().getProject(), 0);
    runner.calls[0]?.resolve(opResult(["a"]));
    await done;
    expect(get().result).not.toBeNull();
    act(() => {
      editor.getState().loadProject(newProject("Other", "2026-01-01T00:00:00.000Z"));
    });
    expect(get().result).toBeNull();
    expect(get().map).toBeNull();
    expect(get().status).toEqual({ kind: "idle" });
  });
});
