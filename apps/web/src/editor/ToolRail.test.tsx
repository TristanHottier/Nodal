import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorProvider } from "./EditorContext";
import { makeStore } from "./testUtils";
import { ToolRail } from "./ToolRail";

afterEach(cleanup);

function setup() {
  const store = makeStore();
  render(
    <EditorProvider store={store}>
      <ToolRail />
    </EditorProvider>,
  );
  return store;
}

const TOOLS = [
  { name: "Select", shortcut: "Esc", kind: "select" },
  { name: "Wire", shortcut: "W", kind: "wire" },
  { name: "Probe", shortcut: "P", kind: "probe" },
] as const;

describe("ToolRail", () => {
  it("is_a_vertical_toolbar", () => {
    setup();
    const bar = screen.getByRole("toolbar", { name: "Tools" });
    expect(bar.getAttribute("aria-orientation")).toBe("vertical");
    expect(within(bar).getAllByRole("button")).toHaveLength(TOOLS.length);
  });

  it.each(TOOLS)("$name: accessible name equals the tooltip text, with its shortcut", (t) => {
    setup();
    const button = screen.getByRole("button", { name: t.name });
    const tip = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(tip?.getAttribute("role")).toBe("tooltip");
    expect(tip?.querySelector(".nodal-tip-label")?.textContent).toBe(t.name);
    expect(tip?.querySelector("kbd")?.textContent).toBe(t.shortcut);
  });

  it("aria_pressed_follows_the_tool", () => {
    const store = setup();
    const pressed = () =>
      TOOLS.map((t) => screen.getByRole("button", { name: t.name }).getAttribute("aria-pressed"));
    expect(pressed()).toEqual(["true", "false", "false"]);
    fireEvent.click(screen.getByRole("button", { name: "Wire" }));
    expect(store.getState().tool.kind).toBe("wire");
    expect(pressed()).toEqual(["false", "true", "false"]);
    act(() => {
      store.getState().setTool({ kind: "probe" });
    });
    expect(pressed()).toEqual(["false", "false", "true"]);
  });

  it("roving_focus_one_tab_stop_and_arrow_keys", () => {
    setup();
    const [select, wire, probe] = TOOLS.map((t) => screen.getByRole("button", { name: t.name }));
    expect([select, wire, probe].map((b) => b?.tabIndex)).toEqual([0, -1, -1]);
    select?.focus();
    fireEvent.keyDown(select as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(wire);
    expect([select, wire, probe].map((b) => b?.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(wire as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(probe);
    fireEvent.keyDown(probe as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(select);
    fireEvent.keyDown(select as HTMLElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(probe);
    fireEvent.keyDown(probe as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(select);
  });
});
