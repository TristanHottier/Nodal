import init, { engine_version } from "@nodal/wasm";
import type { WorkerResponse } from "./protocol";

// init() must run once; every request awaits the same memoized promise.
let ready: Promise<unknown> | undefined;
function ensureInit(): Promise<unknown> {
  const started = ready ?? init();
  ready = started;
  return started;
}

function reply(response: WorkerResponse): void {
  self.postMessage(response);
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

self.addEventListener("message", () => {
  // "version" is the only request type in the protocol.
  ensureInit()
    .then(() => {
      reply({ type: "version", version: engine_version() });
    })
    .catch((e: unknown) => {
      reply({ type: "error", message: describe(e) });
    });
});
