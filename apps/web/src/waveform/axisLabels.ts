// Axis titles for the plots: every title carries its unit, taken from the result type and the probes.
import type { SimResult } from "../engine/results";

/** Unit of a signal key: `I(...)` is a current, everything else a node voltage. */
export const signalUnit = (key: string): "A" | "V" => (key.startsWith("I(") ? "A" : "V");

/** Unit of a swept source by its SPICE prefix: V is volts, I is amps, R is ohms; others have none. */
const sweepUnit = (source: string): string => {
  const c = source.charAt(0).toUpperCase();
  return c === "V" ? "V" : c === "I" ? "A" : c === "R" ? "Ω" : "";
};

/** The x axis title: time, frequency, or the swept source with its unit. */
export function xLabelOf(result: SimResult): string {
  if (result.type === "tran") return "Time (s)";
  if (result.type === "ac") return "Frequency (Hz)";
  const source = result.source ?? "";
  if (source === "") return "Sweep";
  const unit = sweepUnit(source);
  return unit === "" ? source : `${source} (${unit})`;
}

/**
 * The y axis title of a linear plot (transient and DC sweep). One probe names the signal and its
 * unit ("V(out) (V)"); several probes of one kind name the quantity ("Voltage (V)"); a mix lists both.
 */
export function yLabelOf(probes: readonly string[]): string {
  const only = probes.length === 1 ? probes[0] : undefined;
  if (only !== undefined) return `${only} (${signalUnit(only)})`;
  const volts = probes.some((k) => signalUnit(k) === "V");
  const amps = probes.some((k) => signalUnit(k) === "A");
  if (volts && amps) return "Voltage (V), current (A)";
  return amps ? "Current (A)" : "Voltage (V)";
}
