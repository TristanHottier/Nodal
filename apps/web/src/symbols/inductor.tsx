import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

// Four semicircular humps (IEC 60617-04-03-01), each 1 grid unit tall, bulging to +x.
export const inductor: SymbolDef = {
  type: "inductor",
  label: "Inductor",
  prefix: "L",
  pins: [
    { name: "1", x: 0, y: -3 },
    { name: "2", x: 0, y: 3 },
  ],
  bounds: { x0: -1, y0: -3, x1: 1, y1: 3 },
  defaultParams: { value: "1m" },
  Body: () => (
    <g {...STROKE}>
      <path d="M0 -3 V-2 A0.5 0.5 0 0 1 0 -1 A0.5 0.5 0 0 1 0 0 A0.5 0.5 0 0 1 0 1 A0.5 0.5 0 0 1 0 2 V3" />
    </g>
  ),
};
