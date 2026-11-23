import type { Part, Project } from "@nodal/schema";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorProvider } from "../EditorContext";
import { createEditorStore } from "../store";
import { Canvas } from "./Canvas";

const part = (id: string, x: number, y: number): Part => ({
  id,
  type: "resistor",
  name: id,
  x,
  y,
  rotation: 0,
  mirror: false,
  params: {},
});

/** About 80 x 40 grid units: 800 x 400 px at zoom 1, wider than the 600 x 400 canvas below. */
const WIDE = { parts: [part("a", 5, 5), part("b", 85, 45)], wires: [], labels: [] };
const SMALL = { parts: [part("a", 15, 15), part("b", 25, 25)], wires: [], labels: [] };

let size = { width: 600, height: 400 };
let fire: () => void = () => undefined;

class FakeResizeObserver {
  constructor(private readonly cb: () => void) {}
  observe() {
    const cb = this.cb;
    const previous = fire;
    fire = () => {
      previous();
      cb();
    };
    cb();
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  size = { width: 600, height: 400 };
  fire = () => undefined;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({ ...size, x: 0, y: 0, left: 0, top: 0, right: size.width, bottom: size.height }) as DOMRect,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mount = (doc: typeof WIDE) => {
  const store = createEditorStore({ doc });
  render(
    <EditorProvider store={store}>
      <Canvas />
    </EditorProvider>,
  );
  return store;
};

const projectOf = (doc: typeof WIDE): Project => ({
  ...createEditorStore().getState().getProject(),
  schematic: doc,
});

describe("fit on load", () => {
  it("fits_a_circuit_that_overflows_when_the_editor_mounts_with_a_doc", () => {
    const store = mount(WIDE);
    expect(store.getState().view.zoom).toBeLessThan(1);
  });

  it("leaves_a_circuit_that_fits_alone_and_never_zooms_in", () => {
    const store = mount(SMALL);
    expect(store.getState().view).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("fits_again_when_a_project_is_loaded", () => {
    const store = mount(SMALL);
    act(() => {
      store.getState().loadProject(projectOf(WIDE));
    });
    expect(store.getState().view.zoom).toBeLessThan(1);
  });

  it("does_not_override_a_pan_or_zoom_made_after_the_fit", () => {
    const store = mount(WIDE);
    act(() => {
      store.getState().setView({ x: 10, y: 20, zoom: 1.5 });
    });
    act(() => {
      fire();
    });
    expect(store.getState().view).toEqual({ x: 10, y: 20, zoom: 1.5 });
  });

  it("waits_for_a_measured_canvas", () => {
    size = { width: 0, height: 0 };
    const store = mount(WIDE);
    expect(store.getState().view).toEqual({ x: 0, y: 0, zoom: 1 });
    size = { width: 600, height: 400 };
    act(() => {
      fire();
    });
    expect(store.getState().view.zoom).toBeLessThan(1);
  });
});
