// Replacing the open project: the confirmation rule and the example loader, shared by the
// top bar and the empty-canvas prompt.
import type { StoreApi } from "zustand";
import type { Example } from "../examples";
import type { EditorState } from "./store";

export const REPLACE_CONFIRM =
  "Replace the current project? Export it first if you want to keep it.";

/** True when the open project is untouched, or the user agrees to replace it. */
export function mayReplaceProject(store: StoreApi<EditorState>): boolean {
  const { doc, project } = store.getState();
  const empty =
    doc.parts.length === 0 &&
    doc.wires.length === 0 &&
    doc.labels.length === 0 &&
    project.models.length === 0 &&
    project.name === "Untitled";
  return empty || window.confirm(REPLACE_CONFIRM);
}

/** Load a bundled example after the replace check. */
export function loadExample(store: StoreApi<EditorState>, example: Example): void {
  if (!mayReplaceProject(store)) return;
  const s = store.getState();
  s.loadProject(example.load());
  s.setStatusMessage(null);
}
