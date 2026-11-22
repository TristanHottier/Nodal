// Theme choice: "system" follows the OS, "light" and "dark" force a theme via data-theme on <html>.
// The inline script in index.html mirrors readThemeChoice and the attribute and color-scheme
// writes so the first paint already uses the stored theme. Keep the two in step.
import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "nodal-theme";

export type ThemeChoice = "system" | "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readThemeChoice(
  storage: Pick<Storage, "getItem"> | undefined = defaultStorage(),
): ThemeChoice {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyThemeChoice(
  choice: ThemeChoice,
  root: HTMLElement = document.documentElement,
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined = defaultStorage(),
): void {
  if (choice === "system") {
    root.removeAttribute("data-theme");
    root.style.removeProperty("color-scheme");
  } else {
    root.setAttribute("data-theme", choice);
    root.style.setProperty("color-scheme", choice);
  }
  try {
    if (choice === "system") storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage may be blocked or full; the choice still applies for this page.
  }
}

function resolve(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = typeof matchMedia === "function" ? matchMedia(DARK_QUERY) : undefined;
  media?.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener("change", onChange);
  };
}

/** The theme in effect: the forced one, or the OS setting for "system". */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, resolve, () => "light");
}
