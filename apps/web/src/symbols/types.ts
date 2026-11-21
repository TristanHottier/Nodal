import type { PartType } from "@nodal/schema";
import type { JSX } from "react";

export interface SymbolPin {
  name: string;
  x: number;
  y: number;
}

export interface SymbolBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A schematic symbol. `Body` draws in grid units (the caller scales by GRID),
 * with `currentColor` strokes and `vector-effect="non-scaling-stroke"`.
 */
export interface SymbolDef {
  type: PartType;
  label: string;
  prefix: string;
  pins: readonly SymbolPin[];
  bounds: SymbolBounds;
  defaultParams: Readonly<Record<string, string>>;
  Body: () => JSX.Element;
}
