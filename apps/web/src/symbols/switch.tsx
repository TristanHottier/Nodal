import type { SymbolDef } from "./types";
import { STROKE, TEXT } from "./stroke";

// Make contact (IEC 60617-07-02-01) with a dashed coupling line to the control rectangle.
export const switchSymbol: SymbolDef = {
  type: "switch",
  label: "Voltage-controlled switch",
  prefix: "S",
  pins: [
    { name: "p", x: 0, y: -3 },
    { name: "n", x: 0, y: 3 },
    { name: "cp", x: -4, y: -2 },
    { name: "cn", x: -4, y: 2 },
  ],
  bounds: { x0: -4, y0: -3, x1: 1, y1: 3 },
  defaultParams: { model: "" },
  Body: () => (
    <g>
      <g {...STROKE}>
        <path d="M0 -3 V-2 L0.8 0.3" />
        <path d="M0 3 V0.8" />
        <path d="M-4 -2 H-3 M-4 2 H-3" />
        <rect x={-3} y={-2} width={1.5} height={4} />
        <path d="M-1.5 0 H0.7" strokeDasharray="0.3 0.3" />
      </g>
      <text {...TEXT} x={-2.25} y={-1.1}>
        +
      </text>
    </g>
  ),
};
