// Fit the circuit into the canvas once per loaded project (an example, an opened file, a restored
// autosave) and once when the editor first mounts with a document. The memory of what was fitted lives in the
// editor store, so a remount of the canvas never fits again. A circuit that already fits keeps
// its view, the zoom never rises above its current value (refitView), and a pan or zoom made
// afterwards is never touched: the fit is spent as soon as it ran.
import { type RefObject, useLayoutEffect } from "react";
import { useEditorStore } from "../EditorContext";
import { contentBox, refitView } from "./fit";

export function useFitOnLoad(svgRef: RefObject<SVGSVGElement | null>): void {
  const store = useEditorStore();
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const s = store.getState();
      // The fitted generation is in the store: the canvas remounts when the window crosses 1024 px.
      if (s.fittedGeneration === s.projectGeneration) return;
      const r = svg.getBoundingClientRect();
      // Wait for a measured canvas; an empty document has nothing to fit and spends the turn.
      if (r.width <= 0 || r.height <= 0) return;
      s.setFittedGeneration(s.projectGeneration);
      if (contentBox(s.doc) === null) return;
      const next = refitView(s.view, s.doc, { width: r.width, height: r.height });
      if (next !== s.view) s.setView(next);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(svg);
    // A project loaded after the canvas was measured has no resize to wait for.
    const off = store.subscribe(fit);
    return () => {
      ro.disconnect();
      off();
    };
  }, [svgRef, store]);
}
