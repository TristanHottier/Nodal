// Tracks whether the window is at least `px` wide, through matchMedia.
import { useSyncExternalStore } from "react";

/** Narrowest window the editor supports; below it the schematic is read-only. */
export const EDITOR_MIN_WIDTH = 1024;

/** `true` when the window is at least `px` wide, or when `matchMedia` is missing (jsdom). */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${String(px)}px)`;
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => {
        mql.removeEventListener("change", notify);
      };
    },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : true),
  );
}
