import type { Part, Schematic } from "@nodal/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "./Editor";
import { EditorProvider, useEditorStore } from "./EditorContext";
import { canvas, key, makeStore, moveTo, type Store } from "./testUtils";

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
const DOC: Schematic = { parts: [R1], wires: [], labels: [] };
const PTR = { pointerId: 1, button: 0 };
const at = (x: number, y: number) => ({ clientX: x * 10, clientY: y * 10 });

let store: Store;
beforeEach(() => {
  store = makeStore(DOC);
  store.getState().select(["R1"]);
  render(<Editor store={store} />);
});
afterEach(cleanup);

describe("palette focus", () => {
  it("space_drag_pans_after_picking_a_palette_tool", () => {
    const button = screen.getByRole("button", { name: "Place Resistor" });
    // A browser focuses the button on mouse down unless the event is prevented.
    if (fireEvent.mouseDown(button)) button.focus();
    fireEvent.click(button);
    expect(store.getState().tool.kind).toBe("place");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: " " });
    fireEvent.pointerDown(canvas(), { ...PTR, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(canvas(), { ...PTR, clientX: 80, clientY: 70 });
    fireEvent.pointerUp(canvas(), { ...PTR, clientX: 80, clientY: 70 });
    fireEvent.keyUp(window, { key: " " });
    expect(store.getState().view).toMatchObject({ x: 30, y: 20 });
    expect(store.getState().doc.parts).toHaveLength(1);
  });
});

describe("Escape during a gesture", () => {
  it("esc_during_drag_keeps_selection_and_history", () => {
    fireEvent.pointerDown(screen.getByTestId("part-R1"), { ...PTR, ...at(10, 10) });
    fireEvent.pointerMove(canvas(), { ...PTR, ...at(15, 15) });
    key("Escape");
    fireEvent.pointerUp(canvas(), { ...PTR, ...at(15, 15) });
    expect(store.getState().selection).toEqual(["R1"]);
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().doc).toBe(DOC);
  });

  it("esc_during_shift_box_select_keeps_selection", () => {
    fireEvent.pointerDown(canvas(), { ...PTR, ...at(30, 30), shiftKey: true });
    fireEvent.pointerMove(canvas(), { ...PTR, ...at(40, 40), shiftKey: true });
    key("Escape");
    fireEvent.pointerUp(canvas(), { ...PTR, ...at(40, 40), shiftKey: true });
    expect(store.getState().selection).toEqual(["R1"]);
    expect(store.getState().past).toHaveLength(0);
  });

  it("esc_without_gesture_still_clears_selection", () => {
    key("Escape");
    expect(store.getState().selection).toEqual([]);
  });

  it("second_esc_after_cancelled_drag_clears_selection", () => {
    fireEvent.pointerDown(screen.getByTestId("part-R1"), { ...PTR, ...at(10, 10) });
    fireEvent.pointerMove(canvas(), { ...PTR, ...at(15, 15) });
    key("Escape");
    fireEvent.pointerUp(canvas(), { ...PTR, ...at(15, 15) });
    key("Escape");
    expect(store.getState().selection).toEqual([]);
  });
});

describe("place ghost", () => {
  it("ghost_disappears_on_pointer_leave", () => {
    fireEvent.click(screen.getByRole("button", { name: "Place Resistor" }));
    moveTo(10, 10);
    expect(screen.getByTestId("ghost")).toBeTruthy();
    fireEvent.pointerLeave(canvas());
    expect(screen.queryByTestId("ghost")).toBeNull();
  });

  it("ghost_clears_when_the_item_changes", () => {
    fireEvent.click(screen.getByRole("button", { name: "Place Resistor" }));
    moveTo(10, 10);
    fireEvent.click(screen.getByRole("button", { name: "Place Capacitor" }));
    expect(screen.queryByTestId("ghost")).toBeNull();
    moveTo(12, 12);
    expect(screen.getByTestId("ghost")).toBeTruthy();
  });
});

describe("EditorContext", () => {
  it("hook_outside_provider_names_the_hook_and_provider", () => {
    function Probe() {
      useEditorStore();
      return null;
    }
    const quiet = (e: ErrorEvent) => {
      e.preventDefault();
    };
    window.addEventListener("error", quiet);
    expect(() => render(<Probe />)).toThrow(/useEditorStore.*EditorProvider/);
    window.removeEventListener("error", quiet);
    // Sanity: the same hook works inside the provider.
    expect(() =>
      render(
        <EditorProvider>
          <Probe />
        </EditorProvider>,
      ),
    ).not.toThrow();
  });
});
