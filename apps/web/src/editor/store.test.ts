import { EMPTY_SCHEMATIC, newProject, type Schematic } from "@nodal/schema";
import { setPartName } from "./model/properties";
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
    const initial = store.getState().doc;
    const a = docWith("a");
    store.getState().commit(a, ["a"]);
    const s = store.getState();
    expect(s.doc).toBe(a);
    expect(s.past).toHaveLength(1);
    expect(s.past[0]).toBe(initial);
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
    // Commit k pushes the doc before it: past[0] is the doc before commit 10.
    expect(past[0]).toEqual(docWith("w9"));
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
  it("load_project_resets_history", () => {
    const store = createEditorStore({ newId: counter() });
    store.getState().commit(docWith("a"), ["a"]);
    store.getState().select(["a"]);
    store.getState().copy();
    store.getState().setTool({ kind: "wire" });
    store.getState().setView({ x: 5, y: 6, zoom: 2 });
    store.getState().setGestureActive(true);
    const p = { ...newProject("Loaded", "2026-01-01T00:00:00.000Z"), schematic: docWith("w") };
    store.getState().loadProject(p);
    const s = store.getState();
    expect(s.doc).toBe(p.schematic);
    expect(s.project.name).toBe("Loaded");
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(s.selection).toEqual([]);
    expect(s.clipboard).toBeNull();
    expect(s.pasteCount).toBe(0);
    expect(s.gestureActive).toBe(false);
    expect(s.tool).toEqual({ kind: "select" });
    expect(s.view).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("get_project_roundtrip", () => {
    const p = newProject("RT", "2026-01-01T00:00:00.000Z");
    const store = createEditorStore({ project: p });
    expect(store.getState().getProject()).toEqual(p);
    expect(Object.keys(store.getState().getProject())).toEqual(Object.keys(p));
    const doc = docWith("a");
    const both = createEditorStore({ project: p, doc });
    expect(both.getState().doc).toBe(doc);
    expect(createEditorStore().getState().project.name).toBe("Untitled");
  });

  it("model_edits_not_in_history", () => {
    const store = createEditorStore();
    const models = [{ name: "DMOD", type: "D" as const, params: {} }];
    store.getState().setModels(models);
    expect(store.getState().project.models).toBe(models);
    expect(store.getState().past).toHaveLength(0);
    const before = store.getState();
    store.getState().setModels(models);
    store.getState().setProjectName("Untitled");
    expect(store.getState()).toBe(before);
    store.getState().setProjectName("New");
    expect(store.getState().project.name).toBe("New");
    expect(store.getState().past).toHaveLength(0);
  });

  it("property_edit_is_undoable", () => {
    const doc: Schematic = {
      ...EMPTY_SCHEMATIC,
      parts: [
        {
          id: "p1",
          type: "resistor",
          name: "R1",
          x: 0,
          y: 0,
          rotation: 0,
          mirror: false,
          params: {},
        },
      ],
    };
    const store = createEditorStore({ doc });
    store.getState().commit(setPartName(store.getState().doc, "p1", "R7"));
    expect(store.getState().doc.parts[0]?.name).toBe("R7");
    store.getState().undo();
    expect(store.getState().doc.parts[0]?.name).toBe("R1");
  });
});
