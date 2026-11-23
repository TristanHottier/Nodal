// A uPlot chart: thin traces, optional log x axis, two cursors drawn as dashed vertical lines.
// Clicks place the cursors (see cursorForClick), a cursor can be dragged, and the focused plot
// takes keys: A or B pick the active cursor, arrows, Home and End move it, Delete clears it.
import { type KeyboardEvent, useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { formatValue } from "../netlist/value";
import { readCssVar } from "../theme/cssVar";
import { useResolvedTheme } from "../theme/theme";
import { type CursorId, cursorForClick, cursorUnderPointer, stepCursor } from "./cursorInput";

export interface PlotSeries {
  label: string;
  values: Float64Array;
  /** A CSS color or a `var(--name)` reference resolved when the chart is built. */
  color: string;
}

export interface PlotProps {
  x: Float64Array;
  series: PlotSeries[];
  logX: boolean;
  xLabel: string;
  yLabel: string;
  cursors: { a: number | null; b: number | null };
  /** The cursor the keyboard moves; drawn with a filled tag. */
  activeCursor: CursorId;
  /** Places or moves a cursor (click, drag, keys). The owner also makes it active. */
  onCursor(which: CursorId, x: number): void;
  onActiveCursor(which: CursorId): void;
  onClearCursor(which: CursorId): void;
  height: number;
}

/** uPlot data: NaN and +-Infinity become null (a gap); a descending x axis is reversed. */
export const toData = (x: Float64Array, series: PlotSeries[]): uPlot.AlignedData => {
  const descending = x.length > 1 && (x[0] as number) > (x[x.length - 1] as number);
  const col = (v: Float64Array) => {
    const out = Array.from(v, (n) => (Number.isFinite(n) ? n : null));
    return descending ? out.reverse() : out;
  };
  const xs = Array.from(x);
  return [
    descending ? xs.reverse() : xs,
    ...series.map((s) => col(s.values)),
  ] as unknown as uPlot.AlignedData;
};

/** The x scale range; a single-point axis (min equals max) gets a visible width. */
export const xRange = (min: number, max: number, logX: boolean): [number, number] => {
  if (min !== max) return [min, max];
  return logX && min > 0 ? [min / 1.1, max * 1.1] : [min - 1, max + 1];
};

/** Canvas geometry of the active cursor tag, in canvas pixels (not CSS). */
const TAG_PAD = 3;
const TAG_HEIGHT = 15;

/** Tick labels in engineering notation: 1m, 2.5k. */
const engineering = (_u: uPlot, ticks: number[]) =>
  ticks.map((v) => (Number.isFinite(v) ? formatValue(v, 4) : ""));

/** Resolves `var(--name)` to the computed token value; other strings pass through. */
const resolveColor = (c: string): string => {
  const m = /^var\((--[\w-]+)\)$/.exec(c);
  return m?.[1] ? readCssVar(m[1]) : c;
};

/** Toggled on the host while the pointer is over a cursor line; the CSS sets the cursor. */
const GRAB_CLASS = "nodal-plot-grab";

export function Plot(props: PlotProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  // The latest props, read by uPlot hooks created once per chart.
  const latest = useRef(props);
  latest.current = props;
  const theme = useResolvedTheme();

  const structure = JSON.stringify([
    props.series.map((s) => [s.label, s.color]),
    props.logX,
    props.xLabel,
    props.yLabel,
    props.height,
    theme,
  ]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const { series, logX, xLabel, yLabel, height } = latest.current;
    const gridColor = readCssVar("--color-plot-grid");
    const textColor = readCssVar("--color-text-muted");
    const tagText = readCssVar("--color-plot-bg");
    const cursorColors = { a: readCssVar("--color-cursor-a"), b: readCssVar("--color-cursor-b") };
    const grid = { stroke: gridColor, width: 1 };
    const axisFont = `${readCssVar("--text-xs")} ${readCssVar("--font-mono")}`;
    const opts: uPlot.Options = {
      width: Math.max(el.clientWidth, 100),
      height,
      legend: { show: false },
      // No crosshair: the dashed lines are the A and B cursors only.
      cursor: { x: false, y: false, drag: { x: false, y: false }, points: { show: false } },
      // uPlot's Distr enum is 1 for linear and 3 for logarithmic.
      scales: {
        x: {
          time: false,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment
          distr: logX ? 3 : 1,
          range: (_u, min, max) => xRange(min, max, logX),
        },
      },
      series: [
        {},
        ...series.map((s) => ({
          label: s.label,
          stroke: resolveColor(s.color),
          width: 1,
          spanGaps: false,
          points: { show: false },
        })),
      ],
      axes: [
        {
          label: xLabel,
          grid,
          stroke: textColor,
          ticks: { stroke: gridColor, width: 1 },
          values: engineering,
          font: axisFont,
          labelFont: axisFont,
          size: xLabel === "" ? 30 : 40,
          labelSize: xLabel === "" ? 0 : 14,
        },
        {
          label: yLabel,
          grid,
          stroke: textColor,
          ticks: { stroke: gridColor, width: 1 },
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
            const active = latest.current.activeCursor;
            for (const [which, x] of [
              ["a", a],
              ["b", b],
            ] as const) {
              if (x === null || (logX && x <= 0)) continue;
              const px = Math.round(u.valToPos(x, "x", true));
              if (px < u.bbox.left || px > u.bbox.left + u.bbox.width) continue;
              ctx.strokeStyle = cursorColors[which];
              ctx.beginPath();
              ctx.moveTo(px, u.bbox.top);
              ctx.lineTo(px, u.bbox.top + u.bbox.height);
              ctx.stroke();
              ctx.font = `bold ${axisFont}`;
              const label = which.toUpperCase();
              ctx.fillStyle = cursorColors[which];
              if (which === active) {
                // A filled tag with the label knocked out, so the active cursor shows without colour.
                const w = ctx.measureText(label).width + TAG_PAD * 2;
                ctx.fillRect(px + 1, u.bbox.top, w, TAG_HEIGHT);
                ctx.fillStyle = tagText;
                ctx.fillText(label, px + 1 + TAG_PAD, u.bbox.top + TAG_HEIGHT - TAG_PAD);
              } else {
                ctx.fillText(label, px + 3, u.bbox.top + 11);
              }
            }
            ctx.restore();
          },
        ],
      },
    };
    const u = new uPlot(opts, toData(latest.current.x, series), el);
    chart.current = u;
    const toPx = (x: number) => u.valToPos(x, "x");
    /** Pointer x in CSS pixels relative to the plot area, clamped to it. */
    const pointerPx = (e: PointerEvent | MouseEvent) => {
      const rect = u.over.getBoundingClientRect();
      return Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    };
    let dragging: CursorId | null = null;
    let swallowClick = false;
    const setGrab = (on: boolean) => {
      el.classList.toggle(GRAB_CLASS, on);
    };
    const onPointerDown = (e: PointerEvent) => {
      // Shift+click always places B, even right next to a cursor.
      if (e.button !== 0 || e.shiftKey) return;
      const hit = cursorUnderPointer(latest.current.cursors, pointerPx(e), toPx);
      if (hit === null) return;
      dragging = hit;
      u.over.setPointerCapture(e.pointerId);
      latest.current.onActiveCursor(hit);
      setGrab(true);
    };
    const onPointerMove = (e: PointerEvent) => {
      const px = pointerPx(e);
      if (dragging !== null) {
        const x = u.posToVal(px, "x");
        if (Number.isFinite(x)) latest.current.onCursor(dragging, x);
        return;
      }
      setGrab(cursorUnderPointer(latest.current.cursors, px, toPx) !== null);
    };
    const endDrag = (e: PointerEvent) => {
      if (dragging === null) return;
      dragging = null;
      if (u.over.hasPointerCapture(e.pointerId)) u.over.releasePointerCapture(e.pointerId);
      // The click that follows pointerup must not also place a cursor.
      swallowClick = true;
      setTimeout(() => {
        swallowClick = false;
      }, 0);
    };
    const onPointerLeave = () => {
      if (dragging === null) setGrab(false);
    };
    const onClick = (e: MouseEvent) => {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      const px = pointerPx(e);
      const x = u.posToVal(px, "x");
      if (!Number.isFinite(x)) return;
      latest.current.onCursor(cursorForClick(latest.current.cursors, px, toPx, e.shiftKey), x);
    };
    u.over.addEventListener("pointerdown", onPointerDown);
    u.over.addEventListener("pointermove", onPointerMove);
    u.over.addEventListener("pointerup", endDrag);
    u.over.addEventListener("pointercancel", endDrag);
    u.over.addEventListener("pointerleave", onPointerLeave);
    u.over.addEventListener("click", onClick);
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0 && w !== u.width) u.setSize({ width: w, height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.over.removeEventListener("pointerdown", onPointerDown);
      u.over.removeEventListener("pointermove", onPointerMove);
      u.over.removeEventListener("pointerup", endDrag);
      u.over.removeEventListener("pointercancel", endDrag);
      u.over.removeEventListener("pointerleave", onPointerLeave);
      u.over.removeEventListener("click", onClick);
      el.classList.remove(GRAB_CLASS);
      u.destroy();
      chart.current = null;
    };
  }, [structure]);

  useEffect(() => {
    chart.current?.setData(toData(props.x, props.series));
  }, [props.x, props.series]);

  useEffect(() => {
    chart.current?.redraw(false);
  }, [props.cursors.a, props.cursors.b, props.activeCursor]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const { x, cursors, activeCursor: active } = props;
    const move = (to: number) => {
      props.onCursor(active, to);
    };
    const key = e.key.toLowerCase();
    if (key === "a" || key === "b") props.onActiveCursor(key);
    else if (key === "arrowleft" || key === "arrowright") {
      move(stepCursor(x, cursors[active], key === "arrowright" ? 1 : -1));
    } else if (key === "home" || key === "end") {
      // The axis is monotone, so its ends are the first and last samples.
      const ends = [x[0], x[x.length - 1]].filter((v): v is number => v !== undefined);
      if (ends.length === 0) return;
      move(key === "home" ? Math.min(...ends) : Math.max(...ends));
    } else if (key === "delete" || key === "backspace") props.onClearCursor(active);
    else return;
    // Handled: keep it from the page and from the editor's window-level shortcuts.
    e.preventDefault();
    e.stopPropagation();
  };

  // The axis labels are drawn on the canvas; the attributes make them readable to tests.
  return (
    <div
      ref={host}
      className="nodal-plot"
      data-testid="plot"
      role="group"
      tabIndex={0}
      aria-label={`${props.yLabel} plot. Keys: A or B picks a cursor, left and right arrows move it, Home and End jump to the ends, Delete clears it.`}
      onKeyDown={onKeyDown}
      data-x-label={props.xLabel}
      data-y-label={props.yLabel}
      style={{ width: "100%", height: props.height }}
    />
  );
}
