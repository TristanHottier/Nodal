// Editor state: document, snapshot undo/redo (ADR 0005), selection, clipboard,
// active tool and view transform. Framework-free so tests drive it directly.
import { EMPTY_SCHEMATIC, type PartType, type Rotation, type Schematic } from "@nodal/schema";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type Clip, copyItems, pasteClip } from "./model/edits";

export type Tool =
  | { kind: "select" }
  | { kind: "place"; item: PartType | "label"; rotation: Rotation; mirror: boolean }
  | { kind: "wire" };

/** Screen offset in px of the grid origin, and zoom factor. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export interface EditorState {
  doc: Schematic;
  past: Schematic[];
  future: Schematic[];
  selection: readonly string[];
  clipboard: Clip | null;
  pasteCount: number;
  tool: Tool;
  view: View;
  /**
   * True from the start of a drag or box select until the pointer is released.
   * Not part of history. Esc that cancels the gesture must not also clear the
   * selection: see `useCanvasPointer` and `useShortcuts`.
   */
  gestureActive: boolean;
  setGestureActive(active: boolean): void;
  commit(next: Schematic, select?: readonly string[]): void;
  undo(): void;
  redo(): void;
  select(ids: readonly string[]): void;
  setTool(t: Tool): void;
  setView(v: View): void;
  copy(): void;
  paste(): void;
  newId(): string;
}

export const MAX_HISTORY = 500;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

function docIds(doc: Schematic): Set<string> {
  return new Set([
    ...doc.parts.map((p) => p.id),
    ...doc.wires.map((w) => w.id),
    ...doc.labels.map((l) => l.id),
  ]);
}

function prune(selection: readonly string[], doc: Schematic): readonly string[] {
  const ids = docIds(doc);
  const kept = selection.filter((id) => ids.has(id));
  return kept.length === selection.length ? selection : kept;
}

export function createEditorStore(opts?: {
  doc?: Schematic;
  newId?: () => string;
}): StoreApi<EditorState> {
  const newId = opts?.newId ?? (() => crypto.randomUUID());
  return createStore<EditorState>()((set, get) => ({
    doc: opts?.doc ?? EMPTY_SCHEMATIC,
    past: [],
    future: [],
    selection: [],
    clipboard: null,
    pasteCount: 0,
    tool: { kind: "select" },
    view: { x: 0, y: 0, zoom: 1 },
    gestureActive: false,
    newId,

    commit(next, select) {
      const s = get();
      if (next === s.doc) return;
      const past = [...s.past, s.doc];
      if (past.length > MAX_HISTORY) past.shift();
      set({ doc: next, past, future: [], ...(select ? { selection: select } : {}) });
    },

    undo() {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      set({
        doc: prev,
        past: s.past.slice(0, -1),
        future: [...s.future, s.doc],
        selection: prune(s.selection, prev),
      });
    },

    redo() {
      const s = get();
      const next = s.future[s.future.length - 1];
      if (!next) return;
      set({
        doc: next,
        past: [...s.past, s.doc],
        future: s.future.slice(0, -1),
        selection: prune(s.selection, next),
      });
    },

    select: (ids) => {
      set({ selection: ids });
    },
    setTool: (tool) => {
      set({ tool });
    },
    setGestureActive: (gestureActive) => {
      if (get().gestureActive !== gestureActive) set({ gestureActive });
    },
    setView: (v) => {
      set({ view: { ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom)) } });
    },

    copy() {
      const s = get();
      const clip = copyItems(s.doc, s.selection);
      if (clip) set({ clipboard: clip, pasteCount: 0 });
    },

    paste() {
      const s = get();
      if (!s.clipboard) return;
      const pasteCount = s.pasteCount + 1;
      const off = 2 * pasteCount;
      const { doc, ids } = pasteClip(s.doc, s.clipboard, () => s.newId(), { x: off, y: off });
      set({ pasteCount });
      get().commit(doc, ids);
    },
  }));
}
