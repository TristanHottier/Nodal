// The schematic canvas: one SVG, a world group in grid units, and the
// interaction hook. Tools other than "select" plug in through `tool`/`overlay`.
import type { Schematic } from "@nodal/schema";
import {
  type KeyboardEvent,
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useErrorIds, useProbeSlots } from "../../simulation/SimulationContext";
import { useEditor, useEditorStore } from "../EditorContext";
import { GRID } from "../geometry";
import { junctionDots } from "../model/junctions";
import { cycleSelection } from "../model/cycle";
import { moveItems } from "../model/edits";
import { cullDoc, type Size, visibleBox } from "./cull";
import { GridBackground } from "./GridBackground";
import { JunctionDots } from "./JunctionDots";
import { LabelView } from "./LabelView";
import { OpOverlay } from "./OpOverlay";
import { PartView } from "./PartView";
import { SelectionBox } from "./SelectionBox";
import { type CanvasToolHandlers, useCanvasPointer } from "./useCanvasPointer";
import { WireView } from "./WireView";
import "./Canvas.css";

export type { CanvasToolHandlers };

const STEP_KEYS: Partial<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

interface SceneProps {
  doc: Schematic;
  selected: ReadonlySet<string>;
  errorIds: ReadonlySet<string>;
  dots: ReturnType<typeof junctionDots>;
  probeSlots: ReadonlyMap<string, number>;
}

/** The drawn items. Memoized so that pan and zoom (a new `view` only) never reconcile them. */
const Scene = memo(function Scene({ doc, selected, errorIds, dots, probeSlots }: SceneProps) {
  return (
    <>
      {doc.wires.map((w) => (
        <WireView
          key={w.id}
          wire={w}
          selected={selected.has(w.id)}
          error={errorIds.has(w.id)}
          probeSlot={probeSlots.get(w.id)}
        />
      ))}
      {doc.parts.map((p) => (
        <PartView key={p.id} part={p} selected={selected.has(p.id)} error={errorIds.has(p.id)} />
      ))}
      {doc.labels.map((l) => (
        <LabelView key={l.id} label={l} selected={selected.has(l.id)} error={errorIds.has(l.id)} />
      ))}
      <JunctionDots dots={dots} />
    </>
  );
});

export function Canvas({
  tool,
  overlay,
  readOnly = false,
}: {
  tool?: CanvasToolHandlers;
  overlay?: ReactNode;
  /** Pan and zoom only: no selection, drag, tool or edit. */
  readOnly?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const store = useEditorStore();
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const view = useEditor((s) => s.view);
  const errorIds = useErrorIds();
  const probeSlots = useProbeSlots();
  const { preview, handlers } = useCanvasPointer(svgRef, tool, readOnly);

  const shown = useMemo(
    () => (preview?.kind === "drag" ? moveItems(doc, selection, preview.delta) : doc),
    [doc, selection, preview],
  );
  const dots = useMemo(() => junctionDots(shown), [shown]);
  const selected = useMemo(() => new Set(selection), [selection]);

  // Unknown (jsdom, first render) or empty size: draw everything.
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    });
    ro.observe(svg);
    return () => {
      ro.disconnect();
    };
  }, []);
  const known = size !== null && size.width > 0 && size.height > 0;
  const box = known ? visibleBox(view, size) : null;
  const drawn = useMemo(
    () => (box === null ? shown : cullDoc(shown, box)),
    // The box is rebuilt every render; its four numbers are the real inputs.
    [shown, box?.x0, box?.y0, box?.x1, box?.y1],
  );

  // Keyboard selection: with the canvas itself focused, Right/Down and Left/Up step through the
  // items. Tab is left alone, so focus can always leave the canvas.
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (readOnly || e.target !== e.currentTarget) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const step = STEP_KEYS[e.key];
    const s = store.getState();
    if (step === undefined || s.tool.kind !== "select") return;
    e.preventDefault();
    s.select(cycleSelection(s.doc, s.selection, step));
  };

  return (
    <svg
      ref={svgRef}
      data-testid="schematic-canvas"
      className="nodal-canvas"
      tabIndex={0}
      role="application"
      aria-label="Schematic canvas"
      onKeyDown={onKeyDown}
      {...handlers}
    >
      <GridBackground view={view} />
      <g
        transform={`translate(${String(view.x)} ${String(view.y)}) scale(${String(view.zoom * GRID)})`}
      >
        <Scene
          doc={drawn}
          selected={selected}
          errorIds={errorIds}
          dots={dots}
          probeSlots={probeSlots}
        />
        <OpOverlay />
        {preview?.kind === "box" && <SelectionBox box={preview.box} />}
        {overlay}
      </g>
    </svg>
  );
}
