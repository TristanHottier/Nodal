import { afterEach, describe, expect, it, vi } from "vitest";
import { getEngineVersion } from "./client";

class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();
  reply(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
  fail(message: string): void {
    this.dispatchEvent(new ErrorEvent("error", { message }));
  }
  asWorker(): Worker {
    return this as unknown as Worker;
  }
}

describe("getEngineVersion", () => {
  it("resolves with version from worker", async () => {
    const w = new FakeWorker();
    const p = getEngineVersion({ worker: w.asWorker() });
    expect(w.postMessage).toHaveBeenCalledWith({ type: "version" });
    w.reply({ type: "version", version: "0.1.0" });
    await expect(p).resolves.toBe("0.1.0");
  });

  it("rejects on error response", async () => {
    const w = new FakeWorker();
    const p = getEngineVersion({ worker: w.asWorker() });
    w.reply({ type: "error", message: "boom" });
    await expect(p).rejects.toThrow("boom");
  });

  it("rejects on timeout", async () => {
    const w = new FakeWorker();
    await expect(getEngineVersion({ worker: w.asWorker(), timeoutMs: 50 })).rejects.toThrow(
      "engine worker timed out",
    );
  });

  it("rejects on worker error event", async () => {
    const w = new FakeWorker();
    const p = getEngineVersion({ worker: w.asWorker() });
    w.fail("script load failed");
    await expect(p).rejects.toThrow("script load failed");
  });

  describe("without an injected worker", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("rejects when the Worker constructor throws synchronously", async () => {
      vi.stubGlobal("Worker", function () {
        throw new Error("worker construction failed");
      });
      await expect(getEngineVersion()).rejects.toThrow("worker construction failed");
    });
  });
});
