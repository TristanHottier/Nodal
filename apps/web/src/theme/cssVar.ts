// Resolves a CSS custom property to its computed value, for canvas drawing that cannot use var().
export function readCssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
