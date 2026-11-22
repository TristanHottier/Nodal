import "fake-indexeddb/auto";

// uPlot reads matchMedia when it is imported; jsdom has none. Plot itself is mocked per test.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    Object.assign(new EventTarget(), {
      matches: false,
      media: query,
      onchange: null,
    }) as MediaQueryList;
}
