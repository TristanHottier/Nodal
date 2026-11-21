import type { SymbolDef } from "./types";
import { STROKE, TEXT } from "./stroke";

export const ccvs: SymbolDef = {
  type: "ccvs",
  label: "Current-controlled voltage source",
  prefix: "H",
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
      <text {...TEXT} x={0} y={-1.1}>
        +
      </text>
      <text {...TEXT} x={0} y={1.1}>
        −
      </text>
    </g>
  ),
};
