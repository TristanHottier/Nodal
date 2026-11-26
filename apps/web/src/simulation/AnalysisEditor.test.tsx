import type { Project } from "@nodal/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorProvider } from "../editor/EditorContext";
import { createEditorStore } from "../editor/store";
import { CODEX } from "../codex/catalog";
import { AnalysisEditor } from "./AnalysisEditor";
import { ANALYSIS_TYPES } from "./AnalysisFields";
import { dividerProject } from "./testFixtures";

afterEach(cleanup);

const tran = {
  type: "tran" as const,
  tstep: 1e-6,
  tstop: 1e-3,
  tstart: 0,
  tmax: undefined,
  uic: false,
};

function setup(analyses: Project["simulation"]["analyses"] = [tran]) {
  const p = dividerProject();
  const store = createEditorStore({ project: { ...p, simulation: { ...p.simulation, analyses } } });
  render(
    <EditorProvider store={store}>
      <AnalysisEditor />
    </EditorProvider>,
  );
  return store;
}
const sim = (s: ReturnType<typeof setup>) => s.getState().project.simulation;
const input = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });

function enter(name: string, text: string): void {
  const el = input(name);
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value: text } });
  fireEvent.blur(el);
}

describe("AnalysisEditor", () => {
  it("edit_tran_stop_commits_number", () => {
    const store = setup();
    expect(input("tstop").value).toBe("1m");
    enter("tstop", "2m");
    expect(sim(store).analyses[0]).toEqual({ ...tran, tstop: 2e-3 });
    expect(store.getState().past).toHaveLength(0);
  });

  it("invalid_value_rejected", () => {
    const store = setup();
    const before = sim(store);
    enter("tstop", "abc");
    expect(sim(store)).toBe(before);
    expect(screen.getByRole("alert").textContent).toContain("not a number");
    expect(input("tstop").value).toBe("1m");
    enter("tstep", "-1");
    expect(sim(store)).toBe(before);
  });

  it("add_and_remove_analysis", () => {
    const store = setup();
    const remove = (n: number) =>
      screen.getByRole<HTMLButtonElement>("button", {
        name: new RegExp(`^Remove analysis ${String(n)} `),
      });
    expect(remove(1).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add analysis" }));
    expect(sim(store).analyses).toEqual([tran, { type: "op" }]);
    fireEvent.change(screen.getAllByRole("combobox", { name: "Analysis type" })[1] as HTMLElement, {
      target: { value: "ac" },
    });
    expect(sim(store).analyses[1]).toEqual({
      type: "ac",
      sweep: "dec",
      points: 10,
      fstart: 1,
      fstop: 1e6,
    });
    fireEvent.change(screen.getAllByRole("combobox", { name: "Analysis type" })[1] as HTMLElement, {
      target: { value: "dc" },
    });
    expect(sim(store).analyses[1]).toEqual({
      type: "dc",
      source: "V1",
      start: 0,
      stop: 5,
      step: 0.1,
    });
    fireEvent.click(remove(1));
    expect(sim(store).analyses).toHaveLength(1);
    expect(sim(store).analyses[0]?.type).toBe("dc");
  });

  it("dc_source_choices_are_sources", () => {
    const store = setup([{ type: "dc", source: "V1", start: 0, stop: 5, step: 0.1 }]);
    const sel = screen.getByRole<HTMLSelectElement>("combobox", { name: "source" });
    expect([...sel.options].map((o) => o.value)).toEqual(["V1"]);
    expect(input("step").value).toBe("100m");
    enter("start", "1");
    expect(sim(store).analyses[0]).toMatchObject({ start: 1 });
  });

  it("method_option", () => {
    const store = setup();
    const sel = screen.getByRole<HTMLSelectElement>("combobox", { name: "method" });
    expect(sel.value).toBe("");
    fireEvent.change(sel, { target: { value: "gear" } });
    expect(sim(store).options.method).toBe("gear");
    enter("reltol", "1m");
    expect(sim(store).options.reltol).toBe(1e-3);
    enter("reltol", "");
    expect(sim(store).options).toEqual({ method: "gear" });
    fireEvent.change(sel, { target: { value: "" } });
    expect(sim(store).options).toEqual({});
  });
});

describe("AnalysisEditor codex links", () => {
  it("every_analysis_type_has_a_codex_entry", () => {
    for (const t of ANALYSIS_TYPES) expect(CODEX.some((e) => e.analysis === t.value)).toBe(true);
  });
});
