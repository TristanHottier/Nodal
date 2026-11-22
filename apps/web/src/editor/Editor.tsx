// Editor layout: palette on the left, canvas filling the rest, status bar below.
import { type ReactNode, useEffect, useState } from "react";
import type { StoreApi } from "zustand";
import { EngineClient } from "../engine/client";
import { RunBar } from "../simulation/RunBar";
import { WaveformPanel } from "../waveform/WaveformPanel";
import { SimulationProvider, useResetOnProjectLoad } from "../simulation/SimulationContext";
import { createSimulationStore, type SimulationState } from "../simulation/store";
import { Canvas } from "./canvas/Canvas";
import { EditorProvider, useEditor, useEditorStore } from "./EditorContext";
import { Inspector } from "./inspector/Inspector";
import { NarrowNotice } from "./NarrowNotice";
import { Palette } from "./Palette";
import { ThemeSelect } from "../theme/ThemeSelect";
import type { EditorState } from "./store";
import { usePlaceTool } from "./tools/place";
import { useProbeTool } from "./tools/probe";
import { useWireTool } from "./tools/wire";
import { EDITOR_MIN_WIDTH, useMinWidth } from "./useMinWidth";
import { useShortcuts } from "./useShortcuts";
import "./Editor.css";

function StatusBar({ status }: { status?: ReactNode }) {
  const message = useEditor((s) => s.statusMessage);
  return (
    <div className="nodal-status">
      <strong>Nodal</strong> {status}
      {message === null ? null : (
        <>
          {" "}
          <span data-testid="project-message">{message}</span>
        </>
      )}
      <ThemeSelect />
    </div>
  );
}

/** Below the minimum width: notice, pan-and-zoom canvas, status bar. No tool, panel or shortcut. */
function ReadOnlyBody({ status }: { status?: ReactNode }) {
  const store = useEditorStore();
  // Entering this view ends any gesture, tool or wire in progress. The wire tool's
  // state and the canvas gesture die with the editing tree; the store flags are reset here.
  useEffect(() => {
    const s = store.getState();
    s.setTool({ kind: "select" });
    s.setGestureActive(false);
  }, [store]);
  return (
    <div className="nodal-editor nodal-editor-readonly">
      <NarrowNotice />
      <div className="nodal-canvas-pane">
        <Canvas readOnly />
      </div>
      <StatusBar status={status} />
    </div>
  );
}

function EditorBody({ status }: { status?: ReactNode }) {
  const kind = useEditor((s) => s.tool.kind);
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
      <StatusBar status={status} />
    </div>
  );
}

function EditorSwitch({ status }: { status?: ReactNode }) {
  const wide = useMinWidth(EDITOR_MIN_WIDTH);
  return wide ? <EditorBody status={status} /> : <ReadOnlyBody status={status} />;
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
        <EditorSwitch status={status} />
      </SimulationProvider>
    </EditorProvider>
  );
}
