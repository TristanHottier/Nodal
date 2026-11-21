import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

export const diode: SymbolDef = {
  type: "diode",
  label: "Diode",
  prefix: "D",
  pins: [
    { name: "a", x: 0, y: -3 },
    { name: "k", x: 0, y: 3 },
  ],
  bounds: { x0: -1, y0: -3, x1: 1, y1: 3 },
  defaultParams: { model: "" },
  Body: () => (
    <g {...STROKE}>
      <path d="M0 -3 V-1 M0 1 V3" />
      <path d="M-1 -1 H1 L0 1 Z" />
      <path d="M-1 1 H1" />
    </g>
  ),
};
