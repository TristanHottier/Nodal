export type WorkerRequest = { type: "version" };

export type WorkerResponse =
  { type: "version"; version: string } | { type: "error"; message: string };
