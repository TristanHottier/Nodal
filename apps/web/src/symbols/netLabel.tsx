import type { SymbolDef } from "./types";
import { STROKE } from "./stroke";

// A net label is not a part: a flag whose point sits on the anchor pin.
export const LABEL_SYMBOL: Pick<SymbolDef, "label" | "pins" | "bounds"> & {
  Body: (props: { text?: string }) => ReturnType<SymbolDef["Body"]>;
} = {
  label: "Net label",
  pins: [{ name: "a", x: 0, y: 0 }],
  bounds: { x0: 0, y0: -1, x1: 5, y1: 1 },
  Body: ({ text = "NET" }) => (
    <g>
      <path d="M0 0 L1 -0.8 H5 V0.8 H1 Z" {...STROKE} />
      <text
        x={1.3}
        y={0}
        fill="currentColor"
        fontSize={1.2}
        textAnchor="start"
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  ),
};
