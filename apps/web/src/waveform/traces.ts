// Pure waveform data layer: derived resistor currents, signal list and trace values.
import type { Netlist } from "@nodal/schema";
import { type Signal, type SimResult, signalKey } from "../engine/results";

export type TraceView = "linear" | "mag" | "phase";

/**
 * Returns a copy of `result` with one `I(R)` signal per resistor that has no
 * reported current: `(V(n+) - V(n-)) / R`, positive from `nodes[0]` through the
 * resistor to `nodes[1]`. Appended after the engine's signals in element order.
 */
export function withDerivedCurrents(result: SimResult, ir: Netlist): SimResult {
  const volts = new Map<string, Signal>();
  const haveCurrent = new Set<string>();
  for (const s of result.signals) {
    if (s.kind === "v") volts.set(s.name.toLowerCase(), s);
    else haveCurrent.add(s.name.toLowerCase());
  }
  const points = result.type === "op" ? 1 : result.axis.length;
  const isAc = result.type === "ac";
  const added: Signal[] = [];
  for (const el of ir.elements) {
    if (el.kind !== "R" || haveCurrent.has(el.name.toLowerCase())) continue;
    const [p, n] = el.nodes;
    const vp = p === "0" ? null : volts.get(p.toLowerCase());
    const vn = n === "0" ? null : volts.get(n.toLowerCase());
    if ((p !== "0" && !vp) || (n !== "0" && !vn)) continue;
    const part = (pick: (s: Signal) => Float64Array | undefined): Float64Array => {
      const a = vp ? pick(vp) : undefined;
      const b = vn ? pick(vn) : undefined;
      return Float64Array.from(
        { length: points },
        (_, k) => ((a?.[k] ?? 0) - (b?.[k] ?? 0)) / el.value,
      );
    };
    const sig: Signal = { name: el.name, kind: "i", re: part((s) => s.re) };
    if (isAc) sig.im = part((s) => s.im);
    added.push(sig);
  }
  if (added.length === 0) return result;
  return { ...result, signals: [...result.signals, ...added] };
}

/** Voltages first, then currents, each in result order. */
export function listSignals(result: SimResult): { key: string; label: string }[] {
  const keys = [
    ...result.signals.filter((s) => s.kind === "v"),
    ...result.signals.filter((s) => s.kind === "i"),
  ].map(signalKey);
  return keys.map((key) => ({ key, label: key }));
}

export function traceValues(result: SimResult, key: string, view: TraceView): Float64Array {
  const s = result.signals.find((x) => signalKey(x) === key);
  if (!s) throw new Error(`unknown signal ${key}`);
  if (view === "linear") return s.re;
  const out = new Float64Array(s.re.length);
  for (let k = 0; k < out.length; k++) {
    const re = s.re[k] ?? 0;
    const im = s.im?.[k] ?? 0;
    if (view === "mag") {
      const m = Math.hypot(re, im);
      out[k] = m === 0 ? NaN : 20 * Math.log10(m);
    } else {
      const deg = (Math.atan2(im, re) * 180) / Math.PI;
      out[k] = deg === -180 ? 180 : deg;
    }
  }
  return out;
}
