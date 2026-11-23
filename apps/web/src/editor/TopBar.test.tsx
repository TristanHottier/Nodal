import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorProvider } from "./EditorContext";
import { makeStore } from "./testUtils";
import { TopBar } from "./TopBar";

afterEach(cleanup);

function setup(readOnly = false) {
  const store = makeStore();
  render(
    <EditorProvider store={store}>
      <TopBar readOnly={readOnly} />
    </EditorProvider>,
  );
  return store;
}

describe("TopBar", () => {
  it("is_the_banner_with_the_mark_apart_from_the_examples_select", () => {
    setup();
    const banner = screen.getByRole("banner");
    const mark = within(banner).getByRole("img", { name: "Nodal" });
    const examples = within(banner).getByRole("combobox", { name: "Open example" });
    expect(mark.contains(examples)).toBe(false);
    expect(examples.closest("svg")).toBeNull();
    expect(banner.contains(mark)).toBe(true);
  });

  it("keeps_every_project_action_reachable_by_role_and_name", () => {
    setup();
    const group = screen.getByRole("group", { name: "Project" });
    for (const name of ["New", "Open…", "Save as…"]) {
      expect(within(group).getByRole("button", { name })).toBeTruthy();
    }
    expect(within(group).getByRole("combobox", { name: "Open example" })).toBeTruthy();
    expect(screen.getByTestId("open-file")).toBeTruthy();
  });

  it("shows_the_project_name_and_the_theme_select", () => {
    const store = setup();
    act(() => {
      store.getState().setProjectName("My circuit");
    });
    expect(screen.getByTestId("project-name").textContent).toBe("My circuit");
    expect(screen.getByRole("combobox", { name: "Theme" })).toBeTruthy();
  });

  it("shows_only_the_title_before_the_colon_and_keeps_the_full_name_as_tooltip", () => {
    const store = setup();
    act(() => {
      store.getState().setProjectName("Common-emitter amplifier: NPN, divider bias");
    });
    const el = screen.getByTestId("project-name");
    expect(el.textContent).toBe("Common-emitter amplifier");
    expect(el.getAttribute("title")).toBe("Common-emitter amplifier: NPN, divider bias");
  });

  it("read_only_has_the_mark_and_theme_but_no_editing_actions", () => {
    setup(true);
    expect(screen.getByRole("img", { name: "Nodal" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Theme" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Project" })).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Open example" })).toBeNull();
  });
});
