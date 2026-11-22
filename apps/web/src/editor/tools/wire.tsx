// Wire tool: click to fix points, L-shaped preview to the cursor, commit by
// double click, Enter, or a click on a pin, label anchor, wire end or wire segment.
import type { Point } from "@nodal/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createStore, useStore } from "zustand";
import type { CanvasToolHandlers } from "../canvas/Canvas";
import { useEditor, useEditorStore } from "../EditorContext";
import { isConnectionPoint } from "../model/connectivity";
import { addWire } from "../model/edits";
import { samePoint } from "../model/wires";

interface WireState {
  points: Point[];
  cursor: Point | null;
  vertical: boolean;
}

const IDLE: WireState = { points: [], cursor: null, vertical: false };

/** Points after `from` of the L-shaped route to `to`; horizontal first unless `vertical`. */
export function lRoute(from: Point, to: Point, vertical: boolean): Point[] {
  const bend = vertical ? { x: from.x, y: to.y } : { x: to.x, y: from.y };
  return [bend, to];
}

export interface WireTool {
  handlers: CanvasToolHandlers;
  overlay: React.ReactNode;
  /** True while a wire is in progress. */
  active: boolean;
  /** Discards the wire in progress. */
  cancel: () => void;
  /** Commits the fixed points (not the preview). */
  finish: () => void;
  /** Switches between horizontal-first and vertical-first bends. */
  toggleBend: () => void;
}

export function useWireTool(): WireTool {
  const editor = useEditorStore();
  const [wire] = useState(() => createStore<WireState>(() => IDLE));
  const state = useStore(wire);
  const toolKind = useEditor((s) => s.tool.kind);

  const cancel = useCallback(() => {
    wire.setState(IDLE, true);
  }, [wire]);

  const commit = useCallback(
    (points: Point[]) => {
      const s = editor.getState();
      s.commit(addWire(s.doc, s.newId(), points));
      s.select([]);
      wire.setState(IDLE, true);
    },
    [editor, wire],
  );

  const finish = useCallback(() => {
    commit(wire.getState().points);
  }, [commit, wire]);

  const toggleBend = useCallback(() => {
    wire.setState((w) => ({ vertical: !w.vertical }));
  }, [wire]);

  // Leaving the wire tool drops any wire in progress.
  useEffect(() => {
    if (toolKind !== "wire") cancel();
  }, [toolKind, cancel]);

  const handlers = useMemo<CanvasToolHandlers>(
    () => ({
      onPointerDown(world) {
        const { points, vertical } = wire.getState();
        const start = points[0];
        const last = points[points.length - 1];
        if (!start || !last) {
          wire.setState({ points: [world], cursor: world });
          return;
        }
        const next = [...points, ...lRoute(last, world, vertical)];
        const ends = !samePoint(world, start) && isConnectionPoint(editor.getState().doc, world);
        if (ends) commit(next);
        else wire.setState({ points: next, cursor: world });
      },
      onPointerMove(world) {
        if (wire.getState().points.length > 0) wire.setState({ cursor: world });
      },
      onDoubleClick() {
        commit(wire.getState().points);
      },
    }),
    [editor, wire, commit],
  );

  const last = state.points[state.points.length - 1];
  const route = last && state.cursor ? lRoute(last, state.cursor, state.vertical) : [];
  const shown = [...state.points, ...route];
  const overlay =
    state.points.length > 0 ? (
      <polyline
        data-testid="wire-preview"
        className="nodal-wire-preview"
        data-points={shown.map((p) => `${String(p.x)},${String(p.y)}`).join(" ")}
        points={shown.map((p) => `${String(p.x)},${String(p.y)}`).join(" ")}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    ) : null;

  return { handlers, overlay, active: state.points.length > 0, cancel, finish, toggleBend };
}
