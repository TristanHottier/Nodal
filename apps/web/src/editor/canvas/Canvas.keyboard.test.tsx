import type { Part, Schematic } from "@nodal/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
const wire = (id: string, y: number) => ({
  id,
  points: [
    { x: 0, y },
    { x: 10, y },
  ],
});
const DOC: Schematic = {
  parts: [R1],
  wires: [wire("wA", 13), wire("wB", 14), wire("wC", 15)],
  labels: [{ id: "L1", text: "VDD", x: 30, y: 30, rotation: 0 }],
};

let store: ReturnType<typeof createEditorStore>;
let svg: HTMLElement;
beforeEach(() => {
  store = createEditorStore({ doc: DOC });
  render(
    <EditorProvider store={store}>
      <Canvas />
    </EditorProvider>,
  );
  svg = screen.getByTestId("schematic-canvas");
});
afterEach(cleanup);

describe("Canvas keyboard selection", () => {
  const key = (k: string, init: object = {}) => fireEvent.keyDown(svg, { key: k, ...init });

  it("arrow_keys_step_through_parts_wires_and_labels", () => {
    const seen: string[] = [];
    for (const k of ["ArrowRight", "ArrowDown", "ArrowDown", "ArrowRight", "ArrowRight"]) {
      key(k);
      seen.push(store.getState().selection.join(","));
    }
    expect(seen).toEqual(["R1", "wA", "wB", "wC", "L1"]);
    key("ArrowLeft");
    expect(store.getState().selection).toEqual(["wC"]);
    key("ArrowUp");
    expect(store.getState().selection).toEqual(["wB"]);
  });

  it("leaves_tab_alone_so_focus_can_leave_the_canvas", () => {
    expect(fireEvent.keyDown(svg, { key: "Tab" })).toBe(true);
    expect(store.getState().selection).toEqual([]);
    expect(fireEvent.keyDown(svg, { key: "ArrowRight" })).toBe(false);
  });

  it("ignores_modified_arrows_and_keys_from_other_targets", () => {
    key("ArrowRight", { ctrlKey: true });
    key("ArrowRight", { shiftKey: true });
    fireEvent.keyDown(screen.getByTestId("part-R1"), { key: "ArrowRight" });
    expect(store.getState().selection).toEqual([]);
  });

  it("does_nothing_in_another_tool", () => {
    store.getState().setTool({ kind: "wire" });
    key("ArrowRight");
    expect(store.getState().selection).toEqual([]);
  });

  it("selects_nothing_when_read_only", () => {
    cleanup();
    store = createEditorStore({ doc: DOC });
    render(
      <EditorProvider store={store}>
        <Canvas readOnly />
      </EditorProvider>,
    );
    fireEvent.keyDown(screen.getByTestId("schematic-canvas"), { key: "ArrowRight" });
    expect(store.getState().selection).toEqual([]);
  });
});
