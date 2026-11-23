import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

interface Opts {
  axes: { grid: { stroke: string } }[];
  series: { stroke?: string }[];
}
const created: Opts[] = [];
let destroyed = 0;
vi.mock("uplot/dist/uPlot.min.css", () => ({}));
vi.mock("uplot", () => ({
  default: class {
    over = document.createElement("div");
    width = 100;
    bbox = { left: 0, top: 0, width: 0, height: 0 };
    constructor(opts: Opts) {
      created.push(opts);
    }
    setData() {}
    redraw() {}
    setSize() {}
    destroy() {
      destroyed += 1;
    }
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

afterEach(() => {
  cleanup();
  created.length = 0;
  destroyed = 0;
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-theme");
});

const f = (...v: number[]) => new Float64Array(v);
const props = {
  x: f(0, 1),
  series: [{ label: "V(a)", values: f(0, 1), color: "var(--color-trace-1)" }],
  logX: false,
  xLabel: "Time (s)",
  yLabel: "Value",
  cursors: { a: 0.5, b: null },
  activeCursor: "a" as const,
  onCursor: () => undefined,
  onActiveCursor: () => undefined,
  onClearCursor: () => undefined,
  height: 100,
};

describe("Plot theme", () => {
  it("rebuilds_with_the_new_theme_colors_and_keeps_props", async () => {
    const root = document.documentElement;
    root.style.setProperty("--color-plot-grid", "light-grid");
    root.style.setProperty("--color-trace-1", "light-trace");
    render(<Plot {...props} />);
    expect(created).toHaveLength(1);
    expect(created[0]?.axes[0]?.grid.stroke).toBe("light-grid");
    expect(created[0]?.series[1]?.stroke).toBe("light-trace");
    act(() => {
      root.style.setProperty("--color-plot-grid", "dark-grid");
      root.style.setProperty("--color-trace-1", "dark-trace");
      root.setAttribute("data-theme", "dark");
    });
    await waitFor(() => {
      expect(created).toHaveLength(2);
    });
    expect(destroyed).toBe(1);
    expect(created).toHaveLength(2);
    expect(created[1]?.axes[0]?.grid.stroke).toBe("dark-grid");
    expect(created[1]?.series[1]?.stroke).toBe("dark-trace");
  });
});
