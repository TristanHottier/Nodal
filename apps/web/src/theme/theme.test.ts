import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyThemeChoice, readThemeChoice, THEME_STORAGE_KEY, useResolvedTheme } from "./theme";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  vi.unstubAllGlobals();
});

describe("readThemeChoice", () => {
  it("returns system for a missing or invalid value", () => {
    expect(readThemeChoice({ getItem: () => null })).toBe("system");
    expect(readThemeChoice({ getItem: () => "purple" })).toBe("system");
  });
  it("returns system when storage throws", () => {
    expect(
      readThemeChoice({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe("system");
  });
  it("returns a stored light or dark", () => {
    expect(readThemeChoice({ getItem: () => "dark" })).toBe("dark");
    expect(readThemeChoice({ getItem: () => "light" })).toBe("light");
  });
});

describe("applyThemeChoice", () => {
  it("sets the attribute and stores dark", () => {
    const root = document.createElement("html");
    const setItem = vi.fn();
    applyThemeChoice("dark", root, { setItem, removeItem: vi.fn() });
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.style.getPropertyValue("color-scheme")).toBe("dark");
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "dark");
  });
  it("removes the attribute for system", () => {
    const root = document.createElement("html");
    root.setAttribute("data-theme", "dark");
    root.style.setProperty("color-scheme", "dark");
    const removeItem = vi.fn();
    applyThemeChoice("system", root, { setItem: vi.fn(), removeItem });
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(root.style.getPropertyValue("color-scheme")).toBe("");
    expect(removeItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
  });
  it("ignores storage errors", () => {
    const root = document.createElement("html");
    const boom = () => {
      throw new Error("full");
    };
    expect(() => {
      applyThemeChoice("light", root, { setItem: boom, removeItem: boom });
    }).not.toThrow();
    expect(root.getAttribute("data-theme")).toBe("light");
  });
});

describe("useResolvedTheme", () => {
  it("follows the data-theme attribute", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe("light");
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
      await Promise.resolve();
    });
    expect(result.current).toBe("dark");
  });
  it("follows the OS setting when no attribute is set", () => {
    let listener: () => void = () => {};
    const media = {
      matches: false,
      addEventListener: (_: string, l: () => void) => {
        listener = l;
      },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", () => media);
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe("light");
    act(() => {
      media.matches = true;
      listener();
    });
    expect(result.current).toBe("dark");
  });
});
