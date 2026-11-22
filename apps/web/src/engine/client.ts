import type { WorkerRequest, WorkerResponse } from "./protocol";
import { decodeError, decodeResult } from "./results";
import type { EngineErrorInfo, SimResult } from "./results";

export class EngineRunError extends Error {
  readonly info: EngineErrorInfo;
  constructor(info: EngineErrorInfo) {
    super(info.message);
    this.name = "EngineRunError";
    this.info = info;
  }
}

export class CancelledError extends Error {
  constructor() {
    super("simulation cancelled");
    this.name = "CancelledError";
  }
}

export type EngineRunner = Pick<EngineClient, "run" | "cancel">;

interface Pending {
  resolve: (response: WorkerResponse) => void;
  reject: (reason: Error) => void;
  onProgress: ((fraction: number) => void) | undefined;
}

const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** One lazily created, long-lived worker; one run at a time. */
export class EngineClient {
  private readonly createWorker: () => Worker;
  private worker: Worker | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private activeRun: number | undefined;

  constructor(opts: { createWorker?: () => Worker } = {}) {
    this.createWorker =
      opts.createWorker ??
      (() => new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" }));
  }

  version(timeoutMs = 10_000): Promise<string> {
    const { id, promise } = this.request((i) => ({ type: "version", id: i }));
    const timer = setTimeout(() => {
      this.settle(id, new Error("engine worker timed out"));
    }, timeoutMs);
    return promise
      .then((r) => {
        if (r.type === "error") throw new Error(decodeError(r.error).message);
        if (r.type !== "version") throw new Error("unexpected engine response");
        return r.version;
      })
      .finally(() => {
        clearTimeout(timer);
      });
  }

  run(
    netlist: string,
    analysisIndex: number,
    opts: { onProgress?: (f: number) => void; signal?: AbortSignal } = {},
  ): Promise<SimResult> {
    const { signal } = opts;
    if (signal?.aborted) return Promise.reject(new CancelledError());
    this.cancel();
    const { promise } = this.request(
      (i) => ({ type: "run", id: i, netlist, analysisIndex }),
      opts.onProgress,
      true,
    );
    const onAbort = (): void => {
      this.cancel();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    return promise
      .then((r) => {
        if (r.type === "error") throw new EngineRunError(decodeError(r.error));
        if (r.type !== "result") throw new Error("unexpected engine response");
        return decodeResult(r.meta, r.data);
      })
      .finally(() => {
        signal?.removeEventListener("abort", onAbort);
      });
  }

  /** Terminates the worker when a run is active; otherwise does nothing. */
  cancel(): void {
    if (this.activeRun === undefined) return;
    this.dropWorker(new CancelledError());
  }

  dispose(): void {
    this.dropWorker(new CancelledError());
  }

  private request(
    build: (id: number) => WorkerRequest,
    onProgress?: (f: number) => void,
    isRun = false,
  ): { id: number; promise: Promise<WorkerResponse> } {
    const id = this.nextId++;
    const promise = new Promise<WorkerResponse>((resolve, reject) => {
      try {
        const worker = this.ensureWorker();
        this.pending.set(id, { resolve, reject, onProgress });
        // Set before postMessage so a synchronous failure's settle() clears it.
        if (isRun) this.activeRun = id;
        worker.postMessage(build(id));
      } catch (e) {
        this.settle(id, asError(e));
        reject(asError(e));
      }
    });
    return { id, promise };
  }

  private settle(id: number, error: Error): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (this.activeRun === id) this.activeRun = undefined;
    p.reject(error);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.addEventListener("message", (e) => {
      if (worker === this.worker) this.onMessage((e as MessageEvent<WorkerResponse>).data);
    });
    worker.addEventListener("error", (e) => {
      if (worker === this.worker) this.dropWorker(new Error(e.message || "engine worker error"));
    });
    worker.addEventListener("messageerror", () => {
      if (worker === this.worker)
        this.dropWorker(new Error("engine worker sent an unreadable message"));
    });
    this.worker = worker;
    return worker;
  }

  private onMessage(msg: WorkerResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === "progress") {
      p.onProgress?.(msg.fraction);
      return;
    }
    this.pending.delete(msg.id);
    if (this.activeRun === msg.id) this.activeRun = undefined;
    p.resolve(msg);
  }

  private dropWorker(reason: Error): void {
    const worker = this.worker;
    this.worker = undefined;
    this.activeRun = undefined;
    worker?.terminate();
    const all = [...this.pending.values()];
    this.pending.clear();
    for (const p of all) p.reject(reason);
  }
}
