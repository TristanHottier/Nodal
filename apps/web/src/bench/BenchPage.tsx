import { useEffect, useState } from "react";
import { EngineClient } from "../engine/client";
import tran50 from "../../../../validation/perf/tran50.json?raw";
import ac50 from "../../../../validation/perf/ac50.json?raw";
import { runEngineBench, type BenchRow } from "./engineBench";

const CASES = [
  { name: "tran50", netlist: tran50, budgetMs: 1000 },
  { name: "ac50", netlist: ac50, budgetMs: 200 },
];

const fmt = (ms: number | null): string => (ms === null ? "n/a" : ms.toFixed(1));

/** Browser timing harness for the ROADMAP performance budget. Not linked from the app. */
export function BenchPage() {
  const [rows, setRows] = useState<BenchRow[] | undefined>();

  useEffect(() => {
    const client = new EngineClient();
    let cancelled = false;
    void runEngineBench(client, CASES, { repeats: 5, timeoutMs: 30_000 }).then((r) => {
      if (cancelled) return;
      setRows(r);
      document.body.dataset.done = "1";
    });
    return () => {
      cancelled = true;
      client.dispose();
    };
  }, []);

  return (
    <main style={{ fontFamily: "monospace", padding: 16 }}>
      <h1>Nodal engine bench</h1>
      <p>{rows === undefined ? "Running..." : "Done."}</p>
      <table data-testid="bench-results">
        <thead>
          <tr>
            <th>case</th>
            <th>budget ms</th>
            <th>median ms</th>
            <th>samples ms</th>
            <th>status</th>
            <th>detail</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr
              key={r.name}
              data-name={r.name}
              data-status={r.status}
              data-median={r.medianMs === null ? "" : String(r.medianMs)}
            >
              <td>{r.name}</td>
              <td>{r.budgetMs}</td>
              <td>{fmt(r.medianMs)}</td>
              <td>{r.samplesMs.map(fmt).join(" ")}</td>
              <td>{r.status}</td>
              <td>{r.detail ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
