import { PART_TYPES, type PartType } from "@nodal/schema";
import { capacitor } from "./capacitor";
import { cccs } from "./cccs";
import { ccvs } from "./ccvs";
import { ground } from "./ground";
import { inductor } from "./inductor";
import { isource } from "./isource";
import { LABEL_SYMBOL } from "./netLabel";
import { resistor } from "./resistor";
import type { SymbolDef } from "./types";
import { vccs } from "./vccs";
import { vcvs } from "./vcvs";
import { vsource } from "./vsource";

export { LABEL_SYMBOL };

// Partial until the semiconductor/switch/op-amp symbols land (Task 3).
export const SYMBOLS: Partial<Record<PartType, SymbolDef>> = {
  resistor,
  capacitor,
  inductor,
  vsource,
  isource,
  vcvs,
  vccs,
  ccvs,
  cccs,
  ground,
};

export const PALETTE: readonly (PartType | "label")[] = [...PART_TYPES, "label"];
