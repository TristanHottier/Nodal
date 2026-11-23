import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXAMPLES } from "../../examples";
import { emptyDoc, put, pt } from "../../netlist/testDoc";
import { Editor } from "../Editor";
import { makeStore } from "../testUtils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EmptyState", () => {
  it("is_shown_for_an_empty_project_and_gone_after_placing_a_part", () => {
    const store = makeStore();
    render(<Editor store={store} />);
    expect(screen.getByText("Start from an example")).toBeTruthy();
    expect(screen.getByText("or pick a part from the left")).toBeTruthy();
    act(() => {
      store.getState().commit(put(emptyDoc(), "resistor", pt(10, 10)).doc);
    });
    expect(screen.queryByText("Start from an example")).toBeNull();
  });

  it("loading_an_example_fills_the_canvas", () => {
    const store = makeStore();
    render(<Editor store={store} />);
    const ex = EXAMPLES[0];
    if (!ex) throw new Error("no example");
    fireEvent.click(screen.getByRole("button", { name: ex.title }));
    expect(store.getState().project.name).toBe(ex.load().name);
    expect(store.getState().doc.parts.length).toBeGreaterThan(0);
    expect(screen.queryByText("Start from an example")).toBeNull();
  });

  it("offers_only_the_examples_in_the_read_only_view", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const store = makeStore();
    render(<Editor store={store} />);
    expect(screen.getByText("Start from an example")).toBeTruthy();
    expect(screen.queryByText("or pick a part from the left")).toBeNull();
  });
});
