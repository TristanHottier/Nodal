import { afterEach, describe, expect, it, vi } from "vitest";
import { CancelledError, EngineClient, EngineRunError } from "./client";

class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();
  reply(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
  fail(message: string): void {
    this.dispatchEvent(new ErrorEvent("error", { message }));
  }
  messageError(): void {
    this.dispatchEvent(new MessageEvent("messageerror"));
  }
  lastId(): number {
    const calls = this.postMessage.mock.calls;
    return (calls[calls.length - 1]?.[0] as { id: number }).id;
  }
  asWorker(): Worker {
    return this as unknown as Worker;
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new EngineClient({
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w.asWorker();
    },
  });
  return { workers, client };
}

function nth(workers: FakeWorker[], i: number): FakeWorker {
  const w = workers[i];
  if (!w) throw new Error(`no worker ${String(i)}`);
  return w;
}

const META = JSON.stringify({
  type: "op",
  source: null,
  points: 1,
  signals: [{ name: "n1", kind: "v" }],
});

describe("EngineClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("version_resolves", async () => {
    const { workers, client } = setup();
    const p = client.version();
    const w = nth(workers, 0);
    expect(w.postMessage).toHaveBeenCalledWith({ type: "version", id: w.lastId() });
    w.reply({ type: "version", id: w.lastId(), version: "1.1.0" });
    await expect(p).resolves.toBe("1.1.0");
  });

  it("version_times_out", async () => {
    const { client } = setup();
    await expect(client.version(50)).rejects.toThrow("engine worker timed out");
  });

  it("run_resolves_decoded_result", async () => {
    const { workers, client } = setup();
    const p = client.run("netlist", 2);
    const w = nth(workers, 0);
    expect(w.postMessage).toHaveBeenCalledWith({
      type: "run",
      id: w.lastId(),
      netlist: "netlist",
      analysisIndex: 2,
    });
    w.reply({ type: "result", id: w.lastId(), meta: META, data: new Float64Array([3.5]) });
    const r = await p;
    expect(r.type).toBe("op");
    expect(r.signals[0]?.name).toBe("n1");
    expect(r.signals[0]?.re[0]).toBe(3.5);
  });

  it("progress_forwarded", async () => {
    const { workers, client } = setup();
    const seen: number[] = [];
    const p = client.run("n", 0, { onProgress: (f) => seen.push(f) });
    const w = nth(workers, 0);
    const id = w.lastId();
    w.reply({ type: "progress", id, fraction: 0.25 });
    w.reply({ type: "progress", id, fraction: 0.5 });
    w.reply({ type: "result", id, meta: META, data: new Float64Array([1]) });
    await p;
    expect(seen).toEqual([0.25, 0.5]);
  });

  it("engine_error_becomes_EngineRunError", async () => {
    const { workers, client } = setup();
    const p = client.run("n", 0);
    const w = nth(workers, 0);
    const info = { message: "singular matrix", elements: ["R1"], nodes: ["n1"] };
    w.reply({ type: "error", id: w.lastId(), error: JSON.stringify(info) });
    const err: unknown = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineRunError);
    expect((err as EngineRunError).message).toBe("singular matrix");
    expect((err as EngineRunError).info).toEqual(info);
  });

  it("abort_signal_cancels", async () => {
    const { workers, client } = setup();
    const ac = new AbortController();
    const p = client.run("n", 0, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(nth(workers, 0).terminate).toHaveBeenCalled();
  });

  it("already_aborted_signal_rejects_without_worker", async () => {
    const { workers, client } = setup();
    const ac = new AbortController();
    ac.abort();
    await expect(client.run("n", 0, { signal: ac.signal })).rejects.toBeInstanceOf(CancelledError);
    expect(workers).toHaveLength(0);
  });

  it("cancel_then_run_uses_fresh_worker", async () => {
    const { workers, client } = setup();
    const p1 = client.run("n", 0);
    client.cancel();
    await expect(p1).rejects.toBeInstanceOf(CancelledError);
    expect(nth(workers, 0).terminate).toHaveBeenCalledTimes(1);
    const p2 = client.run("n", 0);
    expect(workers).toHaveLength(2);
    const w = nth(workers, 1);
    w.reply({ type: "result", id: w.lastId(), meta: META, data: new Float64Array([1]) });
    await expect(p2).resolves.toBeDefined();
  });

  it("new_run_cancels_active_run", async () => {
    const { workers, client } = setup();
    const p1 = client.run("a", 0);
    const p2 = client.run("b", 0);
    await expect(p1).rejects.toBeInstanceOf(CancelledError);
    const w = nth(workers, 1);
    w.reply({ type: "result", id: w.lastId(), meta: META, data: new Float64Array([1]) });
    await expect(p2).resolves.toBeDefined();
  });

  it("cancel_without_run_is_noop", async () => {
    const { workers, client } = setup();
    const p = client.version();
    client.cancel();
    expect(nth(workers, 0).terminate).not.toHaveBeenCalled();
    nth(workers, 0).reply({ type: "version", id: nth(workers, 0).lastId(), version: "1" });
    await expect(p).resolves.toBe("1");
  });

  it("cancel_rejects_pending_version", async () => {
    const { workers, client } = setup();
    const v = client.version();
    const r = client.run("n", 0);
    client.cancel();
    await expect(r).rejects.toBeInstanceOf(CancelledError);
    await expect(v).rejects.toBeInstanceOf(CancelledError);
    expect(nth(workers, 0).terminate).toHaveBeenCalled();
  });

  it("dispose_rejects_pending_and_terminates", async () => {
    const { workers, client } = setup();
    const r = client.run("n", 0);
    client.dispose();
    await expect(r).rejects.toBeInstanceOf(CancelledError);
    expect(nth(workers, 0).terminate).toHaveBeenCalled();
  });

  it("worker_crash_rejects_and_respawns", async () => {
    const { workers, client } = setup();
    const r = client.run("n", 0);
    const v = client.version();
    nth(workers, 0).fail("script load failed");
    await expect(r).rejects.toThrow("script load failed");
    await expect(v).rejects.toThrow("script load failed");
    const p = client.version();
    expect(workers).toHaveLength(2);
    nth(workers, 1).reply({ type: "version", id: nth(workers, 1).lastId(), version: "2" });
    await expect(p).resolves.toBe("2");
  });

  it("wasm_trap_respawns", async () => {
    const { workers, client } = setup();
    const r = client.run("n", 0);
    const w = nth(workers, 0);
    w.reply({ type: "error", id: w.lastId(), error: "unreachable", fatal: true });
    const err: unknown = await r.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(EngineRunError);
    expect((err as Error).message).toBe("Engine crashed (internal error: unreachable)");
    expect(w.terminate).toHaveBeenCalled();
    client.run("n", 0).catch(() => undefined);
    expect(workers).toHaveLength(2);
  });

  it("engine_error_keeps_worker", async () => {
    const { workers, client } = setup();
    const r = client.run("n", 0);
    const w = nth(workers, 0);
    w.reply({ type: "error", id: w.lastId(), error: "plain failure" });
    await expect(r).rejects.toBeInstanceOf(EngineRunError);
    expect(w.terminate).not.toHaveBeenCalled();
    client.run("n", 0).catch(() => undefined);
    expect(workers).toHaveLength(1);
  });

  it("messageerror_rejects", async () => {
    const { workers, client } = setup();
    const r = client.run("n", 0);
    nth(workers, 0).messageError();
    await expect(r).rejects.toThrow();
    client.version().catch(() => undefined);
    expect(workers).toHaveLength(2);
  });

  it("postMessage_throw_rejects", async () => {
    const { workers, client } = setup();
    const pendingVersion = client.version();
    const w = nth(workers, 0);
    w.postMessage.mockImplementationOnce(() => {
      throw new Error("clone failed");
    });
    await expect(client.run("n", 0)).rejects.toThrow("clone failed");
    // The failed run must leave no stale active run behind.
    client.cancel();
    expect(w.terminate).not.toHaveBeenCalled();
    w.reply({ type: "version", id: 1, version: "3" });
    await expect(pendingVersion).resolves.toBe("3");
  });

  it("version_error_carries_message", async () => {
    const { workers, client } = setup();
    const p = client.version();
    const w = nth(workers, 0);
    w.reply({ type: "error", id: w.lastId(), error: "init failed" });
    await expect(p).rejects.toThrow("init failed");
  });

  it("unknown_id_ignored", async () => {
    const { workers, client } = setup();
    const p = client.run("n", 0);
    const w = nth(workers, 0);
    w.reply({ type: "result", id: w.lastId() + 100, meta: META, data: new Float64Array([9]) });
    w.reply({ type: "progress", id: 12345, fraction: 0.5 });
    w.reply({ type: "result", id: w.lastId(), meta: META, data: new Float64Array([1]) });
    const r = await p;
    expect(r.signals[0]?.re[0]).toBe(1);
  });

  it("constructor_throw_rejects", async () => {
    vi.stubGlobal("Worker", function () {
      throw new Error("worker construction failed");
    });
    const client = new EngineClient();
    await expect(client.version()).rejects.toThrow("worker construction failed");
    await expect(client.run("n", 0)).rejects.toThrow("worker construction failed");
    // Nothing stale: a later cancel is a no-op and a healthy worker is created next time.
    client.cancel();
    const workers: FakeWorker[] = [];
    vi.stubGlobal("Worker", function () {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const p = client.version();
    client.cancel();
    expect(nth(workers, 0).terminate).not.toHaveBeenCalled();
    nth(workers, 0).reply({ type: "version", id: nth(workers, 0).lastId(), version: "4" });
    await expect(p).resolves.toBe("4");
  });
});
