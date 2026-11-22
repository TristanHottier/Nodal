import { EMPTY_SCHEMATIC, type Part, type PartType, type Schematic } from "@nodal/schema";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createSimulationStore } from "../../simulation/store";
import { fakeRunner } from "../../simulation/testFixtures";
import { Editor } from "../Editor";
import { makeStore, type Store, undo } from "../testUtils";

function part(id: string, type: PartType, name: string, params: Record<string, string> = {}): Part {
  return { id, type, name, x: 0, y: 0, rotation: 0, mirror: false, params };
}

function setup(parts: Part[], selected: string[], labels: Schematic["labels"] = []): Store {
  const store = makeStore({ ...EMPTY_SCHEMATIC, parts, labels });
  store.getState().select(selected);
  render(<Editor store={store} />);
  return store;
}

/** A part placed away from the others so its pins stay unconnected. */
const far = (id: string, type: PartType, name: string): Part => ({
  ...part(id, type, name),
  x: 50,
  y: 50,
});

afterEach(cleanup);

const input = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });
const select = (name: string) => screen.getByRole<HTMLSelectElement>("combobox", { name });
const params = (store: Store, id = "p1") =>
  store.getState().doc.parts.find((p) => p.id === id)?.params ?? {};

function type(name: string, text: string): HTMLInputElement {
  const el = input(name);
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value: text } });
  return el;
}

