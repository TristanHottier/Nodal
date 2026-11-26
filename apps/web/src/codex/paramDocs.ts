// Plain-language documentation of every device-model parameter and every inspector
// field. The tables in paramTable.ts join these with PARAM_SPECS and PARAM_FIELDS, and
// catalog.test.ts fails when a key is added to either source without an entry here.
import type { ModelKind, PartType } from "@nodal/schema";

export interface ModelParamDoc {
  meaning: string;
  /** "" for a dimensionless parameter. */
  unit: string;
}

const d = (unit: string, meaning: string): ModelParamDoc => ({ unit, meaning });

const DIODE = {
  IS: d("A", "Saturation current of the junction."),
  N: d("", "Emission coefficient; it scales the thermal voltage in the exponential."),
  RS: d("Ω", "Series resistance of the diode body."),
  CJO: d("F", "Junction capacitance at zero bias."),
  VJ: d("V", "Junction potential used by the depletion capacitance."),
  M: d("", "Grading coefficient of the depletion capacitance, accepted from 0 to 0.9."),
  FC: d("", "Fraction of VJ above which the depletion capacitance continues linearly."),
  TT: d("s", "Transit time, which sets the diffusion charge stored in forward bias."),
} as const;

const BJT = {
  IS: d("A", "Transport saturation current."),
  BF: d("", "Ideal forward current gain."),
  BR: d("", "Ideal reverse current gain."),
  NF: d("", "Forward emission coefficient."),
  NR: d("", "Reverse emission coefficient."),
  VAF: d("V", "Forward Early voltage; infinity means no Early effect."),
  CJE: d("F", "Base-emitter depletion capacitance at zero bias."),
  VJE: d("V", "Base-emitter junction potential."),
  MJE: d("", "Base-emitter grading coefficient."),
  CJC: d("F", "Base-collector depletion capacitance at zero bias."),
  VJC: d("V", "Base-collector junction potential."),
  MJC: d("", "Base-collector grading coefficient."),
  TF: d("s", "Forward transit time."),
  TR: d("s", "Reverse transit time."),
  FC: d(
    "",
    "Fraction of the junction potential above which the depletion capacitances continue linearly.",
  ),
} as const;

const MOS = {
  VTO: d("V", "Threshold voltage with the source and bulk at the same potential."),
  KP: d("A/V²", "Transconductance parameter; the device gain is KP times W over L."),
  GAMMA: d("√V", "Body-effect coefficient, how far the threshold moves with source-bulk voltage."),
  PHI: d("V", "Surface potential used by the body effect."),
  LAMBDA: d(
    "1/V",
    "Channel-length modulation, the slope of the saturation current with drain voltage.",
  ),
  CGSO: d("F/m", "Gate-source overlap capacitance per metre of channel width."),
  CGDO: d("F/m", "Gate-drain overlap capacitance per metre of channel width."),
  CGBO: d("F/m", "Gate-bulk overlap capacitance per metre of channel length."),
  IS: d("A", "Saturation current of the two bulk junctions."),
} as const;

const SWITCH = {
  VT: d("V", "Control voltage at the centre of the switching window."),
  VH: d("V", "Hysteresis half-width; the switch turns on above VT + VH and off below VT - VH."),
  RON: d("Ω", "Resistance when the switch is on."),
  ROFF: d("Ω", "Resistance when the switch is off; the default is 1/gmin."),
} as const;

export const MODEL_PARAM_DOCS: Record<ModelKind, Record<string, ModelParamDoc>> = {
  D: DIODE,
  NPN: BJT,
  PNP: BJT,
  NMOS: MOS,
  PMOS: MOS,
  SW: SWITCH,
};

const sourceDocs = (unit: string): Record<string, string> => ({
  dc: `The constant ${unit} value, used by the operating point, the DC sweep and as the level before a waveform starts.`,
  acMag:
    "Magnitude of the source in the AC analysis; leave it empty for a source that is not an AC input.",
  acPhase: "Phase of the source in the AC analysis, in degrees.",
  wave: "The time-domain waveform used by the transient analysis: none, pulse, sin or pwl.",
  v1: "Pulse low level, the value before and after each pulse.",
  v2: "Pulse high level.",
  td: "Delay before the waveform starts, in seconds.",
  tr: "Pulse rise time.",
  tf: "Pulse fall time.",
  pw: "Time the pulse stays at its high level.",
  per: "Pulse period.",
  vo: "Offset added to the sine.",
  va: "Peak amplitude of the sine.",
  freq: "Frequency of the sine.",
  theta: "Damping factor of the sine; the amplitude decays as e^(-theta t) after the delay.",
  phase: "Phase of the sine at the end of the delay, in degrees.",
  pwl: "Time and value pairs, joined by straight lines.",
});

const gain = (what: string): Record<string, string> => ({ gain: what });
const controlled = (what: string): Record<string, string> => ({
  gain: what,
  controlSource: "Name of the voltage source whose current controls this source.",
});
const modelDoc = (what: string): Record<string, string> => ({ model: what });
const mosDocs = (): Record<string, string> => ({
  ...modelDoc("The NMOS or PMOS model card that gives the device its parameters."),
  w: "Channel width; empty uses the model default of 100 µm.",
  l: "Channel length; empty uses the model default of 100 µm.",
});

export const FIELD_DOCS: Record<PartType, Record<string, string>> = {
  resistor: { value: "Resistance in ohms." },
  capacitor: {
    value: "Capacitance in farads.",
    ic: "Voltage across the capacitor at the start of a transient run that uses initial conditions.",
  },
  inductor: {
    value: "Inductance in henries.",
    ic: "Current through the inductor at the start of a transient run that uses initial conditions.",
  },
  vsource: sourceDocs("voltage"),
  isource: sourceDocs("current"),
  vcvs: gain("Output voltage divided by the controlling voltage."),
  vccs: gain("Output current per volt of controlling voltage, in siemens."),
  ccvs: controlled("Output voltage per ampere of controlling current, in ohms."),
  cccs: controlled("Output current divided by the controlling current."),
  diode: modelDoc("The diode model card that gives the device its parameters."),
  npn: modelDoc("The NPN model card that gives the device its parameters."),
  pnp: modelDoc("The PNP model card that gives the device its parameters."),
  nmos: mosDocs(),
  pmos: mosDocs(),
  switch: modelDoc("The switch model card that gives the thresholds and resistances."),
  opamp: gain("Open-loop voltage gain of the ideal amplifier."),
  ground: {},
};
