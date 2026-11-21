import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

export const resistor: SymbolDef = {
  type: "resistor",
  label: "Resistor",
  prefix: "R",
  pins: [
    { name: "1", x: 0, y: -3 },
    { name: "2", x: 0, y: 3 },
  ],
  bounds: { x0: -1, y0: -3, x1: 1, y1: 3 },
  defaultParams: { value: "1k" },
  Body: () => (
    <g {...STROKE}>
      <path d="M0 -3 V-2 M0 2 V3" />
      <rect x={-0.5} y={-2} width={1} height={4} />
    </g>
  ),
};
