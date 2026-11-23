// Refit the schematic once for each new result: the results panel opens or changes kind (an operating
// point table is short, a plot is tall) and takes space from the canvas. One shot per result: pan and zoom after that are the user's. No per-frame work: the observer
// fires on a size change of the canvas element, which a pan or zoom never causes.
import { type RefObject, useLayoutEffect, useRef } from "react";
import { useResultObject } from "../../simulation/SimulationContext";
import { useEditorStore } from "../EditorContext";
import { refitView } from "./fit";

export function useRefitOnResults(svgRef: RefObject<SVGSVGElement | null>, enabled: boolean): void {
  const store = useEditorStore();
  const result = useResultObject();
  const pending = useRef(false);
  const lastResult = useRef(result);

  useLayoutEffect(() => {
    if (result !== null && result !== lastResult.current && enabled) {
      pending.current = true;
      // The panel's layout lands in the next frame, where the observer reports it. If the canvas
      // does not change size, the request lapses after two frames.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pending.current = false;
        });
      });
    }
    lastResult.current = result;
  }, [result, enabled]);

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
