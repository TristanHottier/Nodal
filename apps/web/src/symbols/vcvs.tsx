import type { SymbolDef } from "./types";
import { STROKE, TEXT } from "./stroke";

export const vcvs: SymbolDef = {
  type: "vcvs",
  label: "Voltage-controlled voltage source",
  prefix: "E",
  pins: [
    { name: "p", x: 0, y: -3 },
    { name: "n", x: 0, y: 3 },
    { name: "cp", x: -4, y: -2 },
    { name: "cn", x: -4, y: 2 },
  ],
  bounds: { x0: -4, y0: -3, x1: 2, y1: 3 },
  defaultParams: { gain: "1" },
  Body: () => (
    <g>
      <g {...STROKE}>
        <path d="M0 -3 V-2 M0 2 V3" />
        <path d="M0 -2 L2 0 L0 2 L-2 0 Z" />
        <path d="M-4 -2 H-3 M-4 2 H-3 M-3 -2 V2" />
      </g>
      <text {...TEXT} x={-3.6} y={-2.8}>
        +
      </text>
      <text {...TEXT} x={0} y={-1.1}>
        +
      </text>
      <text {...TEXT} x={0} y={1.1}>
        −
      </text>
    </g>
  ),
};
