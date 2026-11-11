import type { WorkerRequest, WorkerResponse } from "./protocol";

export function getEngineVersion(
  opts: { timeoutMs?: number; worker?: Worker } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const ownsWorker = opts.worker === undefined;

  return new Promise<string>((resolve, reject) => {
    // Constructed inside the executor so a synchronous throw becomes a rejection.
    let worker: Worker;
    try {
      worker =
        opts.worker ??
        new Worker(new URL("./engine.worker.ts", import.meta.url), {
          type: "module",
        });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const cleanup = (): void => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (ownsWorker) worker.terminate();
    };
    const onMessage = (event: MessageEvent<WorkerResponse>): void => {
      cleanup();
      if (event.data.type === "version") resolve(event.data.version);
      else reject(new Error(event.data.message));
    };
    const onError = (event: ErrorEvent): void => {
      cleanup();
      reject(new Error(event.message || "engine worker error"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("engine worker timed out"));
    }, timeoutMs);

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    const request: WorkerRequest = { type: "version" };
    worker.postMessage(request);
  });
}
