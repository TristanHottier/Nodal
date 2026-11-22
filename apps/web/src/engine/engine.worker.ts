import init, { engine_version, run } from "@nodal/wasm";
import type { WorkerRequest, WorkerResponse } from "./protocol";

// init() must run once; every request awaits the same memoized promise.
let ready: Promise<unknown> | undefined;
function ensureInit(): Promise<unknown> {
  const started = ready ?? init();
  ready = started;
  // A failed init is not memoized: the next request retries.
  started.catch(() => {
    if (ready === started) ready = undefined;
  });
  return started;
}

function reply(response: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(response, { transfer });
}

// wasm throws ErrorInfo JSON strings; keep those verbatim so the client can decode them.
function describe(e: unknown): unknown {
  if (typeof e === "string") return e;
  return e instanceof Error ? e.message : String(e);
}

async function handle(req: WorkerRequest): Promise<void> {
  await ensureInit();
  if (req.type === "version") {
    reply({ type: "version", id: req.id, version: engine_version() });
    return;
  }
  const out = run(req.netlist, req.analysisIndex, (fraction: number) => {
    reply({ type: "progress", id: req.id, fraction });
  });
  try {
    const meta = out.meta;
    const data = out.take_data();
    reply({ type: "result", id: req.id, meta, data }, [data.buffer]);
  } finally {
    out.free();
  }
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  handle(req).catch((e: unknown) => {
    // wasm throws engine errors as strings; anything else (a trap) leaves the instance unusable.
    reply({ type: "error", id: req.id, error: describe(e), fatal: typeof e !== "string" });
  });
});
