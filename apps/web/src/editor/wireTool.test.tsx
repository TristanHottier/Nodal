import type { Part, Point, Schematic } from "@nodal/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "./Editor";
import { canvas, click, key, makeStore, moveTo, redo, type Store, undo } from "./testUtils";

const res = (id: string, x: number, y: number): Part => ({
  id,
  type: "resistor",
  name: id,
  x,
  y,
  rotation: 0,
  mirror: false,
  params: { value: "1k" },
});

// R1 pins (10,7) and (10,13); R2 pins (20,17) and (20,23).
const DOC: Schematic = { parts: [res("R1", 10, 10), res("R2", 20, 20)], wires: [], labels: [] };

let store: Store;

function setup(doc: Schematic = DOC) {
  store = makeStore(doc);
  render(<Editor store={store} />);
  fireEvent.click(screen.getByRole("button", { name: "Wire" }));
}

const pts = (ps: Point[]) => ps.map((p) => `${String(p.x)},${String(p.y)}`).join(" ");
const preview = () => screen.queryByTestId("wire-preview")?.getAttribute("data-points");

afterEach(cleanup);

describe("wire tool", () => {
  it("draws_l_wire_between_two_pins", () => {
    setup();
    expect(store.getState().tool.kind).toBe("wire");
    click(10, 13);
    moveTo(20, 17);
    expect(preview()).toBe("10,13 20,13 20,17");
    click(20, 17);
    const { wires } = store.getState().doc;
    expect(wires).toHaveLength(1);
    expect(wires[0]?.points).toEqual([
      { x: 10, y: 13 },
      { x: 20, y: 13 },
      { x: 20, y: 17 },
    ]);
    expect((wires[0]?.points.length ?? 0) - 1).toBe(2);
    expect(store.getState().selection).toEqual([]);
    expect(store.getState().tool.kind).toBe("wire");
    expect(preview()).toBeUndefined();
  });

  it("slash_toggles_bend", () => {
    setup();
    click(10, 13);
    moveTo(20, 17);
    expect(preview()).toBe("10,13 20,13 20,17");
    key("/");
    expect(preview()).toBe("10,13 10,17 20,17");
    click(20, 17);
    expect(store.getState().doc.wires[0]?.points).toEqual([
      { x: 10, y: 13 },
      { x: 10, y: 17 },
      { x: 20, y: 17 },
    ]);
  });

  it("click_on_wire_interior_ends_wire_with_dot", () => {
    setup({
      ...DOC,
      wires: [
        {
          id: "w0",
          points: [
            { x: 0, y: 30 },
            { x: 20, y: 30 },
          ],
        },
      ],
    });
    click(10, 40);
    moveTo(10, 30);
    click(10, 30);
    const { wires } = store.getState().doc;
    expect(wires).toHaveLength(2);
    expect(pts(wires[1]?.points ?? [])).toBe("10,40 10,30");
    const dots = screen.getAllByTestId("junction");
    expect(dots).toHaveLength(1);
    expect(dots[0]?.getAttribute("data-x")).toBe("10");
    expect(dots[0]?.getAttribute("data-y")).toBe("30");
  });

  it("click_on_own_start_does_not_end_wire", () => {
    setup();
    click(30, 30);
    click(30, 30);
    expect(store.getState().doc.wires).toHaveLength(0);
    expect(store.getState().past).toHaveLength(0);
  });

  it("double_click_commits_fixed_points", () => {
    setup();
    click(30, 30);
    click(40, 35);
    moveTo(50, 35);
    fireEvent.doubleClick(canvas(), { clientX: 400, clientY: 350 });
    expect(store.getState().doc.wires[0]?.points).toEqual([
      { x: 30, y: 30 },
      { x: 40, y: 30 },
      { x: 40, y: 35 },
    ]);
  });

  it("escape_discards_wire", () => {
    setup();
    click(30, 30);
    moveTo(40, 35);
    expect(preview()).toBeDefined();
    key("Escape");
    expect(preview()).toBeUndefined();
    expect(store.getState().doc.wires).toHaveLength(0);
    expect(store.getState().tool.kind).toBe("wire");
    key("Escape");
    expect(store.getState().tool.kind).toBe("select");
  });

  it("enter_commits_wire", () => {
    setup();
    click(30, 30);
    click(40, 35);
    moveTo(50, 35);
    key("Enter");
    expect(store.getState().doc.wires[0]?.points).toEqual([
      { x: 30, y: 30 },
      { x: 40, y: 30 },
      { x: 40, y: 35 },
    ]);
    expect(preview()).toBeUndefined();
    // A lone first click commits nothing.
    click(60, 60);
    key("Enter");
    expect(store.getState().doc.wires).toHaveLength(1);
  });

  it("wire_undo_redo", () => {
    setup();
    const before = store.getState().doc;
    click(10, 13);
    click(20, 17);
    const after = store.getState().doc;
    expect(after.wires).toHaveLength(1);
    undo();
    expect(store.getState().doc).toEqual(before);
    redo();
    expect(store.getState().doc).toEqual(after);
  });

  it("click_on_label_anchor_ends_wire", () => {
    setup({ ...DOC, labels: [{ id: "L1", text: "VOUT", x: 30, y: 30, rotation: 0 }] });
    click(10, 13);
    click(30, 30);
    const { wires } = store.getState().doc;
    expect(wires).toHaveLength(1);
    expect(wires[0]?.points.at(-1)).toEqual({ x: 30, y: 30 });
    expect(preview()).toBeUndefined();
  });

  it("click_on_wire_bend_ends_wire", () => {
    const bent: Schematic = {
      ...DOC,
      wires: [
        {
          id: "w0",
          points: [
            { x: 30, y: 0 },
            { x: 30, y: 5 },
            { x: 40, y: 5 },
          ],
        },
      ],
    };
    setup(bent);
    click(10, 13);
    click(30, 5);
    expect(store.getState().doc.wires).toHaveLength(2);
    expect(preview()).toBeUndefined();
  });
});
