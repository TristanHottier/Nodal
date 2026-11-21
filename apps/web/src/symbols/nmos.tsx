import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

// Enhancement-type MOSFET: gate plate, three channel segments, bulk arrow.
export const nmos: SymbolDef = {
  type: "nmos",
  label: "NMOS transistor",
  prefix: "M",
  pins: [
    { name: "d", x: 2, y: -3 },
    { name: "g", x: -3, y: 0 },
    { name: "s", x: 2, y: 3 },
    { name: "b", x: 4, y: 0 },
  ],
  bounds: { x0: -3, y0: -3, x1: 4, y1: 3 },
  defaultParams: { model: "", w: "", l: "" },
  Body: () => (
    <g>
      <g {...STROKE}>
        <path d="M-3 0 H-2" />
        <path d="M-2 -1.5 V1.5" />
        <path d="M-1 -1.8 V-1 M-1 -0.4 V0.4 M-1 1 V1.8" />
        <path d="M-1 -1.4 H2 V-3" />
        <path d="M-1 1.4 H2 V3" />
        <path d="M-1 0 H4" />
      </g>
      <path d="M-1 0 L0 -0.35 V0.35 Z" fill="currentColor" />
    </g>
  ),
};
