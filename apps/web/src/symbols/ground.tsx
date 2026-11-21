import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

export const ground: SymbolDef = {
  type: "ground",
  label: "Ground",
  prefix: "GND",
  pins: [{ name: "gnd", x: 0, y: 0 }],
  bounds: { x0: -1.5, y0: 0, x1: 1.5, y1: 2 },
  defaultParams: {},
  Body: () => (
    <g {...STROKE}>
      <path d="M0 0 V0.8" />
      <path d="M-1.5 0.8 H1.5 M-1 1.4 H1 M-0.5 2 H0.5" />
    </g>
  ),
};
