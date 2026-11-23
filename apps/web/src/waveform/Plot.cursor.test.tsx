import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A stand-in chart: the plot area is 100 px wide and maps pixels to values one to one.
const overs: HTMLElement[] = [];
vi.mock("uplot/dist/uPlot.min.css", () => ({}));
vi.mock("uplot", () => ({
  default: class {
    static pxRatio = 1;
    over = document.createElement("div");
    width = 100;
    bbox = { left: 0, top: 0, width: 100, height: 50 };
    constructor() {
      this.over.getBoundingClientRect = () => new DOMRect(0, 0, 100, 50);
      this.over.setPointerCapture = () => undefined;
      this.over.releasePointerCapture = () => undefined;
      this.over.hasPointerCapture = () => true;
      overs.push(this.over);
    }
    valToPos(v: number) {
      return v;
    }
    posToVal(p: number) {
      return p;
    }
    setData() {}
    redraw() {}
    setSize() {}
    destroy() {}
  },
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

import { Plot } from "./Plot";

afterEach(cleanup);

const axis = new Float64Array(Array.from({ length: 40 }, (_, i) => i));
const base = {
  x: axis,
  series: [{ label: "V(a)", values: axis, color: "var(--color-trace-1)" }],
  logX: false,
  xLabel: "Time (s)",
  yLabel: "Value",
  cursors: { a: 10, b: 60 },
  activeCursor: "a" as const,
  onActiveCursor: () => undefined,
  onClearCursor: () => undefined,
  height: 100,
};

describe("Plot keys", () => {
  it("shift_arrow_moves_ten_samples_and_arrow_one", () => {
    const onCursor = vi.fn();
    const { getByTestId } = render(<Plot {...base} onCursor={onCursor} />);
    const plot = getByTestId("plot");
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    expect(onCursor).toHaveBeenLastCalledWith("a", 11);
    fireEvent.keyDown(plot, { key: "ArrowRight", shiftKey: true });
    expect(onCursor).toHaveBeenLastCalledWith("a", 20);
    fireEvent.keyDown(plot, { key: "ArrowLeft", shiftKey: true });
    expect(onCursor).toHaveBeenLastCalledWith("a", 0);
  });
});

describe("Plot pointer", () => {
  it("a_click_after_a_drag_does_not_place_a_cursor", () => {
    vi.useFakeTimers();
    const onCursor = vi.fn();
    render(<Plot {...base} onCursor={onCursor} />);
    const over = overs.at(-1) as HTMLElement;
    const at = (type: string, x: number) =>
      fireEvent(over, new MouseEvent(type, { clientX: x, button: 0, bubbles: true }));
    // Grab A at 10, drag it past B, release on B's line, then the browser sends a click there.
    at("pointerdown", 10);
    at("pointermove", 60);
    at("pointerup", 60);
    onCursor.mockClear();
    at("click", 60);
    expect(onCursor).not.toHaveBeenCalled();
    // The guard lasts for one click only: the next click places a cursor again.
    at("click", 30);
    expect(onCursor).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
