// Example projects bundled with the app. Each file is a normal `.nodal.json` project.
import { parseProject } from "@nodal/schema";
import type { Project } from "@nodal/schema";
import ceAmplifier from "./ce-amplifier.nodal.json?raw";
import cmosInverter from "./cmos-inverter.nodal.json?raw";
import controlledSources from "./controlled-sources.nodal.json?raw";
import currentSourceLc from "./current-source-lc.nodal.json?raw";
import divider from "./divider.nodal.json?raw";
import fullWaveRectifier from "./full-wave-rectifier.nodal.json?raw";
import halfWaveRectifier from "./half-wave-rectifier.nodal.json?raw";
import opampInverting from "./opamp-inverting.nodal.json?raw";
import pushPull from "./push-pull.nodal.json?raw";
import rcLowpass from "./rc-lowpass.nodal.json?raw";
import rlcBandpass from "./rlc-bandpass.nodal.json?raw";
import switchHysteresis from "./switch-hysteresis.nodal.json?raw";

export interface Example {
  id: string;
  title: string;
  summary: string;
  /** Parse the bundled file. Throws if the file is invalid, which a test rules out. */
  load(): Project;
}

function example(id: string, title: string, summary: string, raw: string): Example {
  return {
    id,
    title,
    summary,
    load(): Project {
      const parsed = parseProject(JSON.parse(raw) as unknown);
      if (!parsed.ok) throw new Error(`example ${id}: ${parsed.error}`);
      return parsed.project;
    },
  };
}

export const EXAMPLES: readonly Example[] = [
  example("divider", "Resistive divider", "10 V across 10 kΩ and 5 kΩ; operating point.", divider),
  example(
    "rc-lowpass",
    "RC low-pass",
    "1 kΩ and 100 nF; AC sweep with the corner at 1.59 kHz, and a pulse response.",
    rcLowpass,
  ),
  example(
    "rlc-bandpass",
    "RLC band-pass",
    "Series 10 mH, 1 µF and 100 Ω; resonance at 1.59 kHz.",
    rlcBandpass,
  ),
  example(
    "half-wave-rectifier",
    "Half-wave rectifier",
    "10 V 50 Hz sine into a diode, 1 kΩ and 100 µF; transient.",
    halfWaveRectifier,
  ),
  example(
    "full-wave-rectifier",
    "Full-wave bridge rectifier",
    "Four diodes feeding a floating 1 kΩ and 100 µF load; transient.",
    fullWaveRectifier,
  ),
  example(
    "ce-amplifier",
    "Common-emitter amplifier",
    "NPN with divider bias and a bypassed emitter; operating point, AC gain and a 10 mV sine.",
    ceAmplifier,
  ),
  example(
    "cmos-inverter",
    "CMOS inverter",
    "Level 1 NMOS and PMOS at 3.3 V; DC transfer curve and switching with a 100 fF load.",
    cmosInverter,
  ),
  example(
    "opamp-inverting",
    "Inverting amplifier",
    "High-gain op-amp (gain 1e9) with 1 kΩ and 10 kΩ; gain of about -10.",
    opampInverting,
  ),
  example(
    "controlled-sources",
    "Controlled sources",
    "VCVS, VCCS, CCVS and CCCS driven from a 1 V source through 1 kΩ; operating point.",
    controlledSources,
  ),
  example(
    "current-source-lc",
    "Current source with L and C",
    "2 mA into a resistor network with an inductor and a capacitor; at DC the inductor is a short and the capacitor is open.",
    currentSourceLc,
  ),
  example(
    "switch-hysteresis",
    "Switch with hysteresis",
    "Voltage-controlled switch (VT 2.5 V, VH 0.5 V) with a triangular control, into an RC load; transient.",
    switchHysteresis,
  ),
  example(
    "push-pull",
    "Push-pull emitter follower",
    "Complementary NPN and PNP on ±5 V rails, 1 V 1 kHz sine into 1 kΩ; transient shows the crossover dead zone.",
    pushPull,
  ),
];
