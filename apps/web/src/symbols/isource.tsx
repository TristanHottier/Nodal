import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

export const isource: SymbolDef = {
  type: "isource",
  label: "Current source",
  prefix: "I",
  pins: [
    { name: "p", x: 0, y: -3 },
    { name: "n", x: 0, y: 3 },
  ],
  bounds: { x0: -2, y0: -3, x1: 2, y1: 3 },
  defaultParams: { dc: "1m" },
  Body: () => (
    <g>
      <g {...STROKE}>
        <circle cx={0} cy={0} r={2} />
        <path d="M0 -3 V-2 M0 2 V3" />
        {/* Line across the circle, perpendicular to the leads. */}
        <path d="M-2 0 H2" />
        {/* Arrow shaft beside the center, pointing from p to n. */}
        <path d="M1 -1.4 V0.9" />
      </g>
      <path d="M1 1.4 L0.6 0.6 L1.4 0.6 Z" fill="currentColor" />
    </g>
  ),
};
