// Wire tool: click to fix points, L-shaped preview to the cursor, commit by
// double click, Enter, or a click on a pin, wire end or wire segment.
import type { Point, Schematic } from "@nodal/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createStore, useStore } from "zustand";
import type { CanvasToolHandlers } from "../canvas/Canvas";
import { useEditor, useEditorStore } from "../EditorContext";
import { pinPositions } from "../geometry";
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

function onSegment(p: Point, a: Point, b: Point): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return (
    cross === 0 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** True if `p` is a pin, a wire end, or lies on a wire segment (inclusive). */
export function isConnectionPoint(doc: Schematic, p: Point): boolean {
  if (doc.parts.some((part) => pinPositions(part).some((pin) => samePoint(pin.at, p)))) return true;
  return doc.wires.some((w) => {
    const first = w.points[0];
    const last = w.points[w.points.length - 1];
    if ((first && samePoint(first, p)) || (last && samePoint(last, p))) return true;
    return w.points.some((a, i) => {
      const b = w.points[i + 1];
      return b !== undefined && onSegment(p, a, b);
    });
  });
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
        data-points={shown.map((p) => `${String(p.x)},${String(p.y)}`).join(" ")}
        points={shown.map((p) => `${String(p.x)},${String(p.y)}`).join(" ")}
        fill="none"
        stroke="#2563eb"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    ) : null;

  return { handlers, overlay, active: state.points.length > 0, cancel, finish, toggleBend };
}
