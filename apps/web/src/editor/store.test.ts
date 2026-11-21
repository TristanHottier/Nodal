import { EMPTY_SCHEMATIC, type Schematic } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "./store";

function docWith(...ids: string[]): Schematic {
  return {
    ...EMPTY_SCHEMATIC,
    wires: ids.map((id) => ({
      id,
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    })),
  };
}

function counter(): () => string {
  let n = 0;
  return () => `n${String(++n)}`;
}

describe("editor store", () => {
  it("commit_pushes_history", () => {
    const store = createEditorStore({ newId: counter() });
    const a = docWith("a");
    store.getState().commit(a, ["a"]);
    const s = store.getState();
    expect(s.doc).toBe(a);
    expect(s.past).toHaveLength(1);
    expect(s.past[0]).toBe(store.getState().past[0]);
    expect(s.selection).toEqual(["a"]);
  });

  it("same_doc_no_history", () => {
    const store = createEditorStore();
    store.getState().select(["x"]);
    const before = store.getState();
    store.getState().commit(before.doc, ["y"]);
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().selection).toEqual(["x"]);
  });

  it("undo_redo_roundtrip", () => {
    const store = createEditorStore();
    const initial = store.getState().doc;
    const a = docWith("a");
    store.getState().commit(a);
    store.getState().undo();
    expect(store.getState().doc).toBe(initial);
    expect(store.getState().future).toHaveLength(1);
    store.getState().redo();
    expect(store.getState().doc).toBe(a);
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().future).toHaveLength(0);
  });

  it("new_commit_clears_future", () => {
    const store = createEditorStore();
    store.getState().commit(docWith("a"));
    store.getState().undo();
    store.getState().commit(docWith("b"));
    expect(store.getState().future).toHaveLength(0);
  });

  it("history_capped_at_500", () => {
    const store = createEditorStore();
    const first = store.getState().doc;
    for (let i = 0; i < 510; i++) store.getState().commit(docWith(`w${String(i)}`));
    const { past } = store.getState();
    expect(past).toHaveLength(500);
    expect(past[0]).not.toBe(first);
    expect(past[499]).toEqual(docWith("w508"));
  });

  it("undo_prunes_selection", () => {
    const store = createEditorStore();
    store.getState().commit(docWith("a"), ["a"]);
    store.getState().undo();
    expect(store.getState().selection).toEqual([]);
    store.getState().redo();
    store.getState().select(["a", "zz"]);
    store.getState().undo();
    expect(store.getState().selection).toEqual([]);
  });

  it("undo_on_empty_is_noop", () => {
    const store = createEditorStore();
    const before = store.getState();
    store.getState().undo();
    store.getState().redo();
    expect(store.getState()).toBe(before);
  });

  it("copy_paste_selects_pasted", () => {
    const store = createEditorStore({ doc: docWith("a"), newId: counter() });
    store.getState().paste();
    expect(store.getState().past).toHaveLength(0);
    store.getState().copy();
    expect(store.getState().clipboard).toBeNull();
    store.getState().select(["a"]);
    store.getState().copy();
    store.getState().paste();
    const s = store.getState();
    expect(s.doc.wires).toHaveLength(2);
    expect(s.pasteCount).toBe(1);
    expect(s.past).toHaveLength(1);
    expect(s.selection).toHaveLength(1);
    expect(s.selection[0]).not.toBe("a");
    expect(s.doc.wires[1]?.points[0]).toEqual({ x: 2, y: 2 });
    store.getState().paste();
    expect(store.getState().doc.wires[2]?.points[0]).toEqual({ x: 4, y: 4 });
  });

  it("zoom_clamped", () => {
    const store = createEditorStore();
    store.getState().setView({ x: 1, y: 2, zoom: 100 });
    expect(store.getState().view).toEqual({ x: 1, y: 2, zoom: 8 });
    store.getState().setView({ x: 0, y: 0, zoom: 0.01 });
    expect(store.getState().view.zoom).toBe(0.25);
  });
});
