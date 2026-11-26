// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initSync, run } from "@nodal/wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeResult, signalKey, type SimResult } from "../engine/results";
import { projectToNetlist } from "../netlist/netlister";
import { EXAMPLES } from "./index";

const wasmPath = fileURLToPath(
  new URL("../../../../crates/nodal-wasm/pkg/nodal_wasm_bg.wasm", import.meta.url),
);

beforeAll(() => {
  initSync({ module: readFileSync(wasmPath) });
});

function netlist(id: string) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (ex === undefined) throw new Error(`no example ${id}`);
  const { ir, diagnostics } = projectToNetlist(ex.load());
  if (ir === null) throw new Error(`${id}: ${JSON.stringify(diagnostics)}`);
  return ir;
}

/** Run analysis `index` of an example through the wasm engine. */
function simulate(id: string, index: number): SimResult {
  const out = run(JSON.stringify(netlist(id)), index, () => {});
  try {
    return decodeResult(out.meta, out.take_data());
  } finally {
    out.free();
  }
}

function signal(sim: SimResult, key: string) {
  const s = sim.signals.find((x) => signalKey(x) === key);
  if (s === undefined) {
    throw new Error(`no signal ${key}; have ${sim.signals.map(signalKey).join(", ")}`);
  }
  return s;
}

const at = (a: ArrayLike<number>, i: number): number => a[i] ?? NaN;

/** Magnitude in dB of V(name) (the AC source has magnitude 1). */
function acDb(sim: SimResult, name: string): number[] {
  const s = signal(sim, `V(${name})`);
  const im = s.im ?? new Float64Array(0);
  return Array.from(s.re, (re, i) => 20 * Math.log10(Math.hypot(re, at(im, i))));
}

/** Linear interpolation of `y` against log10(frequency). */
function interpolateLog(f: ArrayLike<number>, y: number[], f0: number): number {
  for (let i = 1; i < f.length; i++) {
    if (at(f, i) >= f0) {
      const a = Math.log10(at(f, i - 1));
      const b = Math.log10(at(f, i));
      const t = (Math.log10(f0) - a) / (b - a);
      return at(y, i - 1) + t * (at(y, i) - at(y, i - 1));
    }
  }
  throw new Error(`frequency ${String(f0)} outside the sweep`);
}

/** Linear interpolation of `y` against time at `t0`. */
function interpolateTime(t: ArrayLike<number>, y: ArrayLike<number>, t0: number): number {
  for (let i = 1; i < t.length; i++) {
    if (at(t, i) >= t0) {
      const f = (t0 - at(t, i - 1)) / (at(t, i) - at(t, i - 1));
      return at(y, i - 1) + f * (at(y, i) - at(y, i - 1));
    }
  }
  throw new Error(`time ${String(t0)} outside the run`);
}

/** The op tolerance of docs/VALIDATION.md section 3: 1e-5 relative plus 1e-8 V or 1e-13 A. */
function withinOp(x: number, ref: number, abs: number): boolean {
  return Math.abs(x - ref) <= 1e-5 * Math.abs(ref) + abs;
}

/** Largest value of `values` over samples with time >= tFrom. */
function maxFrom(time: ArrayLike<number>, values: ArrayLike<number>, tFrom: number): number {
  let m = -Infinity;
  for (let i = 0; i < time.length; i++) if (at(time, i) >= tFrom) m = Math.max(m, at(values, i));
  return m;
}

