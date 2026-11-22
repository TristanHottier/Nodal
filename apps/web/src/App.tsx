import { useEffect, useState } from "react";
import { Editor } from "./editor/Editor";
import { createEditorStore } from "./editor/store";
import { EngineClient } from "./engine/client";
import { createSimulationStore } from "./simulation/store";
import { startAutosave } from "./storage/autosave";
import { openStore } from "./storage/idb";

type Status =
  { kind: "loading" } | { kind: "ready"; version: string } | { kind: "failed"; message: string };

export function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [store] = useState(() => createEditorStore());
  const [engine] = useState(() => new EngineClient());
  const [simulation] = useState(() => createSimulationStore({ runner: engine }));

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    openStore()
      .then((kv) => startAutosave(store, kv))
      .then((autosave) => {
        if (cancelled) {
          autosave.stop();
          return;
        }
        stop = () => {
          autosave.stop();
        };
        if (autosave.message !== null) store.getState().setStatusMessage(autosave.message);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          store
            .getState()
            .setStatusMessage(
              `Autosave is unavailable: ${e instanceof Error ? e.message : String(e)}`,
            );
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [store]);

  useEffect(() => {
    let cancelled = false;
    engine.version().then(
      (version) => {
        if (!cancelled) setStatus({ kind: "ready", version });
      },
      (e: unknown) => {
        if (!cancelled)
          setStatus({
            kind: "failed",
            message: e instanceof Error ? e.message : String(e),
          });
      },
    );
    return () => {
      cancelled = true;
      engine.dispose();
    };
  }, [engine]);

  const text =
    status.kind === "loading"
      ? "Loading engine…"
      : status.kind === "ready"
        ? `Engine ${status.version}`
        : `Engine failed to load: ${status.message}`;

  return (
    <Editor
      store={store}
      simulation={simulation}
      status={<span data-testid="engine-status">{text}</span>}
    />
  );
}
