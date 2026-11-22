// The Nodal "N": two vertical strokes and a diagonal, a node ring at each outer end.
// The gradient runs cyan (top left) to mint (bottom right) through the brand tokens, not the UI accent.
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
    <g fill="none" stroke={paint} strokeWidth={3.2} strokeLinecap="butt">
      <path d="M5.2 10V22M26.8 10V22M8.5 8.5L23.5 23.5" />
      <g strokeWidth={2.6}>
        <circle cx={5.2} cy={5.2} r={3.4} />
        <circle cx={26.8} cy={5.2} r={3.4} />
        <circle cx={5.2} cy={26.8} r={3.4} />
        <circle cx={26.8} cy={26.8} r={3.4} />
      </g>
    </g>
  );
}

/** Gradient stops shared by the mark and the full logo. */
export function BrandGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={32} y2={32}>
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
