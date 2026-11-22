// Debounced autosave of the current project to a key-value store (ADR 0004).
import { parseProject } from "@nodal/schema";
import type { StoreApi } from "zustand";
import type { EditorState } from "../editor/store";
import type { KvStore } from "./idb";

const KEY = "current";
const CHANNEL = "nodal-autosave";
const PAUSED_MESSAGE =
  "Nodal is open in another tab; autosave is paused here. Reload this tab to continue here.";

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
  let editedDuringRead = false;
  const before = store.getState();
  try {
    const raw = await kv.get(KEY);
    if (raw !== undefined) {
      const r = parseProject(raw);
      if (r.ok) {
        // Keep edits the user made while the read was in flight.
        const now = store.getState();
        if (now.doc === before.doc && now.project === before.project) now.loadProject(r.project);
        else editedDuringRead = true;
      } else {
        await kv.put(`current-invalid-${new Date().toISOString()}`, raw);
        message = `The autosaved project could not be loaded (${r.error}). A copy was kept in browser storage.`;
      }
    }
  } catch (e) {
    return { message: `Autosave is unavailable: ${errText(e)}`, stop: () => undefined };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  let paused = false;
  let failure: string | null = null;
  const write = () => {
    clearTimeout(timer);
    if (!pending || paused) return;
    pending = false;
    kv.put(KEY, store.getState().getProject()).then(
      () => {
        // A later success clears the failure message, but nothing else.
        if (failure !== null && store.getState().statusMessage === failure) {
          store.getState().setStatusMessage(null);
        }
        failure = null;
      },
      (e: unknown) => {
        failure = `Autosave failed: ${errText(e)}`;
        store.getState().setStatusMessage(failure);
      },
    );
  };

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.doc === prev.doc && s.project === prev.project) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(write, delayMs);
  });
  if (editedDuringRead) {
    pending = true;
    timer = setTimeout(write, delayMs);
  }
  // The newest tab keeps saving: an older one that hears "hello" pauses.
  const channel =
    typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(CHANNEL);
  if (channel) {
    channel.onmessage = (e: MessageEvent) => {
      if (e.data !== "hello" || paused) return;
      paused = true;
      pending = false;
      clearTimeout(timer);
      unsubscribe();
      store.getState().setStatusMessage(PAUSED_MESSAGE);
    };
    channel.postMessage("hello");
  }
  const onVisibility = () => {
    if (document.visibilityState === "hidden") write();
  };
  window.addEventListener("pagehide", write);
  document.addEventListener("visibilitychange", onVisibility);
  return {
    message,
    stop() {
      write();
      window.removeEventListener("pagehide", write);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      channel?.close();
    },
  };
}
