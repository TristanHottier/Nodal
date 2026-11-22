import type { Wire } from "@nodal/schema";
import { memo } from "react";

export const WireView = memo(function WireView({
  wire,
  selected,
  error = false,
  probeSlot,
}: {
  wire: Wire;
  selected: boolean;
  error?: boolean;
  /** 1-based trace color slot when the wire's net is probed. */
  probeSlot?: number | undefined;
}) {
  const points = wire.points.map((p) => `${String(p.x)},${String(p.y)}`).join(" ");
  return (
    <g
      data-testid={`wire-${wire.id}`}
      data-item-id={wire.id}
      data-selected={selected ? "true" : undefined}
      className={`nodal-item${selected ? " selected" : ""}${error ? " sim-error" : ""}${probeSlot === undefined ? "" : ` probed trace-${String(probeSlot)}`}`}
    >
      {selected && (
        <polyline
          className="nodal-halo"
          points={points}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      <polyline
        className="nodal-wire-line"
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={points}
        fill="none"
        stroke="transparent"
        strokeWidth={10}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        pointerEvents="stroke"
      />
    </g>
  );
});
