import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimResult } from "../../engine/results";
import { projectToNetlist } from "../../netlist/netlister";
import { createSimulationStore } from "../../simulation/store";
import { dividerProject, fakeRunner } from "../../simulation/testFixtures";
import { Editor } from "../Editor";
import { canvas, click, key, makeStore } from "../testUtils";

// The waveform panel renders plots; uPlot needs a real canvas.
vi.mock("../../waveform/Plot", () => ({ TRACE_COLORS: ["#111"], Plot: () => null }));

afterEach(cleanup);

const f = (...v: number[]) => new Float64Array(v);
const result: SimResult = {
  type: "tran",
  axis: f(0, 1),
  signals: [
    { name: "in", kind: "v", re: f(0, 10) },
    { name: "out", kind: "v", re: f(0, 7.5) },
    { name: "R1", kind: "i", re: f(0, 2) },
  ],
};

function setup(withResult = true) {
  const project = dividerProject();
  const store = makeStore(project.schematic);
  const sim = createSimulationStore({ runner: fakeRunner() });
  if (withResult) sim.setState({ result, map: projectToNetlist(project).map, probes: [] });
  render(<Editor store={store} simulation={sim} />);
  fireEvent.click(screen.getByRole("button", { name: "Probe" }));
  return { store, sim, project };
}

const item = (id: string): Element => {
  const el = document.querySelector(`[data-item-id="${id}"]`);
  if (!el) throw new Error(`no item ${id}`);
  return el;
};

describe("probe tool", () => {
  it("click_wire_probes_net_voltage", () => {
    const { sim, project, store } = setup();
    // The wire from R1 to R2 carries net "out".
    const map = projectToNetlist(project).map;
    const wireId = [...(map?.netOfWire ?? [])].find(([, n]) => n === "out")?.[0] as string;
    click(0, 0, item(wireId));
    expect(sim.getState().probes).toEqual(["V(out)"]);
    expect(store.getState().statusMessage).toBeNull();
  });

  it("click_label_probes_net_voltage", () => {
    const { sim, project } = setup();
    const label = project.schematic.labels.find((l) => l.text === "in");
    click(0, 0, item(label?.id as string));
    expect(sim.getState().probes).toEqual(["V(in)"]);
  });

  it("click_part_probes_current", () => {
    const { sim, store } = setup();
    click(0, 0, item("r1"));
    expect(sim.getState().probes).toEqual(["I(R1)"]);
    click(0, 0, item("r2"));
    expect(sim.getState().probes).toEqual(["I(R1)"]);
    expect(store.getState().statusMessage).toBe("No current available for R2");
  });

  it("ground_and_ground_wire_do_nothing", () => {
    const { sim, project, store } = setup();
    click(0, 0, item("g1"));
    const map = projectToNetlist(project).map;
    const wireId = [...(map?.netOfWire ?? [])].find(([, n]) => n === "0")?.[0] as string;
    click(0, 0, item(wireId));
    expect(sim.getState().probes).toEqual([]);
    expect(store.getState().statusMessage).toBeNull();
  });

  it("no_result_sets_message", () => {
    const { sim, store } = setup(false);
    click(0, 0, item("r1"));
    expect(sim.getState().probes).toEqual([]);
    expect(store.getState().statusMessage).toBe("Run a simulation first");
    expect(canvas()).toBeTruthy();
  });

  it("p_key_selects_probe_tool", () => {
    const { store } = setup();
    key("w");
    expect(store.getState().tool.kind).toBe("wire");
    key("p");
    expect(store.getState().tool.kind).toBe("probe");
  });
});
