import type { SymbolDef } from "./types";
import { STROKE, TEXT } from "./stroke";

export const vsource: SymbolDef = {
  type: "vsource",
  label: "Voltage source",
  prefix: "V",
  pins: [
    { name: "p", x: 0, y: -3 },
    { name: "n", x: 0, y: 3 },
  ],
  bounds: { x0: -2, y0: -3, x1: 2, y1: 3 },
  defaultParams: { dc: "5" },
  Body: () => (
    <g>
      <g {...STROKE}>
        <circle cx={0} cy={0} r={2} />
        <path d="M0 -3 V3" />
      </g>
      <text {...TEXT} x={0.9} y={-1}>
        +
      </text>
    </g>
  ),
};
