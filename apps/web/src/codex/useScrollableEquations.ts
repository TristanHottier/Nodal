// Display maths scrolls sideways in a narrow container (`overflow-x: auto`). A scroll container
// that cannot take focus fails WCAG 2.1.1 (axe `scrollable-region-focusable`), so each equation
// that actually overflows becomes a focusable, labelled group; the attributes come off again when
// it fits.
import { useEffect, type RefObject } from "react";

const LABEL = "Equation, scrolls sideways";

function sync(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>(".katex-display")) {
    if (el.scrollWidth > el.clientWidth) {
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", LABEL);
    } else {
      el.removeAttribute("tabindex");
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
    }
  }
}

/** `html` is a dependency so the check reruns after the rendered entry changes. */
export function useScrollableEquations(ref: RefObject<HTMLElement | null>, html: string): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    sync(root);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      sync(root);
    });
    ro.observe(root);
    // Late font loading can resize an equation without resizing the entry.
    for (const el of root.querySelectorAll(".katex-display")) ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [ref, html]);
}
