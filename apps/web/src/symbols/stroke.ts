/**
 * Shared SVG props for outline strokes drawn in grid units. `vector-effect` is
 * not inherited in SVG, so the `nodal-symbol` class carries it: a stylesheet
 * rule (see Editor.tsx) applies it to every shape under the class.
 */
export const STROKE = {
  className: "nodal-symbol",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
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
