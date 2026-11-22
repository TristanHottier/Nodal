// Operating-point voltages drawn next to their nets, in grid units like the rest of the world group.
import { useMemo } from "react";
import { useOpView } from "../../simulation/SimulationContext";
import { opTags } from "../../simulation/opTags";
import { useEditor } from "../EditorContext";

export function OpOverlay() {
  const view = useOpView();
  const doc = useEditor((s) => s.doc);
  const tags = useMemo(() => {
    if (!view) return [];
    // Anchors come from the current document, so a tag follows its net when the schematic is edited.
    return opTags(view.result, view.map, doc);
  }, [view, doc]);
  if (!view || tags.length === 0) return null;
  return (
    <g className="nodal-op-tags" style={{ opacity: view.stale ? 0.5 : 1 }} pointerEvents="none">
      {tags.map((t) => (
        <text
          key={t.net}
          className="nodal-op-tag"
          data-testid={`op-tag-${t.net}`}
          x={t.at.x + 0.3}
          y={t.at.y - 0.3}
          fontSize={0.7}
          paintOrder="stroke"
          strokeLinejoin="round"
        >
          {t.text}
        </text>
      ))}
    </g>
  );
}
