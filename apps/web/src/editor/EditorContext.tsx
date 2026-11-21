// React binding for the editor store: a provider plus a selector hook.
import { createContext, type ReactNode, useContext, useState } from "react";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { createEditorStore, type EditorState } from "./store";

const EditorContext = createContext<StoreApi<EditorState> | null>(null);

export function EditorProvider({
  store,
  children,
}: {
  store?: StoreApi<EditorState>;
  children: ReactNode;
}) {
  const [created] = useState(() => store ?? createEditorStore());
  return <EditorContext.Provider value={store ?? created}>{children}</EditorContext.Provider>;
}

export function useEditorStore(): StoreApi<EditorState> {
  const store = useContext(EditorContext);
  if (!store)
    throw new Error("useEditorStore and useEditor must be used inside an <EditorProvider>");
  return store;
}

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(useEditorStore(), selector);
}
