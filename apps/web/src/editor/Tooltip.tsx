// A CSS-only tooltip: shown on hover and on keyboard focus of the wrapped control, which points to
// it with aria-describedby. The label repeats the control's accessible name; the shortcut is extra.
import { type ReactNode, useEffect, useId, useState } from "react";
import "./Tooltip.css";

export function Tooltip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: string;
  children: (describedBy: string) => ReactNode;
}) {
  const id = `nodal-tip-${useId().replace(/:/g, "")}`;
  // Esc hides the tooltip without moving hover or focus (WCAG 1.4.13); it returns on the next
  // pointer enter or focus. The Esc shortcut itself is handled elsewhere and still runs.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const show = () => {
    setDismissed(false);
  };
  return (
    <span
      className="nodal-tip"
      data-dismissed={dismissed ? "" : undefined}
      onMouseEnter={show}
      onMouseLeave={show}
      onFocus={show}
      onBlur={show}
    >
      {children(id)}
      <span id={id} role="tooltip" className="nodal-tip-pos">
        <span className="nodal-tip-body">
          <span className="nodal-tip-label">{label}</span>
          {shortcut === undefined ? null : <kbd>{shortcut}</kbd>}
        </span>
      </span>
    </span>
  );
}
