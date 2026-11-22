import "fake-indexeddb/auto";

// uPlot reads matchMedia when it is imported; jsdom has none. Plot itself is mocked per test.
// `(min-width: …)` queries match, as in a desktop window, so the editor renders in tests;
// every other query (prefers-color-scheme, ...) does not.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    Object.assign(new EventTarget(), {
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
    }) as MediaQueryList;
}
