import { EMPTY_SCHEMATIC, type Part, type Schematic } from "@nodal/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "../Editor";
import { makeStore, type Store } from "../testUtils";

const npn: Part = {
  id: "p1",
  type: "npn",
  name: "Q1",
  x: 0,
  y: 0,
  rotation: 0,
  mirror: false,
  params: {},
};

function setup(parts: Part[], selected: string[], labels: Schematic["labels"] = []): Store {
  const store = makeStore({ ...EMPTY_SCHEMATIC, parts, labels });
  store.getState().select(selected);
  render(<Editor store={store} />);
  return store;
}

afterEach(cleanup);

describe("Inspector codex buttons", () => {
  it("about_this_part_opens_the_codex_entry_without_changing_selection", () => {
    const store = setup([npn], ["p1"]);
    fireEvent.click(screen.getByRole("button", { name: "About this part" }));
    expect(store.getState().codexEntry).toBe("npn");
    expect(store.getState().selection).toEqual(["p1"]);
  });

  it("about_this_analysis_opens_the_entry_for_the_analysis_type", () => {
    const store = setup([], []);
    fireEvent.click(screen.getByRole("button", { name: "About this analysis" }));
    expect(store.getState().codexEntry).toBe("operating-point");
  });

  it("about_this_label_opens_the_label_entry", () => {
    const store = setup([], ["l1"], [{ id: "l1", text: "OUT", x: 0, y: 0, rotation: 0 }]);
    fireEvent.click(screen.getByRole("button", { name: "About this label" }));
    expect(store.getState().codexEntry).toBe("label");
    expect(store.getState().selection).toEqual(["l1"]);
  });
});
