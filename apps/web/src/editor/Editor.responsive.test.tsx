import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import { canvas, click, drag, makeStore, moveTo } from "./testUtils";
import type { Schematic } from "@nodal/schema";

const NOTICE =
  "Nodal's editor needs a window at least 1024 px wide. The schematic is shown read-only.";

const DOC: Schematic = {
  parts: [
    {
      id: "R1",
      type: "resistor",
      name: "R1",
      x: 10,
      y: 10,
      rotation: 0,
      mirror: false,
      params: { value: "1k" },
    },
  ],
  wires: [],
  labels: [],
};

/** A matchMedia whose `(min-width)` match can be flipped, notifying listeners. */
function mockMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
  return (next: boolean) => {
    matches = next;
    act(() => {
      listeners.forEach((l) => {
        l();
      });
    });
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Editor below 1024 px", () => {
  it("shows_notice_and_hides_editing_chrome", () => {
    mockMedia(false);
    render(<Editor store={makeStore(DOC)} />);
    expect(screen.getByRole("status").textContent).toBe(NOTICE);
    expect(screen.getByTestId("schematic-canvas")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Palette" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });

  it("drag_does_not_move_a_part_and_wheel_still_zooms", () => {
    mockMedia(false);
    const store = makeStore(DOC);
    render(<Editor store={store} />);
    const before = store.getState().doc;
    drag(canvas(), [10, 10], [20, 20]);
    expect(store.getState().doc).toBe(before);
    expect(store.getState().selection).toEqual([]);
    const zoom = store.getState().view.zoom;
    fireEvent.wheel(canvas(), { deltaY: -100, clientX: 100, clientY: 100 });
    expect(store.getState().view.zoom).toBeGreaterThan(zoom);
  });

  it("drag_pans_the_view", () => {
    mockMedia(false);
    const store = makeStore(DOC);
    render(<Editor store={store} />);
    const { x } = store.getState().view;
    drag(canvas(), [10, 10], [20, 10]);
    expect(store.getState().view.x).toBe(x + 100);
  });

  it("shrinking_mid_wire_cancels_it", () => {
    const flip = mockMedia(true);
    const store = makeStore(DOC);
    render(<Editor store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "Wire" }));
    click(10, 13);
    moveTo(20, 13);
    expect(screen.queryByTestId("wire-preview")).not.toBeNull();
    flip(false);
    expect(store.getState().doc.wires).toHaveLength(0);
    expect(store.getState().tool.kind).toBe("select");
    expect(screen.queryByTestId("wire-preview")).toBeNull();
    flip(true);
    // Back to wide: the half wire did not come back.
    expect(screen.queryByTestId("wire-preview")).toBeNull();
    expect(store.getState().doc.wires).toHaveLength(0);
  });

  it("shrinking_mid_drag_drops_the_gesture", () => {
    const flip = mockMedia(true);
    const store = makeStore(DOC);
    render(<Editor store={store} />);
    fireEvent.pointerDown(canvas().querySelector("[data-item-id]") ?? canvas(), {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    expect(store.getState().gestureActive).toBe(true);
    flip(false);
    expect(store.getState().gestureActive).toBe(false);
    expect(store.getState().doc).toEqual(DOC);
  });
});
