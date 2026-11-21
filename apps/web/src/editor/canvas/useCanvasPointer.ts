// Pointer, wheel and keyboard handling for the canvas: selection, drag-move,
// box select, pan and zoom. Tool-specific behavior is delegated to `tool`.
import type { Point } from "@nodal/schema";
import {
  type PointerEvent as RPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { useEditorStore } from "../EditorContext";
import type { Box } from "../geometry";
import { moveItems } from "../model/edits";
import { screenToWorld, snap, zoomAt } from "./coords";
import { itemsInBox, normalizeBox } from "./hitTest";

export const WHEEL_FACTOR = 1.1;
/** Pointer travel (px) under which a press on empty canvas counts as a click. */
const CLICK_SLOP = 2;

export interface CanvasToolHandlers {
  /** `world` is snapped to the grid. */
  onPointerDown(world: Point, e: RPointerEvent): void;
  onPointerMove(world: Point, e: RPointerEvent): void;
  onDoubleClick?(world: Point): void;
}

export type Preview = { kind: "drag"; delta: Point } | { kind: "box"; box: Box } | null;

type Gesture =
  | { kind: "pan"; client: Point; view: { x: number; y: number; zoom: number } }
  | { kind: "drag"; start: Point; delta: Point }
  | { kind: "box"; startClient: Point; startWorld: Point; shift: boolean; moved: boolean }
  | null;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.tagName === "BUTTON" ||
    t.getAttribute("role") === "button" ||
    t.isContentEditable);

export function useCanvasPointer(
  svgRef: RefObject<SVGSVGElement | null>,
  tool?: CanvasToolHandlers,
) {
  const store = useEditorStore();
  const gesture = useRef<Gesture>(null);
  const space = useRef(false);
  const [preview, setPreview] = useState<Preview>(null);

  const locate = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return screenToWorld({ x: e.clientX, y: e.clientY }, rect, store.getState().view);
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Non-passive native listener: React's wheel listeners are passive.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      const factor = e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
      const rect = svg.getBoundingClientRect();
      const s = store.getState();
      s.setView(zoomAt(s.view, { x: e.clientX, y: e.clientY }, rect, factor));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
    };
  }, [svgRef, store]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " && !isTyping(e.target)) {
        space.current = true;
        e.preventDefault();
      } else if (e.key === "Escape") {
        const g = gesture.current;
        if (g && (g.kind === "drag" || g.kind === "box")) {
          gesture.current = null;
          setPreview(null);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") space.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const onBlur = () => {
      space.current = false;
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const s = store.getState();
    const panning = e.button === 1 || (e.button === 0 && space.current);
    if (!panning && e.button !== 0) return;
    const el = e.currentTarget;
    if (typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture is best effort (e.g. synthetic pointer ids).
      }
    }
    if (panning) {
      e.preventDefault();
      gesture.current = { kind: "pan", client: { x: e.clientX, y: e.clientY }, view: s.view };
      return;
    }
    const world = locate(e);
    if (s.tool.kind !== "select") {
      tool?.onPointerDown(snap(world), e);
      return;
    }
    const id = (e.target as Element).closest("[data-item-id]")?.getAttribute("data-item-id");
    if (id) {
      const selected = s.selection.includes(id);
      if (e.shiftKey) {
        s.select(selected ? s.selection.filter((x) => x !== id) : [...s.selection, id]);
        return;
      }
      if (!selected) s.select([id]);
      gesture.current = { kind: "drag", start: snap(world), delta: { x: 0, y: 0 } };
      return;
    }
    gesture.current = {
      kind: "box",
      startClient: { x: e.clientX, y: e.clientY },
      startWorld: world,
      shift: e.shiftKey,
      moved: false,
    };
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    const s = store.getState();
    if (!g) {
      if (s.tool.kind !== "select") tool?.onPointerMove(snap(locate(e)), e);
      return;
    }
    if (g.kind === "pan") {
      s.setView({
        ...g.view,
        x: g.view.x + e.clientX - g.client.x,
        y: g.view.y + e.clientY - g.client.y,
      });
    } else if (g.kind === "drag") {
      const now = snap(locate(e));
      g.delta = { x: now.x - g.start.x + 0, y: now.y - g.start.y + 0 };
      setPreview({ kind: "drag", delta: g.delta });
    } else {
      g.moved =
        g.moved ||
        Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) > CLICK_SLOP;
      setPreview({ kind: "box", box: normalizeBox(g.startWorld, locate(e)) });
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setPreview(null);
    if (!g || g.kind === "pan") return;
    const s = store.getState();
    if (g.kind === "drag") {
      s.commit(moveItems(s.doc, s.selection, g.delta));
      return;
    }
    const moved =
      g.moved || Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) > CLICK_SLOP;
    if (!moved) {
      if (!g.shift) s.select([]);
      return;
    }
    const ids = itemsInBox(s.doc, normalizeBox(g.startWorld, locate(e)));
    s.select(g.shift ? [...new Set([...s.selection, ...ids])] : ids);
  };

  const cancel = () => {
    gesture.current = null;
    setPreview(null);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (store.getState().tool.kind !== "select") tool?.onDoubleClick?.(snap(locate(e)));
  };

  return {
    preview,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onDoubleClick,
    },
  };
}
