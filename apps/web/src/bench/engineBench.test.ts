import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimResult } from "../engine/results";
import { runEngineBench } from "./engineBench";

const fakeResult = {} as SimResult;

function runner(run: () => Promise<SimResult>) {
  return {
    run: vi.fn(run),
    cancel: vi.fn(),
    version: vi.fn(() => Promise.resolve("test")),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runEngineBench", () => {
  it("median_decides_status", async () => {
    // Warm-up, then five timed runs of 10, 10, 10, 500, 500 ms: median 10 passes a 100 ms budget.
    const durations = [999, 10, 10, 10, 500, 500];
    let now = 0;
    let last = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const client = runner(() => {
      last = durations.shift() ?? 0;
      now += last;
      return Promise.resolve(fakeResult);
    });
    const [row] = await runEngineBench(client, [{ name: "c", netlist: "n", budgetMs: 100 }], {
      repeats: 5,
      timeoutMs: 1000,
    });
    expect(last).toBe(500);
    expect(client.run).toHaveBeenCalledTimes(6);
    expect(row?.samplesMs).toEqual([10, 10, 10, 500, 500]);
    expect(row?.medianMs).toBe(10);
    expect(row?.status).toBe("pass");

    // Same samples, tighter budget: the median misses it.
    const durations2 = [0, 10, 10, 10, 500, 500];
    const client2 = runner(() => {
      now += durations2.shift() ?? 0;
      return Promise.resolve(fakeResult);
    });
    const [row2] = await runEngineBench(client2, [{ name: "c", netlist: "n", budgetMs: 5 }], {
      repeats: 5,
      timeoutMs: 1000,
    });
    expect(row2?.status).toBe("fail");
  });

  it("bench_times_out_cleanly", async () => {
    vi.useFakeTimers();
    const client = runner(() => new Promise<SimResult>(() => undefined));
    const started = Date.now();
    const pending = runEngineBench(client, [{ name: "hang", netlist: "n", budgetMs: 10 }], {
      repeats: 3,
      timeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1100);
    const [row] = await pending;
    expect(Date.now() - started).toBeLessThanOrEqual(1100);
    expect(row?.status).toBe("timed out");
    expect(client.cancel).toHaveBeenCalledTimes(1);
    expect(client.run).toHaveBeenCalledTimes(1);
  });

  it("error_row_on_engine_error", async () => {
    const client = runner(() => Promise.reject(new Error("singular matrix")));
    const rows = await runEngineBench(
      client,
      [
        { name: "bad", netlist: "n", budgetMs: 10 },
        { name: "also", netlist: "n", budgetMs: 10 },
      ],
      { repeats: 2, timeoutMs: 1000 },
    );
    expect(rows.map((r) => r.status)).toEqual(["error", "error"]);
    expect(rows[0]?.detail).toBe("singular matrix");
    expect(rows[0]?.medianMs).toBeNull();
  });
});
