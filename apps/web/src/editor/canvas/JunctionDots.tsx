import type { Point } from "@nodal/schema";
import { memo } from "react";

export const JunctionDots = memo(function JunctionDots({ dots }: { dots: readonly Point[] }) {
  return (
    <g pointerEvents="none">
      {dots.map((d) => (
        <circle
          key={`${String(d.x)},${String(d.y)}`}
          data-testid="junction"
          data-x={d.x}
          data-y={d.y}
          cx={d.x}
          cy={d.y}
          r={0.3}
          fill="currentColor"
        />
      ))}
    </g>
  );
});
