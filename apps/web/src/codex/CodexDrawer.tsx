// The codex drawer: one entry beside the canvas, in place of the inspector. Non-modal, so the
// editor stays usable. Reached only through `lazy(() => import("../codex/CodexDrawer"))` in
// Editor.tsx, which keeps the entry content and KaTeX out of the editor's first load.
import { X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { focusOpener } from "../editor/codexOpener";
import { useEditorStore } from "../editor/EditorContext";
import { CODEX } from "./catalog";
import { CodexEntry } from "./CodexEntry";
import { codexHref } from "./route";
import "./Codex.css";

export default function CodexDrawer({ id }: { id: string }) {
  const store = useEditorStore();
  const meta = CODEX.find((e) => e.id === id);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Opening, or switching to another entry, moves focus into the drawer.
  useEffect(() => {
    closeRef.current?.focus();
  }, [id]);

  const close = () => {
    flushSync(() => {
      store.getState().closeCodex();
    });
    focusOpener();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape") return;
    // The editor's Esc (clear selection, back to select tool) must not also run.
    e.stopPropagation();
    e.preventDefault();
    close();
  };

  return (
    <aside className="nodal-codex-drawer" aria-label="Codex" onKeyDown={onKeyDown}>
      <div className="nodal-codex-drawer-bar">
        <a
          href={codexHref(id)}
          onClick={() => {
            store.getState().closeCodex();
          }}
        >
          Open full page
        </a>
        <button ref={closeRef} type="button" onClick={close}>
          <X aria-hidden="true" className="nodal-icon" />
          Close
        </button>
      </div>
      {meta === undefined ? (
        <p role="alert">No entry called {id}.</p>
      ) : (
        <CodexEntry key={meta.id} meta={meta} store={store} headingLevel={2} />
      )}
    </aside>
  );
}
