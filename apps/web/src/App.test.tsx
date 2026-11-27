import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import * as storeModule from "./editor/store";

const mocked = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock("./engine/client", () => ({
  EngineClient: class {
    version = mocked;
    dispose = vi.fn();
  },
}));

vi.mock("./editor/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("./editor/store")>();
  return { ...original, createEditorStore: vi.fn(original.createEditorStore) };
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
  document.title = "Nodal";
  vi.resetAllMocks();
});

describe("App", () => {
  it("shows loading while the engine is pending", () => {
    mocked.mockReturnValue(new Promise(() => undefined));
    render(<App />);
    expect(screen.getByTestId("engine-status").textContent).toBe("Loading engine…");
  });

  it("shows the engine version", async () => {
    mocked.mockResolvedValue("1.2.0");
    render(<App />);
    expect((await screen.findByText("Engine 1.2.0")).textContent).toBe("Engine 1.2.0");
  });

  it("shows an error when the engine fails", async () => {
    mocked.mockRejectedValue(new Error("engine worker timed out"));
    render(<App />);
    expect((await screen.findByText(/Engine failed to load/)).textContent).toBe(
      "Engine failed to load: engine worker timed out",
    );
  });

  it("switches between the editor and the codex on the hash, keeping one store", async () => {
    mocked.mockResolvedValue("1.2.0");
    render(<App />);
    expect(screen.getByTestId("engine-status")).toBeTruthy();
    expect(document.title).toBe("Nodal");
    const created = vi.mocked(storeModule.createEditorStore).mock.calls.length;

    act(() => {
      window.location.hash = "#/codex/diode";
    });
    expect((await screen.findByRole("heading", { level: 1, name: "Diode" })).textContent).toBe(
      "Diode",
    );
    expect(screen.queryByTestId("engine-status")).toBeNull();
    expect(document.title).toBe("Diode · Codex · Nodal");

    act(() => {
      window.location.hash = "#/";
    });
    expect(await screen.findByTestId("engine-status")).toBeTruthy();
    expect(document.title).toBe("Nodal");
    expect(vi.mocked(storeModule.createEditorStore).mock.calls).toHaveLength(created);
  });

  it("opens a codex deep link on first render", async () => {
    mocked.mockResolvedValue("1.2.0");
    window.location.hash = "#/codex";
    render(<App />);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Codex");
  });

  it("keeps the title right across repeated route changes", async () => {
    mocked.mockResolvedValue("1.2.0");
    render(<App />);
    for (let i = 0; i < 2; i++) {
      act(() => {
        window.location.hash = "#/codex/diode";
      });
      await screen.findByRole("heading", { level: 1, name: "Diode" });
      expect(document.title).toBe("Diode · Codex · Nodal");
      act(() => {
        window.location.hash = "#/";
      });
      await screen.findByTestId("engine-status");
      expect(document.title).toBe("Nodal");
    }
  });

  it("closes the codex drawer when the user goes to the codex page", async () => {
    mocked.mockResolvedValue("1.2.0");
    render(<App />);
    const editor = vi.mocked(storeModule.createEditorStore).mock.results[0]?.value as
      ReturnType<typeof storeModule.createEditorStore> | undefined;
    if (!editor) throw new Error("no editor store");
    act(() => {
      editor.getState().openCodex("diode");
    });
    act(() => {
      window.location.hash = "#/codex/resistor";
    });
    await screen.findByRole("heading", { level: 1, name: "Resistor" });
    expect(editor.getState().codexEntry).toBeNull();
  });
});
