// A uPlot chart: thin traces, optional log x axis, two draggable-free cursors drawn as
// dashed vertical lines. Click sets cursor A, Shift+click sets cursor B.
import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { formatValue } from "../netlist/value";

/** Fixed trace colors, assigned by probe order. */
export const TRACE_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#4b5563",
] as const;

export interface PlotSeries {
  label: string;
  values: Float64Array;
  color: string;
}

export interface PlotProps {
  x: Float64Array;
  series: PlotSeries[];
  logX: boolean;
  xLabel: string;
  yLabel: string;
  cursors: { a: number | null; b: number | null };
  onCursor(which: "a" | "b", x: number): void;
  height: number;
}

const toData = (x: Float64Array, series: PlotSeries[]): uPlot.AlignedData => {
  const col = (v: Float64Array) => Array.from(v, (n) => (Number.isFinite(n) ? n : null));
  return [Array.from(x), ...series.map((s) => col(s.values))] as unknown as uPlot.AlignedData;
};

/** Tick labels in engineering notation: 1m, 2.5k. */
const engineering = (_u: uPlot, ticks: number[]) =>
  ticks.map((v) => (Number.isFinite(v) ? formatValue(v, 4) : ""));

const CURSOR_COLORS = { a: "#111827", b: "#6b7280" } as const;

export function Plot(props: PlotProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  // The latest props, read by uPlot hooks created once per chart.
  const latest = useRef(props);
  latest.current = props;

  const structure = JSON.stringify([
    props.series.map((s) => [s.label, s.color]),
    props.logX,
    props.xLabel,
    props.yLabel,
    props.height,
  ]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const { series, logX, xLabel, yLabel, height } = latest.current;
    const grid = { stroke: "#e5e7eb", width: 1 };
    const axisFont = "11px system-ui, sans-serif";
    const opts: uPlot.Options = {
      width: Math.max(el.clientWidth, 100),
      height,
      legend: { show: false },
      // No crosshair: the dashed lines are the A and B cursors only.
      cursor: { x: false, y: false, drag: { x: false, y: false }, points: { show: false } },
      // uPlot's Distr enum is 1 for linear and 3 for logarithmic.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment
      scales: { x: { time: false, distr: logX ? 3 : 1, range: (_u, min, max) => [min, max] } },
      series: [
        {},
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: 1,
          spanGaps: false,
          points: { show: false },
        })),
      ],
      axes: [
        {
          label: xLabel,
          grid,
          values: engineering,
          font: axisFont,
          labelFont: axisFont,
          size: xLabel === "" ? 30 : 40,
          labelSize: xLabel === "" ? 0 : 14,
        },
        {
          label: yLabel,
          grid,
          values: engineering,
          font: axisFont,
          labelFont: axisFont,
          size: 56,
          labelSize: 14,
        },
      ],
      hooks: {
        draw: [
          (u) => {
            const { a, b } = latest.current.cursors;
            const { ctx } = u;
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 1;
            for (const [which, x] of [
              ["a", a],
              ["b", b],
            ] as const) {
              if (x === null || (logX && x <= 0)) continue;
              const px = Math.round(u.valToPos(x, "x", true));
              if (px < u.bbox.left || px > u.bbox.left + u.bbox.width) continue;
              ctx.strokeStyle = CURSOR_COLORS[which];
              ctx.beginPath();
              ctx.moveTo(px, u.bbox.top);
              ctx.lineTo(px, u.bbox.top + u.bbox.height);
              ctx.stroke();
              ctx.fillStyle = CURSOR_COLORS[which];
              ctx.font = "bold 11px system-ui, sans-serif";
              ctx.fillText(which.toUpperCase(), px + 3, u.bbox.top + 11);
            }
            ctx.restore();
          },
        ],
      },
    };
    const u = new uPlot(opts, toData(latest.current.x, series), el);
    chart.current = u;
    const onClick = (e: MouseEvent) => {
      const rect = u.over.getBoundingClientRect();
      const x = u.posToVal(e.clientX - rect.left, "x");
      if (Number.isFinite(x)) latest.current.onCursor(e.shiftKey ? "b" : "a", x);
    };
    u.over.addEventListener("click", onClick);
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0 && w !== u.width) u.setSize({ width: w, height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.over.removeEventListener("click", onClick);
      u.destroy();
      chart.current = null;
    };
  }, [structure]);

  useEffect(() => {
    chart.current?.setData(toData(props.x, props.series));
  }, [props.x, props.series]);

  useEffect(() => {
    chart.current?.redraw(false);
  }, [props.cursors.a, props.cursors.b]);

  return <div ref={host} className="nodal-plot" style={{ width: "100%", height: props.height }} />;
}