describe("example projects", () => {
  it("every_example_parses_and_netlists_cleanly", () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual([
      "divider",
      "rc-lowpass",
      "rlc-bandpass",
      "half-wave-rectifier",
      "full-wave-rectifier",
      "ce-amplifier",
      "cmos-inverter",
      "opamp-inverting",
      "controlled-sources",
      "current-source-lc",
      "switch-hysteresis",
      "push-pull",
    ]);
    for (const ex of EXAMPLES) {
      const project = ex.load();
      const { ir, diagnostics } = projectToNetlist(project);
      expect(diagnostics, ex.id).toEqual([]);
      expect(ir, ex.id).not.toBeNull();
      expect(ex.title, ex.id).not.toBe("");
      expect(ex.summary, ex.id).not.toBe("");
    }
  });

  it("every_analysis_runs", () => {
    for (const ex of EXAMPLES) {
      const project = ex.load();
      project.simulation.analyses.forEach((a, i) => {
        const sim = simulate(ex.id, i);
        expect(sim.type, `${ex.id} analysis ${String(i)}`).toBe(a.type);
        expect(sim.signals.length, ex.id).toBeGreaterThan(0);
        for (const s of sim.signals) {
          expect(
            s.re.every((v) => Number.isFinite(v)),
            `${ex.id} ${signalKey(s)}`,
          ).toBe(true);
        }
      });
    }
  });

  it("divider_matches_expectation", () => {
    const v = at(signal(simulate("divider", 0), "V(out)").re, 0);
    expect(Math.abs(v - 10 / 3) / (10 / 3)).toBeLessThan(1e-9);
  });

  it("rc_lowpass_matches_expectation", () => {
    const sim = simulate("rc-lowpass", 0);
    const fc = 1 / (2 * Math.PI * 1e3 * 100e-9);
    const db = interpolateLog(sim.axis, acDb(sim, "out"), fc);
    expect(Math.abs(db + 3.01)).toBeLessThan(0.05);
  });

  it("rlc_bandpass_matches_expectation", () => {
    const sim = simulate("rlc-bandpass", 0);
    const db = acDb(sim, "out");
    const f0 = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 1e-6));
    const peak = db.indexOf(Math.max(...db));
    expect(Math.abs(at(sim.axis, peak) - f0) / f0).toBeLessThan(0.02);
    expect(Math.abs(at(db, peak))).toBeLessThan(0.1);
  });

  it("half_wave_rectifier_matches_expectation", () => {
    const sim = simulate("half-wave-rectifier", 0);
    const peak = maxFrom(sim.axis, signal(sim, "V(out)").re, 0.04);
    expect(peak).toBeGreaterThan(9.0);
    expect(peak).toBeLessThan(9.6);
  });

  it("full_wave_rectifier_matches_expectation", () => {
    const sim = simulate("full-wave-rectifier", 0);
    const p = signal(sim, "V(outp)").re;
    const n = signal(sim, "V(outn)").re;
    const diff = Float64Array.from(p, (v, i) => v - at(n, i));
    const peak = maxFrom(sim.axis, diff, 0.04);
    expect(peak).toBeGreaterThan(8.3);
    expect(peak).toBeLessThan(9.0);
  });

  it("ce_amplifier_matches_expectation", () => {
    const vc = at(signal(simulate("ce-amplifier", 0), "V(c)").re, 0);
    expect(vc).toBeGreaterThan(3);
    expect(vc).toBeLessThan(9);
    const sim = simulate("ce-amplifier", 1);
    const gain = 10 ** (interpolateLog(sim.axis, acDb(sim, "out"), 10e3) / 20);
    expect(gain).toBeGreaterThan(20);
    expect(gain).toBeLessThan(200);
  });

  it("cmos_inverter_matches_expectation", () => {
    const sim = simulate("cmos-inverter", 0);
    const out = signal(sim, "V(out)").re;
    expect(at(sim.axis, 0)).toBeCloseTo(0, 12);
    expect(at(sim.axis, sim.axis.length - 1)).toBeCloseTo(3.3, 9);
    expect(at(out, 0)).toBeGreaterThan(3.2);
    expect(at(out, out.length - 1)).toBeLessThan(0.1);
  });

  it("opamp_inverting_matches_expectation", () => {
    const v = at(signal(simulate("opamp-inverting", 0), "V(out)").re, 0);
    expect(Math.abs(v + 5) / 5).toBeLessThan(1e-6);
  });

  it("controlled_sources_match_the_golden", () => {
    // validation/golden/L3.op.csv (ngspice-42): V(e) 2, V(g) -2, V(h) -1, V(f) 2.
    const sim = simulate("controlled-sources", 0);
    const golden: [string, number][] = [
      ["V(e)", 2],
      ["V(g)", -2],
      ["V(h)", -1],
      ["V(f)", 2],
    ];
    for (const [key, ref] of golden)
      expect(withinOp(at(signal(sim, key).re, 0), ref, 1e-8), key).toBe(true);
  });

  it("current_source_lc_matches_the_golden", () => {
    // validation/golden/L5.op.csv (ngspice-42): V(a) 3 V, V(b) = V(c) = 2 V, I(L1) 1 mA.
    const sim = simulate("current-source-lc", 0);
    expect(withinOp(at(signal(sim, "V(a)").re, 0), 3, 1e-8)).toBe(true);
    expect(withinOp(at(signal(sim, "V(b)").re, 0), 2, 1e-8)).toBe(true);
    expect(withinOp(at(signal(sim, "V(c)").re, 0), 2, 1e-8)).toBe(true);
    expect(withinOp(at(signal(sim, "I(L1)").re, 0), 1e-3, 1e-13)).toBe(true);
  });

  it("switch_hysteresis_matches_the_golden", () => {
    // validation/golden/T6-trap.tran.csv (ngspice-42): V(out) interpolated at 1 ms is
    // 0.510285 V. Tolerance as in docs/VALIDATION.md section 3 for transients:
    // 1e-3 of the 4.5404 V peak-to-peak of V(out), plus 1e-8 V.
    const sim = simulate("switch-hysteresis", 0);
    const v = interpolateTime(sim.axis, signal(sim, "V(out)").re, 1e-3);
    expect(Math.abs(v - 0.5102846411495444)).toBeLessThanOrEqual(1e-3 * 4.540411538966773 + 1e-8);
  });

  it("push_pull_matches_ngspice", () => {
    // ngspice-42 on the exported deck (.tran 1e-6 2e-3), v(out) at the input peak,
    // t = 0.25 ms, linearly interpolated: 0.37079614668 V. Nodal gives 0.37079614702 V,
    // a difference of 3.4e-10 V. Over every ngspice time point the largest difference
    // after interpolating Nodal's output was 2.2e-7 V, so 1e-6 V is the bound here.
    const sim = simulate("push-pull", 1);
    const v = interpolateTime(sim.axis, signal(sim, "V(out)").re, 0.25e-3);
    expect(Math.abs(v - 0.37079614668)).toBeLessThan(1e-6);
  });
});
