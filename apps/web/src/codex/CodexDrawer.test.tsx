import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorProvider } from "../editor/EditorContext";
import { makeStore } from "../editor/testUtils";
import CodexDrawer from "./CodexDrawer";

vi.mock("./entries", () => ({
  loadEntry: () => Promise.resolve({ html: "<h2>Section</h2><p>Body text.</p>", title: "x" }),
}));

afterEach(cleanup);

function setup(id: string) {
  const store = makeStore();
  store.getState().openCodex(id);
  store.getState().select(["a"]);
  render(
    <EditorProvider store={store}>
      <CodexDrawer id={id} />
    </EditorProvider>,
  );
  return store;
}

describe("CodexDrawer", () => {
  it("is_a_labelled_aside_with_the_entry_title_and_a_full_page_link", async () => {
    setup("diode");
    const drawer = screen.getByRole("complementary", { name: "Codex" });
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(drawer.querySelector("h2")?.textContent).toBe("Diode");
    expect(screen.getByRole("link", { name: "Open full page" }).getAttribute("href")).toBe(
      "#/codex/diode",
    );
    expect(await screen.findByText("Body text.")).toBeTruthy();
  });

  it("shifts_entry_sections_down_to_h3", async () => {
    setup("diode");
    await screen.findByText("Body text.");
    const headings = screen.getAllByRole("heading").map((h) => h.tagName);
    expect(headings[0]).toBe("H2");
    expect(headings.slice(1).every((t) => t === "H3")).toBe(true);
  });

  it("with_no_opener_on_the_page_focus_goes_to_the_top_bar_link_not_the_body", () => {
    const link = document.createElement("a");
    link.className = "nodal-topbar-codex";
    link.href = "#/codex";
    document.body.append(link);
    const store = setup("diode");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(store.getState().codexEntry).toBeNull();
    expect(document.activeElement).toBe(link);
    link.remove();
  });

  it("moves_focus_to_the_close_button_on_open", () => {
    setup("diode");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("esc_closes_it_and_does_not_reach_the_window_shortcuts", () => {
    const store = setup("diode");
    const onWindow = vi.fn();
    window.addEventListener("keydown", onWindow);
    act(() => {
      fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "Escape" });
    });
    window.removeEventListener("keydown", onWindow);
    expect(onWindow).not.toHaveBeenCalled();
    expect(store.getState().codexEntry).toBeNull();
    expect(store.getState().selection).toEqual(["a"]);
  });

  it("the_close_button_closes_it", () => {
    const store = setup("diode");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(store.getState().codexEntry).toBeNull();
  });

  it("the_full_page_link_closes_it_so_back_returns_to_a_plain_editor", () => {
    const store = setup("diode");
    fireEvent.click(screen.getByRole("link", { name: "Open full page" }));
    expect(store.getState().codexEntry).toBeNull();
  });

  it("says_so_for_an_unknown_entry", () => {
    setup("nope");
    expect(screen.getByRole("alert").textContent).toContain("nope");
  });
});
