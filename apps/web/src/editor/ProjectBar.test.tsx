import { newProject, serializeProject } from "@nodal/schema";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDoc, put, pt } from "../netlist/testDoc";
import { Editor } from "./Editor";
import { makeStore, type Store } from "./testUtils";

const MSG = "Replace the current project? Export it first if you want to keep it.";
let store: Store;

function setup(withPart: boolean) {
  store = makeStore(withPart ? put(emptyDoc(), "resistor", pt(10, 10)).doc : undefined);
  render(<Editor store={store} />);
}
const input = () => screen.getByTestId("open-file");
const choose = (name: string, text: string) => {
  const f = new File([text], name);
  fireEvent.change(input(), { target: { files: [f] } });
};
const saved = (name: string) => serializeProject(newProject(name, "2026-01-01T00:00:00.000Z"));

const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:x");
beforeEach(() => {
  createObjectURL.mockClear();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProjectBar", () => {
  it("open_asks_before_replacing", async () => {
    setup(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    choose("a.nodal.json", saved("Other"));
    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(MSG);
    });
    expect(store.getState().project.name).toBe("Untitled");
    expect(store.getState().doc.parts).toHaveLength(1);
  });

  it("open_loads_project", async () => {
    setup(true);
    store.getState().setStatusMessage("old");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    choose("a.nodal.json", saved("Other"));
    await waitFor(() => {
      expect(store.getState().project.name).toBe("Other");
    });
    expect(store.getState().doc.parts).toHaveLength(0);
    expect(store.getState().statusMessage).toBeNull();
    expect((input() as HTMLInputElement).value).toBe("");
  });

  it("open_into_empty_does_not_confirm", async () => {
    setup(false);
    const confirm = vi.spyOn(window, "confirm");
    choose("a.nodal.json", saved("Other"));
    await waitFor(() => {
      expect(store.getState().project.name).toBe("Other");
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("open_error_shown", async () => {
    setup(true);
    const confirm = vi.spyOn(window, "confirm");
    choose("bad.nodal.json", "{nope");
    const msg = await screen.findByTestId("project-message");
    expect(msg.textContent).toMatch(/^Could not open bad\.nodal\.json: not valid JSON: /);
    expect(confirm).not.toHaveBeenCalled();
    expect(store.getState().doc.parts).toHaveLength(1);
  });

  it("new_resets", () => {
    setup(true);
    store.getState().setStatusMessage("old");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(confirm).toHaveBeenCalledWith(MSG);
    expect(store.getState().doc.parts).toHaveLength(0);
    expect(store.getState().project.name).toBe("Untitled");
    expect(screen.queryByTestId("project-message")).toBeNull();
  });

  it("new_cancelled_keeps_project", () => {
    setup(true);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(store.getState().doc.parts).toHaveLength(1);
  });

  it("open_button_triggers_file_input", () => {
    setup(false);
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Open…" }));
    expect(click).toHaveBeenCalled();
    expect(input().getAttribute("accept")).toBe(".json,.nodal.json");
  });

  it("save_as_downloads_current_project", () => {
    setup(true);
    store.getState().setProjectName("My Circuit");
    let name = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      name = this.download;
    });
    fireEvent.click(screen.getByRole("button", { name: "Save as…" }));
    expect(name).toBe("My Circuit.nodal.json");
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.size).toBeGreaterThan(0);
  });
  it("models_alone_count_as_content", () => {
    setup(false);
    store.getState().setModels([{ name: "DM", type: "D", params: {} }]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(confirm).toHaveBeenCalledWith(MSG);
    expect(store.getState().project.models).toHaveLength(1);
  });

  it("a_renamed_project_counts_as_content", () => {
    setup(false);
    store.getState().setProjectName("My circuit");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(confirm).toHaveBeenCalledWith(MSG);
    expect(store.getState().project.name).toBe("My circuit");
  });
});
