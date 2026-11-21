import type { NetLabel } from "@nodal/schema";
import { memo } from "react";
import { LABEL_SYMBOL } from "../../symbols/catalog";

export const LabelView = memo(function LabelView({
  label,
  selected,
}: {
  label: NetLabel;
  selected: boolean;
}) {
  const { x0, y0, x1, y1 } = LABEL_SYMBOL.bounds;
  return (
    <g
      data-testid={`label-${label.id}`}
      data-item-id={label.id}
      data-selected={selected ? "true" : undefined}
      className={selected ? "nodal-item selected" : "nodal-item"}
      transform={`translate(${String(label.x)} ${String(label.y)}) rotate(${String(label.rotation)})`}
    >
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="transparent" pointerEvents="all" />
      <LABEL_SYMBOL.Body text={label.text} />
    </g>
  );
});
