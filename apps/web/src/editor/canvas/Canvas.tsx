// The schematic canvas: one SVG, a world group in grid units, and the
// interaction hook. Tools other than "select" plug in through `tool`/`overlay`.
import { type ReactNode, useMemo, useRef } from "react";
import { useErrorIds } from "../../simulation/SimulationContext";
import { useEditor } from "../EditorContext";
import { GRID } from "../geometry";
import { junctionDots } from "../model/junctions";
import { moveItems } from "../model/edits";
import { GridBackground } from "./GridBackground";
import { JunctionDots } from "./JunctionDots";
import { LabelView } from "./LabelView";
import { OpOverlay } from "./OpOverlay";
import { PartView } from "./PartView";
import { SelectionBox } from "./SelectionBox";
import { type CanvasToolHandlers, useCanvasPointer } from "./useCanvasPointer";
import { WireView } from "./WireView";

export type { CanvasToolHandlers };

const CSS = `
.nodal-canvas { display: block; width: 100%; height: 100%; touch-action: none; user-select: none; color: #1f2937; background: #fff; }
.nodal-canvas .selected { color: #2563eb; }
.nodal-canvas .sim-error { color: #dc2626; }
.nodal-canvas .nodal-grid-dot { fill: #cbd5e1; }
.nodal-canvas .nodal-selection-box { fill: rgba(37, 99, 235, 0.1); stroke: #2563eb; stroke-width: 1; stroke-dasharray: 4 3; }
`;

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

  return (
    <svg ref={svgRef} data-testid="schematic-canvas" className="nodal-canvas" {...handlers}>
      <style>{CSS}</style>
      <GridBackground view={view} />
      <g
        transform={`translate(${String(view.x)} ${String(view.y)}) scale(${String(view.zoom * GRID)})`}
      >
        {shown.wires.map((w) => (
          <WireView key={w.id} wire={w} selected={selected.has(w.id)} error={errorIds.has(w.id)} />
        ))}
        {shown.parts.map((p) => (
          <PartView key={p.id} part={p} selected={selected.has(p.id)} error={errorIds.has(p.id)} />
        ))}
        {shown.labels.map((l) => (
          <LabelView
            key={l.id}
            label={l}
            selected={selected.has(l.id)}
            error={errorIds.has(l.id)}
          />
        ))}
        <JunctionDots dots={dots} />
        <OpOverlay />
        {preview?.kind === "box" && <SelectionBox box={preview.box} />}
        {overlay}
      </g>
    </svg>
  );
}
