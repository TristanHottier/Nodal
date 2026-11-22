import { useCallback, useEffect, useRef, useState } from "react";
import { EngineClient } from "../engine/client";
import tran50 from "../../../../validation/perf/tran50.json?raw";
import ac50 from "../../../../validation/perf/ac50.json?raw";
import { Editor } from "../editor/Editor";
import { createEditorStore } from "../editor/store";
import { bigProject } from "./bigProject";
import { editorFramesPass, MAX_SLOW_FRACTION, runPanZoom } from "./editorBench";
import { runEngineBench, type BenchRow } from "./engineBench";
import "./BenchPage.css";

const CASES = [
  { name: "tran50", netlist: tran50, budgetMs: 1000 },
  { name: "ac50", netlist: ac50, budgetMs: 200 },
];

const FRAMES = 120;
const EDITOR_ROW = "editor pan/zoom (500 parts)";
/** Frame time at the 58 fps floor of the pass rule. */
const EDITOR_BUDGET_MS = 17.2;

const fmt = (ms: number | null): string => (ms === null ? "n/a" : ms.toFixed(1));

/** Mounts the editor with 500 parts, pans then zooms with real DOM events, reports one row. */
function EditorBench({ onRow }: { onRow: (row: BenchRow) => void }) {
  const [store] = useState(() => {
    const s = createEditorStore();
    s.getState().loadProject(bigProject());
    return s;
  });
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const live = { cancelled: false };
    void (async () => {
      const row: BenchRow = {
        name: EDITOR_ROW,
        budgetMs: EDITOR_BUDGET_MS,
        samplesMs: [],
        medianMs: null,
        status: "error",
      };
      try {
        const svg = host.current?.querySelector("svg[data-testid=schematic-canvas]");
        if (!(svg instanceof SVGSVGElement)) throw new Error("canvas not found");
        // Let the first render settle before timing.
        await new Promise((r) => setTimeout(r, 500));
        const [pan, zoom] = await runPanZoom(svg, FRAMES, () => store.getState().view);
        if (!pan || !zoom) throw new Error("no frame stats");
        const total = {
          fps: (2 * FRAMES) / (FRAMES / pan.fps + FRAMES / zoom.fps),
          slowFrames: pan.slowFrames + zoom.slowFrames,
        };
        row.samplesMs = [1000 / pan.fps, 1000 / zoom.fps];
        row.medianMs = 1000 / total.fps;
        row.fps = total.fps;
        row.slowFrames = total.slowFrames;
        row.status = editorFramesPass(total, 2 * FRAMES) ? "pass" : "fail";
        row.detail = `fps ${total.fps.toFixed(1)} (pan ${pan.fps.toFixed(1)}, zoom ${zoom.fps.toFixed(1)}), slow frames ${String(total.slowFrames)} of ${String(2 * FRAMES)} (limit ${String(MAX_SLOW_FRACTION * 2 * FRAMES)})`;
      } catch (e) {
        row.detail = e instanceof Error ? e.message : String(e);
      }
      if (!live.cancelled) onRow(row);
    })();
    return () => {
      live.cancelled = true;
    };
  }, [onRow, store]);

  return (
    <div ref={host} className="nodal-bench-editor">
      <Editor store={store} />
    </div>
  );
}

/** Browser timing harness for the ROADMAP performance budget. Not linked from the app. */
export function BenchPage() {
  const [rows, setRows] = useState<BenchRow[] | undefined>();
  const [editorRow, setEditorRow] = useState<BenchRow | undefined>();
  const onEditorRow = useCallback((r: BenchRow) => {
    setEditorRow(r);
    document.body.dataset.done = "1";
  }, []);

  useEffect(() => {
    const client = new EngineClient();
    let cancelled = false;
    void runEngineBench(client, CASES, { repeats: 5, timeoutMs: 30_000 }).then((r) => {
      if (cancelled) return;
      setRows(r);
    });
    return () => {
      cancelled = true;
      client.dispose();
    };
  }, []);

  return (
    <main className="nodal-bench">
      <h1>Nodal engine bench</h1>
      <p>{editorRow === undefined ? "Running..." : "Done."}</p>
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
          {[...(rows ?? []), ...(editorRow ? [editorRow] : [])].map((r) => (
            <tr
              key={r.name}
              data-name={r.name}
              data-status={r.status}
              data-median={r.medianMs === null ? "" : String(r.medianMs)}
              {...(r.fps === undefined ? {} : { "data-fps": String(r.fps) })}
              {...(r.slowFrames === undefined ? {} : { "data-slow-frames": String(r.slowFrames) })}
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
      {rows !== undefined && editorRow === undefined && <EditorBench onRow={onEditorRow} />}
    </main>
  );
}
