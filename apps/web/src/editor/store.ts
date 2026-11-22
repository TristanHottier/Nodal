// Editor state: document, snapshot undo/redo (ADR 0005), selection, clipboard,
// active tool and view transform. Framework-free so tests drive it directly.
import {
  newProject,
  type PartType,
  type Project,
  type ProjectModel,
  type Rotation,
  type Schematic,
} from "@nodal/schema";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type Clip, copyItems, pasteClip } from "./model/edits";

export type Tool =
  | { kind: "select" }
  | { kind: "place"; item: PartType | "label"; rotation: Rotation; mirror: boolean }
  | { kind: "wire" }
  | { kind: "probe" };

/** Screen offset in px of the grid origin, and zoom factor. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

/** Everything in a project file except the schematic, which lives in `doc`. */
export type ProjectMeta = Omit<Project, "schematic">;

export interface EditorState {
  doc: Schematic;
  project: ProjectMeta;
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
  /** Message shown in the status bar (open errors, autosave). Not part of history. */
  statusMessage: string | null;
  setStatusMessage(m: string | null): void;
  commit(next: Schematic, select?: readonly string[]): void;
  undo(): void;
  redo(): void;
  select(ids: readonly string[]): void;
  setTool(t: Tool): void;
  setView(v: View): void;
  copy(): void;
  paste(): void;
  newId(): string;
  /** Name and model edits are not part of history. */
  setProjectName(name: string): void;
  setModels(models: ProjectModel[]): void;
  /** Analyses and options; like model edits, not part of history. */
  setSimulation(sim: Project["simulation"]): void;
  /** Bumped by every `loadProject`; lets other stores reset state tied to the old project. */
  projectGeneration: number;
  /** Replace the whole project and reset history, selection, clipboard and view. */
  loadProject(p: Project): void;
  /** The current project in schema key order, ready to serialize. */
  getProject(): Project;
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
  project?: Project;
  newId?: () => string;
}): StoreApi<EditorState> {
  const newId = opts?.newId ?? (() => crypto.randomUUID());
  const initial = opts?.project ?? newProject("Untitled", new Date().toISOString());
  const { schematic: initialDoc, ...initialMeta } = initial;
  return createStore<EditorState>()((set, get) => ({
    doc: opts?.doc ?? initialDoc,
    project: initialMeta,
    past: [],
    future: [],
    selection: [],
    clipboard: null,
    pasteCount: 0,
    tool: { kind: "select" },
    view: { x: 0, y: 0, zoom: 1 },
    gestureActive: false,
    statusMessage: null,
    projectGeneration: 0,
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
    setProjectName: (name) => {
      const s = get();
      if (s.project.name !== name) set({ project: { ...s.project, name } });
    },
    setModels: (models) => {
      const s = get();
      if (s.project.models !== models) set({ project: { ...s.project, models } });
    },
    setSimulation: (simulation) => {
      const s = get();
      if (s.project.simulation !== simulation) set({ project: { ...s.project, simulation } });
    },
    loadProject(p) {
      const { schematic, ...meta } = p;
      set({
        doc: schematic,
        project: meta,
        past: [],
        future: [],
        selection: [],
        clipboard: null,
        pasteCount: 0,
        gestureActive: false,
        tool: { kind: "select" },
        view: { x: 0, y: 0, zoom: 1 },
        projectGeneration: get().projectGeneration + 1,
      });
    },
    getProject() {
      const { doc, project: m } = get();
      return {
        format: m.format,
        formatVersion: m.formatVersion,
        name: m.name,
        createdAt: m.createdAt,
        schematic: doc,
        models: m.models,
        simulation: m.simulation,
      };
    },
    setStatusMessage: (statusMessage) => {
      if (get().statusMessage !== statusMessage) set({ statusMessage });
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
