import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./engine/client", () => ({
  EngineClient: class {
    version = () => Promise.resolve("1.2.0");
    dispose = vi.fn();
  },
}));

vi.mock("./codex/CodexPage", () => {
  throw new Error("chunk failed");
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("App when the codex chunk fails to load", () => {
  it("says so and links back to the editor", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.location.hash = "#/codex";
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Codex failed to load");
    expect(screen.getByRole("link", { name: "Back to the editor" }).getAttribute("href")).toBe(
      "#/",
    );
  });
});
