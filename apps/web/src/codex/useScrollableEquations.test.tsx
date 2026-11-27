import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScrollableEquations } from "./useScrollableEquations";

let observers: FakeResizeObserver[] = [];
class FakeResizeObserver {
  disconnected = false;
  constructor(private readonly cb: () => void) {
    observers.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.cb();
  }
}

function Host({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollableEquations(ref, html);
  return <div ref={ref} data-testid="host" dangerouslySetInnerHTML={{ __html: html }} />;
}

function must<T>(v: T | null | undefined): T {
  if (v == null) throw new Error("missing element");
  return v;
}

const sizes = new Map<string, [number, number]>();
function setSizes(el: Element, scrollWidth: number, clientWidth: number) {
  sizes.set(el.id, [scrollWidth, clientWidth]);
}
Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
  configurable: true,
  get(this: HTMLElement) {
    return sizes.get(this.id)?.[0] ?? 0;
  },
});
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get(this: HTMLElement) {
    return sizes.get(this.id)?.[1] ?? 0;
  },
});

const HTML =
  '<span class="katex-display" id="a">a</span><span class="katex-display" id="b">b</span>';

afterEach(() => {
  cleanup();
  observers = [];
  sizes.clear();
  vi.unstubAllGlobals();
});

describe("useScrollableEquations", () => {
  it("makes only overflowing display equations focusable, and reverts on resize", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    sizes.set("a", [300, 100]);
    sizes.set("b", [50, 100]);
    const { container } = render(<Host html={HTML} />);
    const a = must(container.querySelector("#a"));
    const b = must(container.querySelector("#b"));

    expect(a.getAttribute("tabindex")).toBe("0");
    expect(a.getAttribute("role")).toBe("group");
    expect(a.getAttribute("aria-label")).toBe("Equation, scrolls sideways");
    expect(b.hasAttribute("tabindex")).toBe(false);
    expect(b.hasAttribute("role")).toBe(false);
    expect(b.hasAttribute("aria-label")).toBe(false);

    setSizes(a, 100, 100);
    setSizes(b, 400, 100);
    must(observers.at(-1)).fire();
    expect(a.hasAttribute("tabindex")).toBe(false);
    expect(a.hasAttribute("role")).toBe(false);
    expect(a.hasAttribute("aria-label")).toBe(false);
    expect(b.getAttribute("tabindex")).toBe("0");
  });

  it("disconnects the observer on unmount", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const { unmount } = render(<Host html={HTML} />);
    unmount();
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });
});
