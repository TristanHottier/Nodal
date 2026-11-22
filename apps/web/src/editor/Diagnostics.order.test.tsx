// Row order and id filtering, with a controlled diagnostics list.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "../netlist/diagnostics";
import { emptyDoc, put, pt } from "../netlist/testDoc";
import { Diagnostics } from "./Diagnostics";
import { EditorProvider } from "./EditorContext";
import { makeStore } from "./testUtils";

const list: Diagnostic[] = [];
vi.mock("./useDiagnostics", () => ({ useDiagnostics: () => list }));

afterEach(cleanup);

describe("Diagnostics ordering", () => {
  it("errors_first_and_missing_ids_dropped", () => {
    const r = put(emptyDoc(), "resistor", pt(10, 10));
    list.splice(
      0,
      list.length,
      { severity: "warning", code: "dangling-pin", message: "warn one", itemIds: [r.id] },
      { severity: "error", code: "bad-name", message: "err one", itemIds: [r.id, "gone"] },
      { severity: "warning", code: "dangling-pin", message: "warn two", itemIds: [] },
    );
    const store = makeStore(r.doc);
    render(
      <EditorProvider store={store}>
        <Diagnostics />
      </EditorProvider>,
    );
    const rows = within(screen.getByRole("list")).getAllByRole("button");
    expect(rows.map((b) => b.getAttribute("data-severity"))).toEqual([
      "error",
      "warning",
      "warning",
    ]);
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["✖err one", "⚠warn one", "⚠warn two"]);
    fireEvent.click(screen.getByRole("button", { name: "err one" }));
    expect(store.getState().selection).toEqual([r.id]);
  });
});
