import { useId } from "react";
import { GRID } from "../geometry";
import type { View } from "../store";

/** Dot grid in screen space; thins out (every 2nd, 4th... point) when zoomed far out. */
export function GridBackground({ view }: { view: View }) {
  const id = useId();
  let step = 1;
  while (GRID * view.zoom * step < 8) step *= 2;
  const size = GRID * view.zoom * step;
  return (
    <>
      <defs>
        <pattern
          id={id}
          x={view.x - size / 2}
          y={view.y - size / 2}
          width={size}
          height={size}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={size / 2} cy={size / 2} r={1} className="nodal-grid-dot" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} pointerEvents="none" />
    </>
  );
}
