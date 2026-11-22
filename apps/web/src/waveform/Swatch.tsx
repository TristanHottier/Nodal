// A small chip of a probe's trace color, shared by the probe chips and the cursor rows.
import type { CSSProperties } from "react";
import { traceVar } from "./traceColors";

export function Swatch({ index }: { index: number }) {
  return (
    <span
      className="nodal-swatch"
      aria-hidden="true"
      style={{ "--swatch": traceVar(index) } as CSSProperties}
    />
  );
}
