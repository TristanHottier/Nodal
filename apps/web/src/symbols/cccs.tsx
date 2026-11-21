import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

export const cccs: SymbolDef = {
  type: "cccs",
  label: "Current-controlled current source",
  prefix: "F",
  pins: [
    { name: "p", x: 0, y: -3 },
    { name: "n", x: 0, y: 3 },
  ],
  bounds: { x0: -2, y0: -3, x1: 2, y1: 3 },
  defaultParams: { gain: "1", controlSource: "" },
  Body: () => (
    <g>
      <g {...STROKE}>
        <path d="M0 -3 V-2 M0 2 V3" />
        <path d="M0 -2 L2 0 L0 2 L-2 0 Z" />
      </g>
      <path d="M0 -1.2 V0.7" {...STROKE} />
      <path d="M0 1.3 L-0.4 0.5 L0.4 0.5 Z" fill="currentColor" />
    </g>
  ),
};
