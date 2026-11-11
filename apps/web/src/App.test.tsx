import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { getEngineVersion } from "./engine/client";

vi.mock("./engine/client");

const mocked = vi.mocked(getEngineVersion);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("App", () => {
  it("shows loading while the engine is pending", () => {
    mocked.mockReturnValue(new Promise(() => undefined));
    render(<App />);
    expect(screen.getByTestId("engine-status").textContent).toBe("Loading engine…");
  });

  it("shows the engine version", async () => {
    mocked.mockResolvedValue("0.1.0");
    render(<App />);
    expect((await screen.findByText("Engine 0.1.0")).textContent).toBe("Engine 0.1.0");
  });

  it("shows an error when the engine fails", async () => {
    mocked.mockRejectedValue(new Error("engine worker timed out"));
    render(<App />);
    expect((await screen.findByText(/Engine failed to load/)).textContent).toBe(
      "Engine failed to load: engine worker timed out",
    );
  });
});
