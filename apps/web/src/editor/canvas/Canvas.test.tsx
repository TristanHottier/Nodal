import type { Part, Schematic } from "@nodal/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SimulationProvider } from "../../simulation/SimulationContext";
import { createSimulationStore } from "../../simulation/store";
import { fakeRunner } from "../../simulation/testFixtures";
import { EditorProvider } from "../EditorContext";
import { createEditorStore } from "../store";
import { Canvas } from "./Canvas";

const R1: Part = {
  id: "R1",
  type: "resistor",
  name: "R1",
  x: 10,
  y: 10,
  rotation: 0,
  mirror: false,
  params: { value: "1k" },
};

// R1 pins at (10,7) and (10,13); three wires end on the (10,13) pin: a junction.
const DOC: Schematic = {
  parts: [R1],
  wires: [
    {
      id: "wA",
      points: [
        { x: 10, y: 13 },
        { x: 20, y: 13 },
      ],
    },
    {
      id: "wB",
      points: [
        { x: 10, y: 13 },
        { x: 10, y: 20 },
      ],
    },
    {
      id: "wC",
      points: [
        { x: 0, y: 13 },
        { x: 10, y: 13 },
      ],
    },
  ],
  labels: [{ id: "L1", text: "VDD", x: 30, y: 30, rotation: 0 }],
};

let store: ReturnType<typeof createEditorStore>;

function setup() {
  store = createEditorStore({ doc: DOC });
  render(
    <EditorProvider store={store}>
      <Canvas />
    </EditorProvider>,
  );
  return screen.getByTestId("schematic-canvas");
}

const at = (wx: number, wy: number) => ({ clientX: wx * 10, clientY: wy * 10 });
const ptr = { pointerId: 1, button: 0 };

let svg: HTMLElement;
beforeEach(() => {
  svg = setup();
});
afterEach(cleanup);

