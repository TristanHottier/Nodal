import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorProvider } from "../editor/EditorContext";
import { createEditorStore } from "../editor/store";
import { emptyDoc, project } from "../netlist/testDoc";
import { RunBar } from "./RunBar";
import { SimulationProvider } from "./SimulationContext";
import { createSimulationStore } from "./store";
import { dividerProject, fakeRunner, opResult } from "./testFixtures";

afterEach(cleanup);

function setup(p = dividerProject()) {
  const runner = fakeRunner();
  const simulation = createSimulationStore({ runner });
  const editor = createEditorStore({ project: p });
  render(
    <EditorProvider store={editor}>
      <SimulationProvider store={simulation}>
        <RunBar />
      </SimulationProvider>
    </EditorProvider>,
  );
  return { runner, simulation, editor };
}

const btn = (name: string) => screen.getByRole("button", { name });

describe("RunBar", () => {
  it("run_then_cancel", async () => {
    const { runner, simulation } = setup();
    fireEvent.click(btn("Run"));
    expect(runner.calls).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    fireEvent.click(btn("Cancel"));
    expect(simulation.getState().status.kind).toBe("idle");
    expect(btn("Run")).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("shows_progress", async () => {
    const { runner } = setup();
    fireEvent.click(btn("Run"));
    act(() => {
      runner.calls[0]?.progress(0.25);
    });
    expect(screen.getByRole<HTMLProgressElement>("progressbar").value).toBe(0.25);
    await act(async () => {
      runner.calls[0]?.resolve(opResult());
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Done");
  });

  it("shows_failure_message", async () => {
    setup(project(emptyDoc()));
    await act(async () => {
      fireEvent.click(btn("Run"));
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Fix the problems listed before simulating",
    );
  });

  it("marks_results_out_of_date", async () => {
    const { runner, editor } = setup();
    fireEvent.click(btn("Run"));
    await act(async () => {
      runner.calls[0]?.resolve(opResult());
      await Promise.resolve();
    });
    act(() => {
      editor.getState().setSimulation({ ...editor.getState().project.simulation });
    });
    expect(screen.getByRole("status").textContent).toBe("Out of date, run again");
  });

  it("selects_analysis_to_run", () => {
    const p = dividerProject();
    const { runner } = setup({
      ...p,
      simulation: {
        ...p.simulation,
        analyses: [
          { type: "op" },
          { type: "tran", tstep: 1e-6, tstop: 1e-3, tstart: 0, tmax: undefined, uic: false },
        ],
      },
    });
    const sel = screen.getByRole<HTMLSelectElement>("combobox", { name: "Analysis to run" });
    expect([...sel.options].map((o) => o.text)).toEqual(["1. Operating point", "2. Transient"]);
    fireEvent.change(sel, { target: { value: "1" } });
    fireEvent.click(btn("Run"));
    expect(runner.calls[0]?.index).toBe(1);
  });
});
