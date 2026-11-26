import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LABEL_SYMBOL, SYMBOLS } from "../symbols/catalog";
import { pinLabelLayout, SymbolFigure } from "./SymbolFigure";

afterEach(cleanup);

describe("pinLabelLayout", () => {
  it("pushes each label outward from the body centre along the dominant axis", () => {
    const bounds = { x0: -2, y0: -2, x1: 2, y1: 2 };
    const at = (x: number, y: number) => pinLabelLayout(bounds, [{ name: "p", x, y }])[0];
    expect(at(-2, 0)).toMatchObject({ anchor: "end" });
    expect(at(-2, 0)?.x).toBeLessThan(-2);
    expect(at(2, 0)).toMatchObject({ anchor: "start" });
    expect(at(2, 0)?.x).toBeGreaterThan(2);
    expect(at(0, -2)).toMatchObject({ anchor: "middle" });
    expect(at(0, -2)?.y).toBeLessThan(-2);
    expect(at(0, 2)?.y).toBeGreaterThan(2);
  });
});

describe("SymbolFigure", () => {
  const items = [...Object.keys(SYMBOLS), "label"] as (keyof typeof SYMBOLS | "label")[];
  it.each(items)("draws a name and a dot for every pin of %s", (item) => {
    const def = item === "label" ? LABEL_SYMBOL : SYMBOLS[item];
    const { container } = render(<SymbolFigure item={item} />);
    const texts = [...container.querySelectorAll(".nodal-codex-pins text")].map(
      (t) => t.textContent,
    );
    expect(texts).toEqual(def.pins.map((p) => p.name));
    expect(container.querySelectorAll("svg circle[data-pin-dot]")).toHaveLength(def.pins.length);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toContain("Pins:");
  });

  it("keeps every label inside the viewBox", () => {
    for (const item of items) {
      const { container, unmount } = render(<SymbolFigure item={item} />);
      const svg = container.querySelector("svg");
      const [vx, vy, vw, vh] = (svg?.getAttribute("viewBox") ?? "").split(" ").map(Number);
      for (const t of container.querySelectorAll(".nodal-codex-pins text")) {
        const x = Number(t.getAttribute("x"));
        const y = Number(t.getAttribute("y"));
        expect(x).toBeGreaterThanOrEqual(vx ?? 0);
        expect(x).toBeLessThanOrEqual((vx ?? 0) + (vw ?? 0));
        expect(y).toBeGreaterThanOrEqual(vy ?? 0);
        expect(y).toBeLessThanOrEqual((vy ?? 0) + (vh ?? 0));
      }
      unmount();
    }
  });
});

describe("one scale for every symbol", () => {
  it("gives different symbols the same label size and width = span x scale", () => {
    const sizes = new Set<string | null>();
    const ratios = new Set<string>();
    for (const item of ["ground", "opamp", "resistor"] as const) {
      const { container, unmount } = render(<SymbolFigure item={item} />);
      const svg = container.querySelector("svg");
      const [, , w] = (svg?.getAttribute("viewBox") ?? "").split(" ").map(Number);
      expect(svg?.style.width).toBe(`calc(var(--codex-grid-scale) * ${String(w)})`);
      for (const t of container.querySelectorAll(".nodal-codex-pins text"))
        sizes.add(t.getAttribute("font-size"));
      for (const c of container.querySelectorAll("circle[data-pin-dot]"))
        ratios.add(c.getAttribute("r") ?? "");
      unmount();
    }
    expect(sizes.size).toBe(1);
    expect(ratios.size).toBe(1);
  });

  it("uses different widths for symbols with different bounds", () => {
    const w = (item: "ground" | "opamp") => {
      const { container, unmount } = render(<SymbolFigure item={item} />);
      const v = container.querySelector("svg")?.style.width;
      unmount();
      return v;
    };
    expect(w("ground")).not.toBe(w("opamp"));
  });
});
