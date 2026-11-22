export type WorkerRequest =
  | { type: "version"; id: number }
  | { type: "run"; id: number; netlist: string; analysisIndex: number };

export type WorkerResponse =
  | { type: "version"; id: number; version: string }
  | { type: "progress"; id: number; fraction: number }
  // `data`'s buffer is transferred, not copied.
  | { type: "result"; id: number; meta: string; data: Float64Array }
  // `error` is the raw value wasm threw (an ErrorInfo JSON string) or a plain string.
  | { type: "error"; id: number; error: unknown };
