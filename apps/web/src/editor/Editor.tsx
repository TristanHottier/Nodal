// Editor layout: top bar, tool rail, parts panel, canvas, inspector, results and status bar.
import { type ReactNode, useEffect, useState } from "react";
import type { StoreApi } from "zustand";
import { EngineClient } from "../engine/client";
import { RunBar } from "../simulation/RunBar";
import { WaveformPanel } from "../waveform/WaveformPanel";
import {
  SimulationProvider,
  useResetOnProjectLoad,
  useSimulation,
  useSimulationStore,
} from "../simulation/SimulationContext";
import { createSimulationStore, type SimulationState } from "../simulation/store";
import { Canvas } from "./canvas/Canvas";
import { EmptyState } from "./canvas/EmptyState";
import { EditorProvider, useEditor, useEditorStore } from "./EditorContext";
import { Inspector } from "./inspector/Inspector";
import { NarrowNotice } from "./NarrowNotice";
import { Palette } from "./Palette";
import { ToolRail } from "./ToolRail";
import { TopBar } from "./TopBar";
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
    <footer className="nodal-status">
      {status}
      {message === null ? null : (
        <>
          {" "}
          <span data-testid="project-message">{message}</span>
        </>
      )}
    </footer>
  );
}

/** A run that started in the editor keeps going in the read-only view: show it, and let it be cancelled. */
function ReadOnlyRun() {
  const sim = useSimulationStore();
  const running = useSimulation((s) => s.status.kind === "running");
  if (!running) return null;
  return (
    <div className="nodal-readonly-run">
      <span role="status">Running…</span>
      <button
        type="button"
        onClick={() => {
          sim.getState().cancel();
        }}
      >
        Cancel
      </button>
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
      <TopBar readOnly />
      <NarrowNotice />
      <main className="nodal-canvas-pane">
        <h1 className="nodal-visually-hidden">Nodal</h1>
        <Canvas readOnly />
        <EmptyState readOnly />
      </main>
      <ReadOnlyRun />
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
      <TopBar />
      <ToolRail />
      <Palette />
      <main className="nodal-canvas-pane">
        <h1 className="nodal-visually-hidden">Nodal</h1>
        <Canvas {...(tool ? { tool: tool.handlers, overlay: tool.overlay } : {})} />
        <EmptyState />
      </main>
      <Inspector />
      <section className="nodal-results" aria-label="Results">
        <RunBar />
        <WaveformPanel />
      </section>
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