describe("Inspector", () => {
  it("shows_part_fields", () => {
    setup([part("p1", "resistor", "R1")], ["p1"]);
    expect(input("Name").value).toBe("R1");
    expect(input("Value").value).toBe("1k");
    expect(screen.getByText("Ω")).toBeTruthy();
  });

  it("edit_value_commits_once_and_undoes", () => {
    const store = setup([part("p1", "resistor", "R1")], ["p1"]);
    const el = type("Value", "2k");
    expect(store.getState().past).toHaveLength(0);
    fireEvent.blur(el);
    expect(params(store).value).toBe("2k");
    expect(store.getState().past).toHaveLength(1);
    fireEvent.blur(el);
    expect(store.getState().past).toHaveLength(1);
    undo();
    expect(params(store).value).toBeUndefined();
    expect(input("Value").value).toBe("1k");
  });

  it("unchanged_blur_adds_no_history", () => {
    const store = setup([part("p1", "resistor", "R1")], ["p1"]);
    fireEvent.focus(input("Value"));
    fireEvent.blur(input("Value"));
    expect(store.getState().past).toHaveLength(0);
  });

  it("enter_commits_escape_reverts", () => {
    const store = setup([part("p1", "resistor", "R1", { value: "5k" })], ["p1"]);
    const el = type("Value", "7k");
    fireEvent.keyDown(el, { key: "Escape" });
    expect(el.value).toBe("5k");
    fireEvent.blur(el);
    expect(params(store).value).toBe("5k");
    expect(store.getState().past).toHaveLength(0);
    type("Value", "7k");
    fireEvent.keyDown(el, { key: "Enter" });
    expect(params(store).value).toBe("7k");
    expect(store.getState().past).toHaveLength(1);
  });

  it("invalid_value_shows_error_and_is_stored", () => {
    const store = setup([part("p1", "resistor", "R1")], ["p1"]);
    const el = type("Value", "abc");
    expect(screen.getByRole("alert").textContent).toContain("not a number");
    fireEvent.blur(el);
    expect(params(store).value).toBe("abc");
    expect(screen.getByRole("alert").textContent).toContain("not a number");
    type("Value", "");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Empty uses the default (1k)")).toBeTruthy();
  });

  it("wave_fields_follow_choice", () => {
    const store = setup([part("p1", "vsource", "V1")], ["p1"]);
    expect(screen.queryByRole("textbox", { name: "Pulse width" })).toBeNull();
    fireEvent.change(select("Waveform"), { target: { value: "pulse" } });
    expect(params(store).wave).toBe("pulse");
    expect(store.getState().past).toHaveLength(1);
    expect(input("Pulse width")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Amplitude" })).toBeNull();
    fireEvent.change(select("Waveform"), { target: { value: "pwl" } });
    expect(input("PWL points")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Pulse width" })).toBeNull();
  });

  it("model_select_and_new_model", () => {
    const store = setup([part("p1", "diode", "D1")], ["p1"]);
    const sel = select("Model");
    expect(
      within(sel)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["(none)", "New model…"]);
    fireEvent.change(sel, { target: { value: "__new__" } });
    expect(store.getState().project.models.map((m) => m.name)).toEqual(["DMOD"]);
    expect(params(store).model).toBe("DMOD");
    expect(select("Model").value).toBe("DMOD");
    expect(store.getState().selection).toEqual(["p1"]);
    expect(store.getState().past).toHaveLength(1);
    fireEvent.change(select("Model"), { target: { value: "" } });
    expect(params(store).model).toBeUndefined();
  });

  it("ccvs_source_select_lists_vsources", () => {
    const store = setup(
      [
        part("p1", "ccvs", "H1"),
        part("p2", "vsource", "Vsense"),
        part("p3", "resistor", "R1"),
        part("p4", "vsource", "V2"),
      ],
      ["p1"],
    );
    const sel = select("Controlling source");
    expect(
      within(sel)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["(none)", "Vsense", "V2"]);
    fireEvent.change(sel, { target: { value: "V2" } });
    expect(params(store).controlSource).toBe("V2");
  });

  it("bad_name_shows_rule", () => {
    const store = setup([part("p1", "resistor", "R1")], ["p1"]);
    const el = type("Name", "X1");
    expect(screen.getByRole("alert").textContent).toBe(
      "Must start with R and use letters, digits and _",
    );
    fireEvent.blur(el);
    expect(store.getState().doc.parts[0]?.name).toBe("X1");
    type("Name", "R2");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opamp_name_rule_is_relaxed_and_empty_name_rejected", () => {
    const store = setup([part("p1", "opamp", "U1")], ["p1"]);
    type("Name", "amp 1");
    expect(screen.getByRole("alert").textContent).toBe("Use letters, digits and _");
    const el = type("Name", "");
    fireEvent.blur(el);
    expect(store.getState().doc.parts[0]?.name).toBe("U1");
    expect(el.value).toBe("U1");
    expect(screen.getByRole("alert").textContent).toBe("Name cannot be empty");
    type("Name", "U2");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("label_text_edit", () => {
    const store = setup([], ["l1"], [{ id: "l1", text: "NET1", x: 0, y: 0, rotation: 0 }]);
    const el = type("Text", "OUT");
    fireEvent.blur(el);
    expect(store.getState().doc.labels[0]?.text).toBe("OUT");
    type("Text", "a b");
    expect(screen.getByRole("alert").textContent).toBe(
      "Label must use only letters, digits and underscore",
    );
    type("Text", "GnD");
    expect(screen.getByRole("alert").textContent).toBe("Label is reserved for ground");
    type("Text", "0");
    expect(screen.getByRole("alert").textContent).toBe("Label is reserved for ground");
    const empty = type("Text", "");
    fireEvent.blur(empty);
    expect(store.getState().doc.labels[0]?.text).toBe("OUT");
    expect(screen.getByRole("alert").textContent).toBe("Label text cannot be empty");
  });

  it("project_panel_when_nothing_selected", () => {
    const store = setup([part("p1", "resistor", "R1")], []);
    expect(input("Project name").value).toBe("Untitled");
    const el = type("Project name", "Amp");
    fireEvent.blur(el);
    expect(store.getState().project.name).toBe("Amp");
    expect(store.getState().past).toHaveLength(0);
    expect(screen.queryByText(/items selected/)).toBeNull();
    act(() => {
      store.getState().select(["p1", "p1x"]);
    });
    expect(screen.getByText("2 items selected")).toBeTruthy();
    expect(input("Project name")).toBeTruthy();
  });

  it("model_editor_param_range_hint", () => {
    const store = setup([], []);
    fireEvent.change(select("Add model"), { target: { value: "NMOS" } });
    expect(store.getState().project.models).toEqual([
      { name: "NMOSMOD", type: "NMOS", params: {} },
    ]);
    const card = screen.getByRole("group", { name: "Model NMOSMOD" });
    const kp = within(card).getByRole<HTMLInputElement>("textbox", { name: "KP" });
    expect(kp.placeholder).toBe("0.00002");
    expect(within(card).getAllByText("finite and > 0").length).toBeGreaterThan(0);
    fireEvent.change(kp, { target: { value: "-1" } });
    expect(within(card).getByRole("alert").textContent).toContain("finite and > 0");
    fireEvent.blur(kp);
    expect(store.getState().project.models[0]?.params).toEqual({ KP: "-1" });
    fireEvent.change(within(card).getByRole("combobox", { name: "Type" }), {
      target: { value: "D" },
    });
    expect(store.getState().project.models[0]).toEqual({ name: "NMOSMOD", type: "D", params: {} });
  });

  it("model_editor_rename_and_remove", () => {
    const store = setup([], []);
    fireEvent.change(select("Add model"), { target: { value: "D" } });
    fireEvent.change(select("Add model"), { target: { value: "NPN" } });
    const card = screen.getByRole("group", { name: "Model NPNMOD" });
    const name = within(card).getByRole<HTMLInputElement>("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "DMOD" } });
    fireEvent.blur(name);
    expect(store.getState().project.models.map((m) => m.name)).toEqual(["DMOD", "NPNMOD"]);
    expect(within(card).getByRole("alert").textContent).toBe("Name already used");
    fireEvent.change(name, { target: { value: "Q2N" } });
    fireEvent.blur(name);
    expect(store.getState().project.models.map((m) => m.name)).toEqual(["DMOD", "Q2N"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Q2N" }));
    expect(store.getState().project.models.map((m) => m.name)).toEqual(["DMOD"]);
  });

  it("choosing_pulse_shows_no_errors", () => {
    setup([part("p1", "vsource", "V1")], ["p1"]);
    fireEvent.change(select("Waveform"), { target: { value: "pulse" } });
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(input("Period").value).toBe("1m");
    fireEvent.change(select("Waveform"), { target: { value: "pwl" } });
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("draft_resets_when_stored_value_changes", () => {
    const store = setup([part("p1", "resistor", "R1", { value: "5k" })], ["p1"]);
    type("Value", "9k");
    expect(input("Value").value).toBe("9k");
    act(() => {
      store.getState().commit({
        ...store.getState().doc,
        parts: [part("p1", "resistor", "R1", { value: "2k" })],
      });
    });
    expect(input("Value").value).toBe("2k");
  });

  it("wrong_type_model_is_labelled", () => {
    const store = setup([part("p1", "diode", "D1", { model: "Q1" })], ["p1"]);
    act(() => {
      store.getState().setModels([{ name: "Q1", type: "NPN", params: {} }]);
    });
    const texts = within(select("Model"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(texts).toContain("Q1 (wrong type)");
    cleanup();
    setup([part("p1", "diode", "D1", { model: "Gone" })], ["p1"]);
    expect(
      within(select("Model"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toContain("Gone (missing)");
  });
  it("selection_change_commits_pending_draft", () => {
    const store = setup([part("p1", "resistor", "R1"), part("p2", "capacitor", "C1")], ["p1"]);
    type("Value", "2k");
    act(() => {
      store.getState().select(["p2"]);
    });
    expect(params(store).value).toBe("2k");
    expect(store.getState().past).toHaveLength(1);
  });

  it("selection_change_does_not_commit_empty_name", () => {
    const store = setup([part("p1", "resistor", "R1"), part("p2", "capacitor", "C1")], ["p1"]);
    type("Name", "  ");
    act(() => {
      store.getState().select(["p2"]);
    });
    expect(store.getState().doc.parts[0]?.name).toBe("R1");
    expect(store.getState().past).toHaveLength(0);
  });

  it("problems_row_commits_pending_draft", () => {
    const store = setup([part("p1", "resistor", "R1"), far("p2", "capacitor", "C1")], ["p1"]);
    type("Value", "2k");
    fireEvent.click(screen.getByRole("button", { name: "C1 is not connected to anything" }));
    expect(store.getState().selection).toEqual(["p2"]);
    expect(params(store).value).toBe("2k");
    expect(store.getState().past).toHaveLength(1);
  });

  it("problems_row_of_selected_item_keeps_draft", () => {
    const store = setup([part("p1", "resistor", "R1")], ["p1"]);
    type("Value", "2k");
    fireEvent.click(screen.getByRole("button", { name: "R1 is not connected to anything" }));
    expect(input("Value").value).toBe("2k");
    expect(store.getState().past).toHaveLength(0);
    fireEvent.blur(input("Value"));
    expect(params(store).value).toBe("2k");
  });
  it("non_positive_value_shows_range_error_inline", () => {
    setup([part("p1", "resistor", "R1")], ["p1"]);
    type("Value", "0");
    expect(screen.getByRole("alert").textContent).toBe("Must be > 0");
    type("Value", "-1k");
    expect(screen.getByRole("alert").textContent).toBe("Must be > 0");
    type("Value", "2k");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("default_hint_shows_only_while_the_field_is_empty", () => {
    setup([part("p1", "resistor", "R1")], ["p1"]);
    expect(screen.queryByText(/Empty uses the default/)).toBeNull();
    type("Value", "");
    expect(screen.getByText("Empty uses the default (1k)")).toBeTruthy();
    type("Value", "2k");
    expect(screen.queryByText(/Empty uses the default/)).toBeNull();
  });

  it("op_values_for_selected_part", () => {
    const r1 = { ...part("p1", "resistor", "R1"), x: 10, y: 10 };
    const store = makeStore({ ...EMPTY_SCHEMATIC, parts: [r1] });
    store.getState().select(["p1"]);
    const sim = createSimulationStore({ runner: fakeRunner() });
    render(<Editor store={store} simulation={sim} />);
    expect(screen.queryByText("Operating point")).toBeNull();
    act(() => {
      sim.setState({
        status: { kind: "done" },
        result: {
          type: "op",
          axis: new Float64Array(0),
          signals: [
            { name: "a", kind: "v", re: new Float64Array([2.5]) },
            { name: "R1", kind: "i", re: new Float64Array([-1.25e-3]) },
          ],
        },
        ranDoc: store.getState().doc,
        ranSimulation: store.getState().project.simulation,
        map: {
          partOfElement: new Map([["R1", "p1"]]),
          netOfPin: new Map([
            ["p1:1", "a"],
            ["p1:2", "0"],
          ]),
          netOfWire: new Map(),
          netOfLabel: new Map(),
        },
      });
    });
    expect(screen.getByText("I(R1) = -1.25 mA")).toBeTruthy();
    expect(screen.getByText("1: a = 2.5 V")).toBeTruthy();
    expect(screen.getByText("2: 0 = 0 V")).toBeTruthy();
  });
});
