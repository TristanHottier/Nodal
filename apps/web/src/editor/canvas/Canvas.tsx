// The schematic canvas: one SVG, a world group in grid units, and the
// interaction hook. Tools other than "select" plug in through `tool`/`overlay`.
import type { Schematic } from "@nodal/schema";
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useErrorIds } from "../../simulation/SimulationContext";
import { useEditor } from "../EditorContext";
import { GRID } from "../geometry";
import { junctionDots } from "../model/junctions";
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

interface SceneProps {
  doc: Schematic;
  selected: ReadonlySet<string>;
  errorIds: ReadonlySet<string>;
  dots: ReturnType<typeof junctionDots>;
}

/** The drawn items. Memoized so that pan and zoom (a new `view` only) never reconcile them. */
const Scene = memo(function Scene({ doc, selected, errorIds, dots }: SceneProps) {
  return (
    <>
      {doc.wires.map((w) => (
        <WireView key={w.id} wire={w} selected={selected.has(w.id)} error={errorIds.has(w.id)} />
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

export function Canvas({ tool, overlay }: { tool?: CanvasToolHandlers; overlay?: ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const view = useEditor((s) => s.view);
  const errorIds = useErrorIds();
  const { preview, handlers } = useCanvasPointer(svgRef, tool);

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

  return (
    <svg ref={svgRef} data-testid="schematic-canvas" className="nodal-canvas" {...handlers}>
      <GridBackground view={view} />
      <g
        transform={`translate(${String(view.x)} ${String(view.y)}) scale(${String(view.zoom * GRID)})`}
      >
        <Scene doc={drawn} selected={selected} errorIds={errorIds} dots={dots} />
        <OpOverlay />
        {preview?.kind === "box" && <SelectionBox box={preview.box} />}
        {overlay}
      </g>
    </svg>
  );
}
