// Place tool: a ghost symbol follows the snapped cursor; a click commits it.
import type { Point } from "@nodal/schema";
import { useMemo, useState } from "react";
import { LABEL_SYMBOL, SYMBOLS } from "../../symbols/catalog";
import type { CanvasToolHandlers } from "../canvas/Canvas";
import { useEditor, useEditorStore } from "../EditorContext";
import { addLabel, addPart } from "../model/edits";
import { nextLabelText } from "../model/naming";

export function usePlaceTool(): { handlers: CanvasToolHandlers; overlay: React.ReactNode } {
  const store = useEditorStore();
  const tool = useEditor((s) => s.tool);
  const doc = useEditor((s) => s.doc);
  const [cursor, setCursor] = useState<Point | null>(null);

  const handlers = useMemo<CanvasToolHandlers>(
    () => ({
      onPointerDown(world) {
        const s = store.getState();
        const t = s.tool;
        if (t.kind !== "place") return;
        setCursor(world);
        const id = s.newId();
        const next =
          t.item === "label"
            ? addLabel(s.doc, id, world, t.rotation)
            : addPart(s.doc, id, t.item, world, t.rotation, t.mirror);
        s.commit(next, [id]);
      },
      onPointerMove(world) {
        setCursor(world);
      },
    }),
    [store],
  );

  let overlay: React.ReactNode = null;
  if (tool.kind === "place" && cursor) {
    const mirror = tool.item !== "label" && tool.mirror;
    overlay = (
      <g
        data-testid="ghost"
        opacity={0.45}
        pointerEvents="none"
        transform={`translate(${String(cursor.x)} ${String(cursor.y)}) rotate(${String(tool.rotation)}) scale(${mirror ? "-1" : "1"} 1)`}
      >
        {tool.item === "label" ? (
          <LABEL_SYMBOL.Body text={nextLabelText(doc)} />
        ) : (
          (() => {
            const Body = SYMBOLS[tool.item].Body;
            return <Body />;
          })()
        )}
      </g>
    );
  }
  return { handlers, overlay };
}
