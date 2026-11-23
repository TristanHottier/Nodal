// A CSS-only tooltip: shown on hover and on keyboard focus of the wrapped control, which points to
// it with aria-describedby. The label repeats the control's accessible name; the shortcut is extra.
import { type ReactNode, useId } from "react";
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
  return (
    <span className="nodal-tip">
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
