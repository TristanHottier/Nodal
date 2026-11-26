// The part symbol on a codex entry: the drawing plus a name and a dot at every pin.
import type { PartType } from "@nodal/schema";
import { LABEL_SYMBOL, SYMBOLS } from "../symbols/catalog";
import type { SymbolBounds, SymbolPin } from "../symbols/types";

/** SVG user units (grid units). Unitless on purpose: the figure scales as one drawing. */
const LABEL_SIZE = 0.62;
const LABEL_GAP = 0.3;
const DOT_RADIUS = 0.13;
/** Advance of one mono glyph as a share of the font size (JetBrains Mono: 0.6). */
const GLYPH_WIDTH = 0.62;
const MARGIN = 0.4;

export interface PinLabel {
  name: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  /** Pin end, where the dot sits. */
  px: number;
  py: number;
}

/** Places each name beside its pin end, away from the body centre along the dominant axis. */
export function pinLabelLayout(bounds: SymbolBounds, pins: readonly SymbolPin[]): PinLabel[] {
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;
  return pins.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const base = { name: p.name, px: p.x, py: p.y };
    if (Math.abs(dx) >= Math.abs(dy)) {
      const left = dx < 0;
      return {
        ...base,
        x: p.x + (left ? -LABEL_GAP : LABEL_GAP),
        y: p.y,
        anchor: left ? ("end" as const) : ("start" as const),
      };
    }
    const up = dy < 0;
    return {
      ...base,
      x: p.x,
      y: p.y + (up ? -LABEL_GAP : LABEL_GAP + LABEL_SIZE * 0.7),
      anchor: "middle" as const,
    };
  });
}

function viewBoxFor(bounds: SymbolBounds, labels: readonly PinLabel[]) {
  let { x0, y0, x1, y1 } = bounds;
  x0 -= 0.5;
  y0 -= 0.5;
  x1 += 0.5;
  y1 += 0.5;
  for (const l of labels) {
    const w = l.name.length * LABEL_SIZE * GLYPH_WIDTH;
    if (l.anchor === "end") x0 = Math.min(x0, l.x - w - MARGIN);
    else if (l.anchor === "start") x1 = Math.max(x1, l.x + w + MARGIN);
    else {
      x0 = Math.min(x0, l.x - w / 2 - MARGIN);
      x1 = Math.max(x1, l.x + w / 2 + MARGIN);
      y0 = Math.min(y0, l.y - LABEL_SIZE - MARGIN);
      y1 = Math.max(y1, l.y + MARGIN);
    }
    y0 = Math.min(y0, l.y - LABEL_SIZE - MARGIN);
    y1 = Math.max(y1, l.y + MARGIN);
  }
  return {
    box: `${String(x0)} ${String(y0)} ${String(x1 - x0)} ${String(y1 - y0)}`,
    w: x1 - x0,
    h: y1 - y0,
  };
}

export function SymbolFigure({ item }: { item: PartType | "label" }) {
  const def = item === "label" ? LABEL_SYMBOL : SYMBOLS[item];
  const Body = def.Body;
  const labels = pinLabelLayout(def.bounds, def.pins);
  const vb = viewBoxFor(def.bounds, labels);
  const pins = def.pins.map((p) => p.name).join(", ");
  return (
    <figure className="nodal-codex-symbol">
      <svg
        role="img"
        aria-label={`${def.label} symbol. Pins: ${pins}.`}
        viewBox={vb.box}
        // One scale for every symbol: size = span in grid units x the token (px, in tokens.css).
        style={{
          width: `calc(var(--codex-grid-scale) * ${String(vb.w)})`,
          aspectRatio: `${String(vb.w)} / ${String(vb.h)}`,
        }}
      >
        <Body />
        <g className="nodal-codex-pins" aria-hidden="true">
          {labels.map((l) => (
            <g key={l.name}>
              <circle data-pin-dot cx={l.px} cy={l.py} r={DOT_RADIUS} fill="currentColor" />
              <text
                x={l.x}
                y={l.y}
                textAnchor={l.anchor}
                dominantBaseline={l.anchor === "middle" ? "auto" : "central"}
                fontSize={LABEL_SIZE}
                fill="currentColor"
                className="nodal-num"
              >
                {l.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <figcaption>
        Pins:{" "}
        {def.pins.map((p, i) => (
          <span key={p.name}>
            {i > 0 ? ", " : ""}
            <span className="nodal-num">{p.name}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
