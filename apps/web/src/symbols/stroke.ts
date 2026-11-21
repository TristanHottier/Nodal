/** Shared SVG props for outline strokes drawn in grid units. */
export const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  vectorEffect: "non-scaling-stroke",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Shared SVG props for small text drawn in grid units. */
export const TEXT = {
  fill: "currentColor",
  fontSize: 1.2,
  textAnchor: "middle",
  dominantBaseline: "central",
} as const;
