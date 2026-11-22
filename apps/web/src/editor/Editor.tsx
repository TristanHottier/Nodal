// Editor layout: palette on the left, canvas filling the rest, status bar below.
import { type ReactNode, useState } from "react";
import type { StoreApi } from "zustand";
import { EngineClient } from "../engine/client";
import { RunBar } from "../simulation/RunBar";
import { WaveformPanel } from "../waveform/WaveformPanel";
import { SimulationProvider, useResetOnProjectLoad } from "../simulation/SimulationContext";
import { createSimulationStore, type SimulationState } from "../simulation/store";
import { Canvas } from "./canvas/Canvas";
import { EditorProvider, useEditor } from "./EditorContext";
import { Inspector } from "./inspector/Inspector";
import { Palette } from "./Palette";
import type { EditorState } from "./store";
import { usePlaceTool } from "./tools/place";
import { useProbeTool } from "./tools/probe";
import { useWireTool } from "./tools/wire";
import { useShortcuts } from "./useShortcuts";
import "./Editor.css";

function EditorBody({ status }: { status?: ReactNode }) {
  const kind = useEditor((s) => s.tool.kind);
  const message = useEditor((s) => s.statusMessage);
  const place = usePlaceTool();
  const wire = useWireTool();
  const probe = useProbeTool();
  useResetOnProjectLoad();
  useShortcuts(wire);
  const tool =
    kind === "place"
      ? place
      : kind === "wire"
        ? wire
        : kind === "probe"
          ? { handlers: probe, overlay: null }
          : undefined;
  return (
    <div className="nodal-editor">
      <Palette />
      <div className="nodal-canvas-pane">
        <Canvas {...(tool ? { tool: tool.handlers, overlay: tool.overlay } : {})} />
      </div>
      <Inspector />
      <div className="nodal-results">
        <RunBar />
        <WaveformPanel />
      </div>
      <div className="nodal-status">
        <strong>Nodal</strong> {status}
        {message === null ? null : (
          <>
            {" "}
            <span data-testid="project-message">{message}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** The schematic editor. Creates its own stores unless they are given. */
export function Editor({
  status,
  store,
  simulation,
}: {
  status?: ReactNode;
  store?: StoreApi<EditorState>;
  simulation?: StoreApi<SimulationState>;
}) {
  // The client creates its worker only when a run starts.
  const [created] = useState(
    () => simulation ?? createSimulationStore({ runner: new EngineClient() }),
  );
  return (
    <EditorProvider {...(store ? { store } : {})}>
      <SimulationProvider store={simulation ?? created}>
        <EditorBody status={status} />
      </SimulationProvider>
    </EditorProvider>
  );
}
