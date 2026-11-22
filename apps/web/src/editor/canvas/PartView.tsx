import type { Part } from "@nodal/schema";
import { memo } from "react";
import { SYMBOLS } from "../../symbols/catalog";

export const PartView = memo(function PartView({
  part,
  selected,
  error = false,
}: {
  part: Part;
  selected: boolean;
  error?: boolean;
}) {
  const def = SYMBOLS[part.type];
  const { x0, y0, x1, y1 } = def.bounds;
  const Body = def.Body;
  return (
    <g
      data-testid={`part-${part.id}`}
      data-item-id={part.id}
      data-selected={selected ? "true" : undefined}
      className={`nodal-item${selected ? " selected" : ""}${error ? " sim-error" : ""}`}
      transform={`translate(${String(part.x)} ${String(part.y)}) rotate(${String(part.rotation)}) scale(${part.mirror ? "-1" : "1"} 1)`}
    >
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="transparent" pointerEvents="all" />
      {selected && (
        <rect
          className="nodal-outline"
          x={x0}
          y={y0}
          width={x1 - x0}
          height={y1 - y0}
          fill="none"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      <Body />
    </g>
  );
});
