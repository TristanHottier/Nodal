import type { SymbolDef } from "./types";
import { STROKE, TEXT } from "./stroke";

// Ideal op-amp: no supply pins.
export const opamp: SymbolDef = {
  type: "opamp",
  label: "Operational amplifier",
  prefix: "U",
  pins: [
    { name: "inn", x: -4, y: -2 },
    { name: "inp", x: -4, y: 2 },
    { name: "out", x: 4, y: 0 },
  ],
  bounds: { x0: -4, y0: -3, x1: 4, y1: 3 },
  defaultParams: { gain: "1e6" },
  Body: () => (
    <g>
      <g {...STROKE}>
        <path d="M-2 -3 V3 L3 0 Z" />
        <path d="M-4 -2 H-2 M-4 2 H-2 M3 0 H4" />
      </g>
      <text {...TEXT} x={-1.3} y={-2}>
        −
      </text>
      <text {...TEXT} x={-1.3} y={2}>
        +
      </text>
      <text {...TEXT} x={0.2} y={0}>
        ∞
      </text>
    </g>
  ),
};
