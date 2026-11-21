import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

export const capacitor: SymbolDef = {
  type: "capacitor",
  label: "Capacitor",
  prefix: "C",
  pins: [
    { name: "1", x: 0, y: -3 },
    { name: "2", x: 0, y: 3 },
  ],
  bounds: { x0: -1.5, y0: -3, x1: 1.5, y1: 3 },
  defaultParams: { value: "1u" },
  Body: () => (
    <g {...STROKE}>
      <path d="M0 -3 V-0.4 M0 0.4 V3" />
      <path d="M-1.5 -0.4 H1.5 M-1.5 0.4 H1.5" />
    </g>
  ),
};
