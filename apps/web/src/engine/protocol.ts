export type WorkerRequest =
  | { type: "version"; id: number }
  | { type: "run"; id: number; netlist: string; analysisIndex: number };

export type WorkerResponse =
  | { type: "version"; id: number; version: string }
  | { type: "progress"; id: number; fraction: number }
  // `data`'s buffer is transferred, not copied.
  | { type: "result"; id: number; meta: string; data: Float64Array }
  // `error` is the raw value wasm threw (an ErrorInfo JSON string) or a plain string.
  // `fatal` marks a non-string exception (a wasm trap such as `unreachable` after a Rust
  // panic): the wasm instance is no longer trustworthy and the client must replace the worker.
  | { type: "error"; id: number; error: unknown; fatal?: boolean };
