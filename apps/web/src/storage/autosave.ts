// Debounced autosave of the current project to a key-value store (ADR 0004).
import { parseProject } from "@nodal/schema";
import type { StoreApi } from "zustand";
import type { EditorState } from "../editor/store";
import type { KvStore } from "./idb";

const KEY = "current";

export interface Autosave {
  /** Message for the status bar, or null when everything went fine. */
  message: string | null;
  stop(): void;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Restore the saved project, then start saving changes. The restore happens
 * before subscribing so the initial empty state never overwrites a saved project.
 */
export async function startAutosave(
  store: StoreApi<EditorState>,
  kv: KvStore,
  opts: { delayMs?: number } = {},
): Promise<Autosave> {
  const delayMs = opts.delayMs ?? 500;
  let message: string | null = null;
  try {
    const raw = await kv.get(KEY);
    if (raw !== undefined) {
      const r = parseProject(raw);
      if (r.ok) {
        store.getState().loadProject(r.project);
      } else {
        await kv.put(`current-invalid-${new Date().toISOString()}`, raw);
        message = `The autosaved project could not be loaded (${r.error}). A copy was kept in browser storage.`;
      }
    }
  } catch (e) {
    return { message: `Autosave is unavailable: ${errText(e)}`, stop: () => undefined };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe((s, prev) => {
    if (s.doc === prev.doc && s.project === prev.project) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      kv.put(KEY, store.getState().getProject()).catch((e: unknown) => {
        store.getState().setStatusMessage(`Autosave failed: ${errText(e)}`);
      });
    }, delayMs);
  });
  return {
    message,
    stop() {
      clearTimeout(timer);
      unsubscribe();
    },
  };
}
