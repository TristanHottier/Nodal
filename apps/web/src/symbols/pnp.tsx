import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

export const pnp: SymbolDef = {
  type: "pnp",
  label: "PNP transistor",
  prefix: "Q",
  pins: [
    { name: "c", x: 2, y: -3 },
    { name: "b", x: -3, y: 0 },
    { name: "e", x: 2, y: 3 },
  ],
  bounds: { x0: -3, y0: -3, x1: 2, y1: 3 },
  defaultParams: { model: "" },
  Body: () => (
    <g>
      <g {...STROKE}>
        <path d="M-3 0 H-1" />
        <path d="M-1 -1.5 V1.5" />
        <path d="M-1 -0.6 L2 -2 V-3" />
        <path d="M-1 0.6 L2 2 V3" />
      </g>
      <path d="M-0.25 0.95 L0.257 1.518 L0.511 0.974 Z" fill="currentColor" />
    </g>
  ),
};
