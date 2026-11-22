// @vitest-environment node
/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync, run } from "@nodal/wasm";
import { parseProject } from "@nodal/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { projectToNetlist } from "../netlist/netlister";
import { decodeResult, signalKey, type SimResult } from "./results";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const wasmPath = fileURLToPath(
  new URL("../../../../crates/nodal-wasm/pkg/nodal_wasm_bg.wasm", import.meta.url),
);

const REL_TOL = 1e-12;

interface CliSeries {
  re: number[];
  im: number[];
}
type CliValues = number[] | CliSeries;
interface CliResult {
  type: string;
  time?: number[];
  sweep?: number[];
  frequencies?: number[];
  nodeVoltages: Record<string, CliValues>;
  branchCurrents: Record<string, CliValues>;
}

/** Relative difference as the rule defines it; 0 when both are exactly equal. */
function relDiff(v: number, w: number): number {
  if (v === w) return 0;
  const scale = Math.max(Math.abs(v), Math.abs(w));
  return Math.abs(v - w) / scale;
}

const worst = new Map<string, number>();

function compare(id: string, label: string, a: ArrayLike<number>, b: number[]): void {
  if (a.length !== b.length) {
    throw new Error(
      `${id} ${label}: length ${String(a.length)} (browser) vs ${String(b.length)} (CLI)`,
    );
  }
  for (let i = 0; i < a.length; i++) {
    const v = a[i] ?? NaN;
    const w = b[i] ?? NaN;
    const d = relDiff(v, w);
    worst.set(id, Math.max(worst.get(id) ?? 0, d));
    if (!(Math.abs(v - w) <= REL_TOL * Math.max(Math.abs(v), Math.abs(w)))) {
      throw new Error(
        `${id} ${label}[${String(i)}]: browser ${String(v)} vs CLI ${String(w)} (relative difference ${String(d)})`,
      );
    }
  }
}

function series(v: CliValues): CliSeries {
  return Array.isArray(v) ? { re: v, im: [] } : v;
}

function compareAll(id: string, sim: SimResult, cli: CliResult): void {
  expect(sim.type).toBe(cli.type);
  const axis = cli.time ?? cli.sweep ?? cli.frequencies ?? [];
  compare(id, "axis", sim.axis, axis);
  const cliSignals = new Map<string, CliValues>();
  for (const [k, v] of Object.entries(cli.nodeVoltages)) cliSignals.set(`V(${k})`, v);
  for (const [k, v] of Object.entries(cli.branchCurrents)) cliSignals.set(`I(${k})`, v);
  expect(sim.signals.map(signalKey).sort()).toEqual([...cliSignals.keys()].sort());
  for (const s of sim.signals) {
    const key = signalKey(s);
    const values = cliSignals.get(key);
    if (values === undefined) throw new Error(`${id}: no CLI signal ${key}`);
    const c = series(values);
    compare(id, key, s.re, c.re);
    if (sim.type === "ac") compare(id, `${key} im`, s.im ?? new Float64Array(0), c.im);
  }
}

describe("browser parity with the CLI", () => {
  beforeAll(() => {
    initSync({ module: readFileSync(wasmPath) });
  });

  it.each(["T1-trap", "T1-gear", "A1"])(
    "browser_matches_cli [%s]",
    (id) => {
      const parsed = parseProject(
        JSON.parse(
          readFileSync(join(root, "validation/schematics", `${id}.nodal.json`), "utf8"),
        ) as unknown,
      );
      if (!parsed.ok) throw new Error(`${id}: ${parsed.error}`);
      const { ir, diagnostics } = projectToNetlist(parsed.project);
      if (ir === null) throw new Error(`${id}: netlist failed: ${JSON.stringify(diagnostics)}`);
      const json = JSON.stringify(ir);

      const out = run(json, 0, () => {});
      const sim = decodeResult(out.meta, out.take_data());
      out.free();

      const dir = mkdtempSync(join(tmpdir(), "nodal-parity-"));
      try {
        const file = join(dir, `${id}.json`);
        writeFileSync(file, json);
        const proc = spawnSync("cargo", ["run", "--quiet", "-p", "nodal-cli", "--", "run", file], {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
        });
        if (proc.error) throw proc.error;
        if (proc.status !== 0)
          throw new Error(`cargo exited ${String(proc.status)}: ${proc.stderr}`);
        const cli = (JSON.parse(proc.stdout) as { results: CliResult[] }).results[0];
        if (cli === undefined) throw new Error(`${id}: CLI produced no result`);
        compareAll(id, sim, cli);
        console.log(`parity ${id}: largest relative difference ${String(worst.get(id) ?? 0)}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
