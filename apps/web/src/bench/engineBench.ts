import type { EngineRunner } from "../engine/client";

export interface BenchCase {
  name: string;
  netlist: string;
  budgetMs: number;
}

export interface BenchRow {
  name: string;
  budgetMs: number;
  samplesMs: number[];
  medianMs: number | null;
  status: "pass" | "fail" | "timed out" | "error";
  detail?: string;
  /** Frame-rate rows only. */
  fps?: number;
  slowFrames?: number;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const lo = s[mid - 1] ?? 0;
  const hi = s[mid] ?? 0;
  return s.length % 2 === 1 ? hi : (lo + hi) / 2;
};

const TIMED_OUT = Symbol("timed out");

/** Resolves to TIMED_OUT, and cancels the engine, when `run` is still pending after `timeoutMs`. */
async function withTimeout(
  client: EngineRunner,
  run: Promise<unknown>,
  timeoutMs: number,
): Promise<typeof TIMED_OUT | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      resolve(TIMED_OUT);
    }, timeoutMs);
  });
  try {
    const winner = await Promise.race([run.then(() => undefined), timeout]);
    if (winner === TIMED_OUT) {
      client.cancel();
      // The cancelled run rejects; that rejection is expected.
      run.catch(() => undefined);
    }
    return winner;
  } finally {
    clearTimeout(timer);
  }
}

async function benchCase(
  client: EngineRunner,
  c: BenchCase,
  opts: { repeats: number; timeoutMs: number },
): Promise<BenchRow> {
  const row: BenchRow = {
    name: c.name,
    budgetMs: c.budgetMs,
    samplesMs: [],
    medianMs: null,
    status: "error",
  };
  try {
    // One warm-up run: compiles the WASM module and primes the worker.
    for (let i = -1; i < opts.repeats; i++) {
      const start = performance.now();
      const run = client.run(c.netlist, 0);
      if ((await withTimeout(client, run, opts.timeoutMs)) === TIMED_OUT) {
        row.status = "timed out";
        row.detail = `no result within ${String(opts.timeoutMs)} ms`;
        row.medianMs = median(row.samplesMs);
        return row;
      }
      const elapsed = performance.now() - start;
      if (i >= 0) row.samplesMs.push(elapsed);
    }
    row.medianMs = median(row.samplesMs);
    row.status = row.medianMs !== null && row.medianMs <= c.budgetMs ? "pass" : "fail";
  } catch (e) {
    row.status = "error";
    row.detail = e instanceof Error ? e.message : String(e);
    row.medianMs = median(row.samplesMs);
  }
  return row;
}

/**
 * Times `client.run(netlist, 0)` (worker round trip and result decode included) per case:
 * one warm-up run, then `repeats` timed runs. The median decides pass or fail.
 */
export async function runEngineBench(
  client: EngineRunner & { version(): Promise<string> },
  cases: BenchCase[],
  opts: { repeats: number; timeoutMs: number },
): Promise<BenchRow[]> {
  const rows: BenchRow[] = [];
  try {
    await client.version();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return cases.map((c) => ({
      name: c.name,
      budgetMs: c.budgetMs,
      samplesMs: [],
      medianMs: null,
      status: "error",
      detail,
    }));
  }
  for (const c of cases) rows.push(await benchCase(client, c, opts));
  return rows;
}
