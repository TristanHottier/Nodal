// Test helpers: a divider project and a fake engine runner whose runs the test settles.
import type { Project } from "@nodal/schema";
import { CancelledError, type EngineRunner } from "../engine/client";
import type { SimResult } from "../engine/results";
import { emptyDoc, label, project, pt, put, wire } from "../netlist/testDoc";

/** 10 V source into a 1k/3k divider with nets "in" and "out"; ready to simulate. */
export function dividerProject(): Project {
  let d = put(emptyDoc(), "vsource", pt(0, 0), { id: "v1", params: { dc: "10" } }).doc;
  d = put(d, "resistor", pt(7, -3), { id: "r1", rotation: 270, params: { value: "1k" } }).doc;
  d = put(d, "resistor", pt(10, 3), { id: "r2", params: { value: "3k" } }).doc;
  d = put(d, "ground", pt(0, 6), { id: "g1" }).doc;
  d = wire(d, pt(0, -3), pt(4, -3));
  d = wire(d, pt(10, -3), pt(10, 0));
  d = wire(d, pt(0, 3), pt(0, 6));
  d = wire(d, pt(10, 6), pt(0, 6));
  d = label(d, pt(2, -3), "in");
  d = label(d, pt(10, -1), "out");
  return project(d);
}

export const opResult = (names: string[] = ["a"]): SimResult => ({
  type: "op",
  axis: new Float64Array(0),
  signals: names.map((name) => ({ name, kind: "v" as const, re: new Float64Array([1]) })),
});

export const tranResult = (names: string[] = ["a"]): SimResult => ({
  type: "tran",
  axis: new Float64Array([0, 1]),
  signals: names.map((name) => ({ name, kind: "v" as const, re: new Float64Array([0, 1]) })),
});

export interface Call {
  index: number;
  netlist: string;
  progress: (f: number) => void;
  resolve: (r: SimResult) => void;
  reject: (e: Error) => void;
}

export function fakeRunner(): EngineRunner & { calls: Call[]; cancelled: number } {
  const calls: Call[] = [];
  const runner = {
    calls,
    cancelled: 0,
    run(netlist: string, index: number, opts?: { onProgress?: (f: number) => void }) {
      return new Promise<SimResult>((resolve, reject) => {
        calls.push({
          index,
          netlist,
          progress: opts?.onProgress ?? (() => undefined),
          resolve,
          reject,
        });
      });
    },
    cancel() {
      runner.cancelled += 1;
      for (const c of calls) c.reject(new CancelledError());
    },
  };
  return runner;
}
