import type { Schematic } from "@nodal/schema";
import { EMPTY_SCHEMATIC } from "@nodal/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PALETTE, SYMBOLS } from "../symbols/catalog";
import { Editor } from "./Editor";
import { click, drag, key, makeStore, moveTo, redo, type Store, undo } from "./testUtils";

type Item = (typeof PALETTE)[number];
type AnyItem = { id: string; x: number; y: number; rotation: number; mirror?: boolean };

const buttonName = (item: Item) => `Place ${item === "label" ? "net label" : SYMBOLS[item].label}`;

const items = (doc: Schematic): AnyItem[] => [...doc.parts, ...doc.labels];

let store: Store;
beforeEach(() => {
  store = makeStore();
  render(<Editor store={store} status={<p data-testid="engine-status">ok</p>} />);
});
afterEach(cleanup);

/** Runs `action`, checks the doc changed, then that undo and redo restore before and after. */
function step(action: () => void): { before: Schematic; after: Schematic } {
  const before = store.getState().doc;
  action();
  const after = store.getState().doc;
  expect(after).not.toEqual(before);
  undo();
  expect(store.getState().doc).toEqual(before);
  redo();
  expect(store.getState().doc).toEqual(after);
  return { before, after };
}

describe("Editor", () => {
  it("renders_palette_canvas_status", () => {
    expect(screen.getByTestId("engine-status").textContent).toBe("ok");
    expect(screen.getByTestId("schematic-canvas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getAllByRole("button")).toHaveLength(PALETTE.length + 2);
    fireEvent.click(screen.getByRole("button", { name: "Wire" }));
    expect(screen.getByRole("button", { name: "Wire" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it.each(PALETTE)("%s: place, move, rotate, mirror, copy/paste, delete", (item) => {
    const isLabel = item === "label";
    const palette = screen.getByRole("button", { name: buttonName(item) });
    fireEvent.click(palette);
    expect(palette.getAttribute("aria-pressed")).toBe("true");

    // Place: the ghost follows the cursor, a click commits and selects the new item.
    moveTo(10, 10);
    expect(screen.getByTestId("ghost")).toBeTruthy();
    let selectedOnPlace: readonly string[] = [];
    step(() => {
      click(10, 10);
      selectedOnPlace = store.getState().selection;
    });
    const placed = items(store.getState().doc);
    expect(placed).toHaveLength(1);
    const id = placed[0]?.id ?? "";
    expect(placed[0]).toMatchObject({ x: 10, y: 10, rotation: 0 });
    expect(selectedOnPlace).toEqual([id]);
    expect(store.getState().tool.kind).toBe("place");
    if (!isLabel) {
      expect(store.getState().doc.parts[0]?.type).toBe(item);
      expect(store.getState().doc.parts[0]?.name).toMatch(/\d$/);
    }

    key("Escape");
    expect(store.getState().tool.kind).toBe("select");
    expect(palette.getAttribute("aria-pressed")).toBe("false");

    const el = () => screen.getByTestId(`${isLabel ? "label" : "part"}-${id}`);
    const find = (doc: Schematic, wanted: string) => items(doc).find((i) => i.id === wanted);

    // Move: drag from the item to (14, 12).
    step(() => {
      drag(el(), [10, 10], [14, 12]);
    });
    expect(find(store.getState().doc, id)).toMatchObject({ x: 14, y: 12 });
    expect(store.getState().selection).toEqual([id]);

    // Rotate.
    step(() => {
      key("r");
    });
    expect(find(store.getState().doc, id)?.rotation).toBe(90);

    // Mirror (parts only; X on a label does nothing).
    if (isLabel) {
      const before = store.getState().doc;
      key("x");
      expect(store.getState().doc).toBe(before);
    } else {
      step(() => {
        key("x");
      });
      expect(find(store.getState().doc, id)?.mirror).toBe(true);
    }

    // Copy / paste: a second item with a fresh id (and a fresh name for parts).
    key("c", { ctrl: true });
    let selectedOnPaste: readonly string[] = [];
    const { after } = step(() => {
      key("v", { ctrl: true });
      selectedOnPaste = store.getState().selection;
    });
    const all = items(after);
    expect(all).toHaveLength(2);
    const copy = all.find((i) => i.id !== id);
    expect(copy).toBeDefined();
    expect(copy).toMatchObject({ x: 16, y: 14, rotation: 90 });
    if (!isLabel) {
      const [a, b] = after.parts;
      expect(a?.name).not.toBe(b?.name);
    }
    expect(selectedOnPaste).toEqual([copy?.id]);

    // Delete the original: click it to select, then Delete.
    click(14, 12, el());
    expect(store.getState().selection).toEqual([id]);
    step(() => {
      key("Delete");
    });
    const rest = items(store.getState().doc);
    expect(rest.map((i) => i.id)).toEqual([copy?.id]);
    expect(store.getState().selection).toEqual([]);
  });

  it("shortcuts_ignored_in_inputs", () => {
    store
      .getState()
      .commit({ ...EMPTY_SCHEMATIC, labels: [{ id: "L", text: "A", x: 5, y: 5, rotation: 0 }] }, [
        "L",
      ]);
    const input = document.createElement("input");
    document.body.appendChild(input);
    const before = store.getState().doc;
    for (const k of ["r", "x", "Delete", "Backspace", "w"]) fireEvent.keyDown(input, { key: k });
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    expect(store.getState().doc).toBe(before);
    expect(store.getState().tool.kind).toBe("select");
    expect(store.getState().past).toHaveLength(1);
    input.remove();
  });

  it("escape_returns_to_select", () => {
    fireEvent.click(screen.getByRole("button", { name: buttonName("resistor") }));
    key("Escape");
    expect(store.getState().tool.kind).toBe("select");
    key("w");
    expect(store.getState().tool.kind).toBe("wire");
    key("Escape");
    expect(store.getState().tool.kind).toBe("select");
    store.getState().select(["x"]);
    key("Escape");
    expect(store.getState().selection).toEqual([]);
  });

  it("place_rotate_mirror_applies_to_ghost_and_part", () => {
    fireEvent.click(screen.getByRole("button", { name: buttonName("npn") }));
    key("r");
    key("x");
    expect(store.getState().tool).toMatchObject({ kind: "place", rotation: 90, mirror: true });
    moveTo(10, 10);
    expect(screen.getByTestId("ghost").getAttribute("transform")).toBe(
      "translate(10 10) rotate(90) scale(-1 1)",
    );
    click(10, 10);
    expect(store.getState().doc.parts[0]).toMatchObject({ rotation: 90, mirror: true });
    // Placing again keeps the tool active.
    click(20, 10);
    expect(store.getState().doc.parts).toHaveLength(2);
  });
});
