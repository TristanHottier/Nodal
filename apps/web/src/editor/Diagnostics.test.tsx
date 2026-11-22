import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { emptyDoc, put, putTagged, pt, wire } from "../netlist/testDoc";
import { pinPositions } from "./geometry";
import { Diagnostics } from "./Diagnostics";
import { EditorProvider } from "./EditorContext";
import { makeStore } from "./testUtils";

afterEach(cleanup);

function validDoc() {
  let d = putTagged(emptyDoc(), "vsource", pt(0, 0), { p: "a" }, { params: { dc: "5" } }).doc;
  d = putTagged(d, "resistor", pt(20, 0), { "1": "a" }, { params: { value: "1k" } }).doc;
  d = put(d, "ground", pt(10, 20)).doc;
  const at = (type: string, pin: string) => {
    const part = d.parts.find((p) => p.type === type);
    const found = part && pinPositions(part).find((q) => q.name === pin);
    if (!found) throw new Error("pin missing");
    return found.at;
  };
  const g = at("ground", "gnd");
  d = wire(d, at("vsource", "n"), pt(0, g.y), g);
  return wire(d, at("resistor", "2"), pt(20, g.y), g);
}

describe("Diagnostics", () => {
  it("no_problems", () => {
    render(
      <EditorProvider store={makeStore(validDoc())}>
        <Diagnostics />
      </EditorProvider>,
    );
    expect(screen.getByRole("heading", { name: "Problems" })).toBeTruthy();
    expect(screen.getByText("No problems")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists_and_selects", () => {
    const r = put(emptyDoc(), "resistor", pt(10, 10));
    const store = makeStore(r.doc);
    render(
      <EditorProvider store={store}>
        <Diagnostics />
      </EditorProvider>,
    );
    const rows = within(screen.getByRole("list")).getAllByRole("button");
    expect(rows.length).toBeGreaterThan(0);
    const withItems = rows.find((b) => b.getAttribute("data-severity") !== null);
    expect(withItems).toBeTruthy();
    // Errors come before warnings.
    const sev = rows.map((b) => b.getAttribute("data-severity"));
    const firstWarning = sev.indexOf("warning");
    if (firstWarning >= 0) expect(sev.slice(firstWarning)).not.toContain("error");
    const target = rows.find((b) => /R1|resistor|unconnected|dangling/i.test(b.textContent));
    expect(target).toBeTruthy();
    if (!target) return;
    fireEvent.click(target);
    expect(store.getState().selection).toContain(r.id);
  });
});
