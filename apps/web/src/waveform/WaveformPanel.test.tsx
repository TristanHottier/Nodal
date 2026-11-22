import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimResult } from "../engine/results";
import { EditorProvider } from "../editor/EditorContext";
import { createEditorStore } from "../editor/store";
import { SimulationProvider } from "../simulation/SimulationContext";
import { createSimulationStore } from "../simulation/store";
import { fakeRunner, opResult } from "../simulation/testFixtures";
import { valueAt } from "./cursors";
import { traceVar } from "./traceColors";
import { WaveformPanel } from "./WaveformPanel";

// uPlot needs a real canvas; the mock renders what the panel passes as data attributes.
vi.mock("./Plot", () => ({
  Plot: (p: {
    series: { label: string }[];
    logX: boolean;
    xLabel: string;
    yLabel: string;
    cursors: { a: number | null; b: number | null };
    onCursor(which: "a" | "b", x: number): void;
  }) => (
    <div
      data-testid="plot"
      data-labels={p.series.map((s) => s.label).join(",")}
      data-logx={String(p.logX)}
      data-xlabel={p.xLabel}
      data-ylabel={p.yLabel}
      data-cursor-a={String(p.cursors.a)}
      data-cursor-b={String(p.cursors.b)}
    >
      <button
        type="button"
        onClick={(e) => {
          p.onCursor(e.shiftKey ? "b" : "a", 2.5);
        }}
      >
        plot click
      </button>
    </div>
  ),
}));

afterEach(cleanup);

const f = (...v: number[]) => new Float64Array(v);

const tran: SimResult = {
  type: "tran",
  axis: f(0, 1, 2, 3),
  signals: [
    { name: "a", kind: "v", re: f(0, 10, 20, 30) },
    { name: "b", kind: "v", re: f(0, 1, 4, 9) },
    { name: "V1", kind: "i", re: f(0, -1, -2, -3) },
  ],
};

const ac: SimResult = {
  type: "ac",
  axis: f(1, 10, 100),
  signals: [{ name: "out", kind: "v", re: f(1, 0, 0), im: f(0, 1, -1) }],
};

function setup(result: SimResult, probes: string[]) {
  const store = createSimulationStore({ runner: fakeRunner() });
  store.setState({ result, probes });
  render(
    <EditorProvider store={createEditorStore()}>
      <SimulationProvider store={store}>
        <WaveformPanel />
      </SimulationProvider>
    </EditorProvider>,
  );
  return store;
}

