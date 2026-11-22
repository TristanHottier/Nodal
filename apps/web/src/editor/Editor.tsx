// Editor layout: palette on the left, canvas filling the rest, status bar below.
import type { ReactNode } from "react";
import type { StoreApi } from "zustand";
import { Canvas } from "./canvas/Canvas";
import { DIAGNOSTICS_CSS } from "./Diagnostics";
import { EditorProvider, useEditor } from "./EditorContext";
import { Inspector, INSPECTOR_CSS } from "./inspector/Inspector";
import { Palette } from "./Palette";
import type { EditorState } from "./store";
import { usePlaceTool } from "./tools/place";
import { useWireTool } from "./tools/wire";
import { useShortcuts } from "./useShortcuts";

const CSS = `
.nodal-symbol, .nodal-symbol :is(path, line, circle, rect, polyline, polygon, ellipse) { vector-effect: non-scaling-stroke; }
.nodal-editor { display: grid; grid-template-columns: 180px 1fr 260px; grid-template-rows: 1fr auto; width: 100%; height: 100%; }
.nodal-palette { grid-row: 1; grid-column: 1; display: flex; flex-direction: column; gap: 2px; padding: 6px; overflow-y: auto; border-right: 1px solid #e5e7eb; background: #f8fafc; }
.nodal-palette button { display: flex; align-items: center; gap: 8px; padding: 3px 6px; font: inherit; text-align: left; border: 1px solid transparent; border-radius: 4px; background: none; cursor: pointer; }
.nodal-palette button:hover { background: #e2e8f0; }
.nodal-palette button[aria-pressed="true"] { background: #dbeafe; border-color: #2563eb; }
.nodal-projectbar { display: flex; flex-wrap: wrap; gap: 4px; }
.nodal-projectbar button { flex: 1 0 auto; justify-content: center; padding: 3px 4px; white-space: nowrap; }
.nodal-palette hr { width: 100%; border: 0; border-top: 1px solid #e5e7eb; margin: 4px 0; }
.nodal-canvas-pane { grid-row: 1; grid-column: 2; min-width: 0; min-height: 0; }
.nodal-status { grid-row: 2; grid-column: 1 / span 3; padding: 4px 10px; font-size: 12px; border-top: 1px solid #e5e7eb; background: #f8fafc; }
`;

function EditorBody({ status }: { status?: ReactNode }) {
  const kind = useEditor((s) => s.tool.kind);
  const message = useEditor((s) => s.statusMessage);
  const place = usePlaceTool();
  const wire = useWireTool();
  useShortcuts(wire);
  const tool = kind === "place" ? place : kind === "wire" ? wire : undefined;
  return (
    <div className="nodal-editor">
      <style>{CSS + INSPECTOR_CSS + DIAGNOSTICS_CSS}</style>
      <Palette />
      <div className="nodal-canvas-pane">
        <Canvas {...(tool ? { tool: tool.handlers, overlay: tool.overlay } : {})} />
      </div>
      <Inspector />
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

/** The schematic editor. Creates its own store unless one is given. */
export function Editor({ status, store }: { status?: ReactNode; store?: StoreApi<EditorState> }) {
  return (
    <EditorProvider {...(store ? { store } : {})}>
      <EditorBody status={status} />
    </EditorProvider>
  );
}
