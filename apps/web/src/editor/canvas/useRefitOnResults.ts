// Refit the schematic once when the results panel opens and takes space from the canvas.
// One shot per opening: pan and zoom after that are the user's. No per-frame work: the observer
// fires on a size change of the canvas element, which a pan or zoom never causes.
import { type RefObject, useLayoutEffect, useRef } from "react";
import { useHasResult } from "../../simulation/SimulationContext";
import { useEditorStore } from "../EditorContext";
import { refitView } from "./fit";

export function useRefitOnResults(svgRef: RefObject<SVGSVGElement | null>, enabled: boolean): void {
  const store = useEditorStore();
  const open = useHasResult();
  const pending = useRef(false);
  const wasOpen = useRef(open);

  useLayoutEffect(() => {
    if (open && !wasOpen.current && enabled) {
      pending.current = true;
      // The panel's layout lands in the next frame, where the observer reports it. If the canvas
      // does not change size, the request lapses after two frames.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pending.current = false;
        });
      });
    }
    wasOpen.current = open;
  }, [open, enabled]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || !enabled || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!pending.current) return;
      pending.current = false;
      const r = svg.getBoundingClientRect();
      const s = store.getState();
      const next = refitView(s.view, s.doc, { width: r.width, height: r.height });
      if (next !== s.view) s.setView(next);
    });
    ro.observe(svg);
    return () => {
      ro.disconnect();
    };
  }, [svgRef, store, enabled]);
}
