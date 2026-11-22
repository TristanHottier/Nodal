import type { Wire } from "@nodal/schema";
import { memo } from "react";

export const WireView = memo(function WireView({
  wire,
  selected,
  error = false,
}: {
  wire: Wire;
  selected: boolean;
  error?: boolean;
}) {
  const points = wire.points.map((p) => `${String(p.x)},${String(p.y)}`).join(" ");
  return (
    <g
      data-testid={`wire-${wire.id}`}
      data-item-id={wire.id}
      data-selected={selected ? "true" : undefined}
      className={`nodal-item${selected ? " selected" : ""}${error ? " sim-error" : ""}`}
    >
      <polyline
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
