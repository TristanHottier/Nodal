import { PART_TYPES, type PartType } from "@nodal/schema";
import { capacitor } from "./capacitor";
import { cccs } from "./cccs";
import { ccvs } from "./ccvs";
import { diode } from "./diode";
import { ground } from "./ground";
import { inductor } from "./inductor";
import { isource } from "./isource";
import { LABEL_SYMBOL } from "./netLabel";
import { nmos } from "./nmos";
import { npn } from "./npn";
import { opamp } from "./opamp";
import { pmos } from "./pmos";
import { pnp } from "./pnp";
import { resistor } from "./resistor";
import { switchSymbol } from "./switch";
import type { SymbolDef } from "./types";
import { vccs } from "./vccs";
import { vcvs } from "./vcvs";
import { vsource } from "./vsource";

export { LABEL_SYMBOL };

export const SYMBOLS: Record<PartType, SymbolDef> = {
  resistor,
  capacitor,
  inductor,
  vsource,
  isource,
  vcvs,
  vccs,
  ccvs,
  cccs,
  diode,
  npn,
  pnp,
  nmos,
  pmos,
  switch: switchSymbol,
  opamp,
  ground,
};

export const PALETTE: readonly (PartType | "label")[] = [...PART_TYPES, "label"];
