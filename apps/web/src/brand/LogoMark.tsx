// The Nodal "N": two vertical strokes and a diagonal, a node ring at each outer end.
// The gradient runs cyan (left) to mint (right) through the brand tokens, not the UI accent.
import { useId } from "react";

export interface LogoProps {
  /** Rendered height in CSS px. */
  size?: number;
  /** Hide the mark from assistive technology when the surrounding text already says "Nodal". */
  decorative?: boolean;
}

/** Shapes of the mark on the 32 x 32 grid; `fill` is the gradient URL. */
export function MarkShapes({ paint }: { paint: string }) {
  return (
    <g fill="none" stroke={paint} strokeWidth={2.4}>
      <path d="M5.2 10V22M26.8 10V22" />
      {/* The diagonal is a hollow band: two parallel strokes, open at the free ends. */}
      <path strokeWidth={1.8} d="M8.6 6L23.6 21M8.6 12.3L22.6 26.3" />
      <circle cx={5.2} cy={5.2} r={3.4} />
      <circle cx={26.8} cy={5.2} r={3.4} />
      <circle cx={5.2} cy={26.8} r={3.4} />
      <circle cx={26.8} cy={26.8} r={3.4} />
    </g>
  );
}

/** Gradient stops shared by the mark and the full logo. */
export function BrandGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={32} y2={8}>
      <stop offset="0" stopColor="var(--color-brand-1)" />
      <stop offset="1" stopColor="var(--color-brand-2)" />
    </linearGradient>
  );
}

export function useGradientId(): string {
  return `nodal-brand-${useId().replace(/:/g, "")}`;
}

export function LogoMark({ size = 32, decorative = false }: LogoProps) {
  const gradient = useGradientId();
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": "Nodal" } as const);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      {...a11y}
    >
      <defs>
        <BrandGradient id={gradient} />
      </defs>
      <MarkShapes paint={`url(#${gradient})`} />
    </svg>
  );
}