describe("Canvas", () => {
  it("renders_parts_wires_dots", () => {
    expect(screen.getByTestId("part-R1")).toBeTruthy();
    expect(screen.getByTestId("wire-wA")).toBeTruthy();
    expect(screen.getByTestId("label-L1").textContent).toContain("VDD");
    const dots = screen.getAllByTestId("junction");
    expect(dots).toHaveLength(1);
    expect(dots[0]?.getAttribute("data-x")).toBe("10");
    expect(dots[0]?.getAttribute("data-y")).toBe("13");
  });

  it("click_selects", () => {
    fireEvent.pointerDown(screen.getByTestId("part-R1"), { ...ptr, ...at(10, 10) });
    fireEvent.pointerUp(svg, { ...ptr, ...at(10, 10) });
    expect(store.getState().selection).toEqual(["R1"]);
    expect(screen.getByTestId("part-R1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("part-R1").classList.contains("selected")).toBe(true);
  });

  it("shift_click_toggles", () => {
    store.getState().select(["wA"]);
    const part = screen.getByTestId("part-R1");
    fireEvent.pointerDown(part, { ...ptr, ...at(10, 10), shiftKey: true });
    fireEvent.pointerUp(svg, { ...ptr, ...at(10, 10), shiftKey: true });
    expect([...store.getState().selection].sort()).toEqual(["R1", "wA"]);
    fireEvent.pointerDown(part, { ...ptr, ...at(10, 10), shiftKey: true });
    fireEvent.pointerUp(svg, { ...ptr, ...at(10, 10), shiftKey: true });
    expect(store.getState().selection).toEqual(["wA"]);
  });

  it("click_empty_clears", () => {
    store.getState().select(["R1"]);
    fireEvent.pointerDown(svg, { ...ptr, ...at(50, 50) });
    fireEvent.pointerUp(svg, { ...ptr, ...at(50, 50) });
    expect(store.getState().selection).toEqual([]);
  });

  it("box_select", () => {
    fireEvent.pointerDown(svg, { ...ptr, ...at(8, 6) });
    fireEvent.pointerMove(svg, { ...ptr, ...at(12, 14) });
    expect(screen.getByTestId("selection-box")).toBeTruthy();
    fireEvent.pointerUp(svg, { ...ptr, ...at(12, 14) });
    expect(store.getState().selection).toEqual(["R1"]);
    expect(screen.queryByTestId("selection-box")).toBeNull();
    // Shift adds: a box around the label.
    fireEvent.pointerDown(svg, { ...ptr, ...at(29, 28), shiftKey: true });
    fireEvent.pointerMove(svg, { ...ptr, ...at(36, 32), shiftKey: true });
    fireEvent.pointerUp(svg, { ...ptr, ...at(36, 32), shiftKey: true });
    expect([...store.getState().selection].sort()).toEqual(["L1", "R1"]);
  });

  it("drag_moves_and_commits_once", () => {
    const part = screen.getByTestId("part-R1");
    fireEvent.pointerDown(part, { ...ptr, ...at(10, 10) });
    fireEvent.pointerMove(svg, { ...ptr, ...at(12, 11) });
    fireEvent.pointerMove(svg, { ...ptr, ...at(13, 12) });
    // Live preview, nothing committed yet.
    expect(part.getAttribute("transform")).toContain("translate(13 12)");
    expect(store.getState().past).toHaveLength(0);
    fireEvent.pointerUp(svg, { ...ptr, ...at(13, 12) });
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().doc.parts[0]).toMatchObject({ x: 13, y: 12 });
    expect(store.getState().selection).toEqual(["R1"]);
  });

  /** Commits one real move (R1 to 13,12) so later checks see a non-empty history. */
  function commitOneMove() {
    fireEvent.pointerDown(screen.getByTestId("part-R1"), { ...ptr, ...at(10, 10) });
    fireEvent.pointerMove(svg, { ...ptr, ...at(13, 12) });
    fireEvent.pointerUp(svg, { ...ptr, ...at(13, 12) });
    expect(store.getState().past).toHaveLength(1);
    return store.getState().doc;
  }

  it("zero_drag_adds_no_history", () => {
    const moved = commitOneMove();
    fireEvent.pointerDown(screen.getByTestId("part-R1"), { ...ptr, ...at(13, 12) });
    fireEvent.pointerMove(svg, { clientX: 132, clientY: 121, ...ptr });
    fireEvent.pointerUp(svg, { clientX: 132, clientY: 121, ...ptr });
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().doc).toBe(moved);
    store.getState().undo();
    expect(store.getState().doc).toBe(DOC);
  });

  it("escape_cancels_drag", () => {
    const moved = commitOneMove();
    fireEvent.pointerDown(screen.getByTestId("part-R1"), { ...ptr, ...at(13, 12) });
    fireEvent.pointerMove(svg, { ...ptr, ...at(18, 17) });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(svg, { ...ptr, ...at(18, 17) });
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().doc).toBe(moved);
    expect(screen.getByTestId("part-R1").getAttribute("transform")).toContain("translate(13 12)");
    store.getState().undo();
    expect(store.getState().doc).toBe(DOC);
  });

  it("escape_cancels_box_select", () => {
    fireEvent.pointerDown(svg, { ...ptr, ...at(8, 6) });
    fireEvent.pointerMove(svg, { ...ptr, ...at(12, 14) });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(svg, { ...ptr, ...at(12, 14) });
    expect(store.getState().selection).toEqual([]);
    expect(screen.queryByTestId("selection-box")).toBeNull();
  });

  it("pointer_cancel_cancels_drag", () => {
    fireEvent.pointerDown(screen.getByTestId("part-R1"), { ...ptr, ...at(10, 10) });
    fireEvent.pointerMove(svg, { ...ptr, ...at(15, 15) });
    fireEvent.pointerCancel(svg, { ...ptr });
    fireEvent.pointerUp(svg, { ...ptr, ...at(15, 15) });
    expect(store.getState().past).toHaveLength(0);
    expect(screen.getByTestId("part-R1").getAttribute("transform")).toContain("translate(10 10)");
  });

  it("wire_hit_stroke_is_non_scaling", () => {
    const hit = screen.getByTestId("wire-wA").querySelectorAll("polyline")[1];
    expect(hit?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });

  it("space_on_button_not_prevented", () => {
    const b = document.createElement("button");
    document.body.appendChild(b);
    const ev = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    b.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    b.remove();
  });

  it("window_blur_resets_space", () => {
    fireEvent.keyDown(window, { key: " " });
    fireEvent.blur(window);
    fireEvent.pointerDown(svg, { ...ptr, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { ...ptr, clientX: 90, clientY: 80 });
    fireEvent.pointerUp(svg, { ...ptr, clientX: 90, clientY: 80 });
    expect(store.getState().view).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("wheel_zooms_about_cursor", () => {
    fireEvent.wheel(svg, { deltaY: -100, ...at(10, 10) });
    const v = store.getState().view;
    expect(v.zoom).toBeCloseTo(1.1, 9);
    expect(v.x + 10 * 10 * v.zoom).toBeCloseTo(100, 9);
    expect(v.y + 10 * 10 * v.zoom).toBeCloseTo(100, 9);
    fireEvent.wheel(svg, { deltaY: 100, ...at(10, 10) });
    expect(store.getState().view.zoom).toBeCloseTo(1, 9);
  });

  it("space_drag_pans", () => {
    fireEvent.keyDown(window, { key: " " });
    fireEvent.pointerDown(svg, { ...ptr, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { ...ptr, clientX: 80, clientY: 70 });
    fireEvent.pointerUp(svg, { ...ptr, clientX: 80, clientY: 70 });
    fireEvent.keyUp(window, { key: " " });
    expect(store.getState().view).toMatchObject({ x: 30, y: 20, zoom: 1 });
    expect(store.getState().selection).toEqual([]);
  });

  it("middle_drag_pans", () => {
    fireEvent.pointerDown(svg, { pointerId: 1, button: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 40, clientY: 45 });
    fireEvent.pointerUp(svg, { pointerId: 1, button: 1, clientX: 40, clientY: 45 });
    expect(store.getState().view).toMatchObject({ x: -10, y: -5 });
  });

  it("click_after_pan_at_zoom_extremes_hits_grid_point", () => {
    store.getState().setView({ x: 37, y: -53, zoom: 8 });
    // Drag preview uses the snapped world delta: move by exactly (1,1) grid = 80 px.
    fireEvent.pointerDown(screen.getByTestId("part-R1"), {
      ...ptr,
      clientX: 37 + 800,
      clientY: -53 + 800,
    });
    fireEvent.pointerMove(svg, { ...ptr, clientX: 37 + 880, clientY: -53 + 880 });
    fireEvent.pointerUp(svg, { ...ptr, clientX: 37 + 880, clientY: -53 + 880 });
    expect(store.getState().doc.parts[0]).toMatchObject({ x: 11, y: 11 });
  });

  it("failed_status_marks_items", () => {
    cleanup();
    const sim = createSimulationStore({ runner: fakeRunner() });
    const editor = createEditorStore({ doc: DOC });
    render(
      <EditorProvider store={editor}>
        <SimulationProvider store={sim}>
          <Canvas />
        </SimulationProvider>
      </EditorProvider>,
    );
    expect(screen.getByTestId("wire-wA").getAttribute("class")).not.toContain("sim-error");
    act(() => {
      sim.setState({
        status: {
          kind: "failed",
          message: "x",
          partIds: ["R1"],
          wireIds: ["wB"],
          labelIds: ["L1"],
        },
      });
    });
    expect(screen.getByTestId("part-R1").getAttribute("class")).toContain("sim-error");
    expect(screen.getByTestId("wire-wB").getAttribute("class")).toContain("sim-error");
    expect(screen.getByTestId("label-L1").getAttribute("class")).toContain("sim-error");
    expect(screen.getByTestId("wire-wA").getAttribute("class")).not.toContain("sim-error");
  });

  it("op_tags_render_and_dim_when_stale", () => {
    cleanup();
    const sim = createSimulationStore({ runner: fakeRunner() });
    const editor = createEditorStore({ doc: DOC });
    render(
      <EditorProvider store={editor}>
        <SimulationProvider store={sim}>
          <Canvas />
        </SimulationProvider>
      </EditorProvider>,
    );
    expect(document.querySelector(".nodal-op-tag")).toBeNull();
    const doc = editor.getState().doc;
    const net = "VDD";
    act(() => {
      sim.setState({
        status: { kind: "done" },
        result: {
          type: "op",
          axis: new Float64Array(0),
          signals: [{ name: net, kind: "v", re: new Float64Array([2.5]) }],
        },
        ranDoc: doc,
        ranSimulation: editor.getState().project.simulation,
        map: {
          partOfElement: new Map(),
          netOfPin: new Map(),
          netOfWire: new Map(),
          netOfLabel: new Map([["L1", net]]),
        },
      });
    });
    const tag = document.querySelector(".nodal-op-tag");
    expect(tag?.textContent).toBe("2.5 V");
    expect(tag?.getAttribute("x")).toBe("30.3");
    const group = () => document.querySelector<SVGElement>(".nodal-op-tags");
    expect(group()?.style.opacity).toBe("1");
    act(() => {
      editor.getState().commit({ ...doc, labels: [...doc.labels] });
    });
    expect(group()?.style.opacity).toBe("0.5");
  });
});
