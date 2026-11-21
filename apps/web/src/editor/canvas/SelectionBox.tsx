import type { Box } from "../geometry";

export function SelectionBox({ box }: { box: Box }) {
  return (
    <rect
      data-testid="selection-box"
      x={box.x0}
      y={box.y0}
      width={box.x1 - box.x0}
      height={box.y1 - box.y0}
      className="nodal-selection-box"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}
