import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import { makeStore } from "./testUtils";

vi.mock("../codex/CodexDrawer", () => {
  throw new Error("chunk failed");
});

afterEach(cleanup);

describe("Editor when the codex chunk fails to load", () => {
  it("closes_the_drawer_and_says_so_in_the_status_bar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = makeStore();
    render(<Editor store={store} />);
    act(() => {
      store.getState().openCodex("diode");
    });
    await vi.waitFor(() => {
      expect(store.getState().codexEntry).toBeNull();
    });
    expect(store.getState().statusMessage).toBe("Codex failed to load");
    expect(await screen.findByTestId("project-message")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeTruthy();
  });
});