describe("WaveformPanel", () => {
  it("tran_shows_one_plot_with_probes", () => {
    setup(tran, ["V(a)", "V(b)"]);
    const plots = screen.getAllByTestId("plot");
    expect(plots).toHaveLength(1);
    expect(plots[0]?.dataset.labels).toBe("V(a),V(b)");
    expect(plots[0]?.dataset.logx).toBe("false");
    expect(plots[0]?.dataset.xlabel).toBe("Time (s)");
  });

  it("ac_shows_bode_pair_log_x", () => {
    setup(ac, ["V(out)"]);
    const plots = screen.getAllByTestId("plot");
    expect(plots.map((p) => p.dataset.ylabel)).toEqual(["Magnitude (dB)", "Phase (°)"]);
    expect(plots.every((p) => p.dataset.logx === "true")).toBe(true);
    // Only the lower plot carries the axis title.
    expect(plots[1]?.dataset.xlabel).toBe("Frequency (Hz)");
  });

  it("dc_labels_axis_with_source", () => {
    setup({ ...tran, type: "dc", source: "V1" }, ["V(a)"]);
    expect(screen.getByTestId("plot").dataset.xlabel).toBe("V1");
  });

  it("op_shows_table", () => {
    setup(opResult(["a", "b"]), []);
    expect(screen.queryByTestId("plot")).toBeNull();
    const table = screen.getByRole("table", { name: "Operating point" });
    expect(within(table).getByText("V(a)")).toBeTruthy();
    expect(within(table).getByText("V(b)")).toBeTruthy();
    expect(within(table).getAllByText("1 V")).toHaveLength(2);
  });

  it("add_and_remove_probe", () => {
    const store = setup(tran, ["V(a)"]);
    fireEvent.change(screen.getByLabelText("Signal"), { target: { value: "I(V1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(store.getState().probes).toEqual(["V(a)", "I(V1)"]);
    expect(screen.getByTestId("plot").dataset.labels).toBe("V(a),I(V1)");
    fireEvent.click(screen.getByRole("button", { name: "Remove V(a)" }));
    expect(store.getState().probes).toEqual(["I(V1)"]);
    expect(screen.getByTestId("plot").dataset.labels).toBe("I(V1)");
  });

  it("cursor_inputs_fill_readout", () => {
    setup(tran, ["V(a)"]);
    const a = screen.getByLabelText("Cursor A");
    fireEvent.change(a, { target: { value: "500m" } });
    fireEvent.blur(a);
    const b = screen.getByLabelText("Cursor B");
    fireEvent.change(b, { target: { value: "2" } });
    fireEvent.blur(b);
    const expected = valueAt(tran.axis, f(0, 10, 20, 30), 0.5, false);
    expect(expected).toBe(5);
    const row = screen
      .getByRole("table", { name: "Cursor readout" })
      .querySelector("tr[data-signal='V(a)']");
    expect(row?.querySelector("[data-col='a']")?.textContent).toBe("5 V");
    expect(row?.querySelector("[data-col='b']")?.textContent).toBe("20 V");
    expect(row?.querySelector("[data-col='delta']")?.textContent).toBe("15 V");
    expect(screen.getByTestId("plot").dataset.cursorA).toBe("0.5");
    expect(document.querySelector("[data-col='dx']")?.textContent).toBe("1.5 s");
  });

  it("click_sets_cursor_a_shift_sets_b", () => {
    setup(tran, ["V(a)"]);
    const click = screen.getByRole("button", { name: "plot click" });
    fireEvent.click(click);
    expect(screen.getByTestId("plot").dataset.cursorA).toBe("2.5");
    expect(screen.getByTestId("plot").dataset.cursorB).toBe("null");
    fireEvent.click(click, { shiftKey: true });
    expect(screen.getByTestId("plot").dataset.cursorB).toBe("2.5");
    expect(screen.getByLabelText<HTMLInputElement>("Cursor A").value).toBe("2.5");
  });

  it("cursors_reset_when_result_type_changes", () => {
    const store = setup(tran, ["V(a)"]);
    fireEvent.click(screen.getByRole("button", { name: "plot click" }));
    expect(screen.getByTestId("plot").dataset.cursorA).toBe("2.5");
    act(() => {
      store.setState({ result: ac, probes: ["V(out)"] });
    });
    expect(screen.getAllByTestId("plot")[0]?.dataset.cursorA).toBe("null");
  });

  it("chips_and_cursor_rows_share_the_trace_swatch", () => {
    setup(tran, ["V(a)", "V(b)", "I(V1)"]);
    const swatch = (el: Element | null | undefined) =>
      el?.querySelector<HTMLElement>(".nodal-swatch")?.style.getPropertyValue("--swatch");
    ["V(a)", "V(b)", "I(V1)"].forEach((key, i) => {
      const chip = document.querySelector(`.nodal-chip[data-probe='${key}']`);
      const row = document.querySelector(`tr[data-signal='${key}']`);
      expect(swatch(chip)).toBe(traceVar(i));
      expect(swatch(row)).toBe(traceVar(i));
      expect(row?.textContent).toContain(key);
    });
  });

  it("seventh_probe_reuses_color_one_in_chip_and_row", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    const wide: SimResult = {
      type: "tran",
      axis: f(0, 1),
      signals: names.map((name) => ({ name, kind: "v" as const, re: f(0, 1) })),
    };
    setup(
      wide,
      names.map((n) => `V(${n})`),
    );
    const chip = document.querySelector(".nodal-chip[data-probe='V(g)'] .nodal-swatch");
    const row = document.querySelector("tr[data-signal='V(g)'] .nodal-swatch");
    expect((chip as HTMLElement).style.getPropertyValue("--swatch")).toBe(traceVar(0));
    expect((row as HTMLElement).style.getPropertyValue("--swatch")).toBe(traceVar(0));
  });

  it("marks_panel_and_op_table_stale_after_an_edit", () => {
    for (const result of [tran, opResult(["a"])]) {
      cleanup();
      const editor = createEditorStore({ doc: { parts: [], wires: [], labels: [] } });
      const store = createSimulationStore({ runner: fakeRunner() });
      store.setState({
        result,
        probes: ["V(a)"],
        ranDoc: editor.getState().doc,
        ranSimulation: editor.getState().project.simulation,
      });
      render(
        <EditorProvider store={editor}>
          <SimulationProvider store={store}>
            <WaveformPanel />
          </SimulationProvider>
        </EditorProvider>,
      );
      const root = () => document.querySelector<HTMLElement>(".nodal-waveform") as HTMLElement;
      expect(root().hasAttribute("data-stale")).toBe(false);
      act(() => {
        const d = editor.getState().doc;
        editor.getState().commit({ ...d, labels: [...d.labels] });
      });
      expect(root().getAttribute("data-stale")).toBe("true");
    }
  });
});
