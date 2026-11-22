// M5b exit test, editor half: every reference schematic opens in the editor, shows all
// its parts and reports no problems.
import { parseProject } from "@nodal/schema";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "../editor/Editor";
import { createEditorStore } from "../editor/store";

const files = import.meta.glob<string>("../../../../validation/schematics/*.nodal.json", {
  eager: true,
  query: "?raw",
  import: "default",
});
const schematics = Object.entries(files)
  .map(([path, text]): [string, string] => {
    const file = path.slice(path.lastIndexOf("/") + 1);
    return [file.slice(0, file.length - ".nodal.json".length), text];
  })
  .sort(([a], [b]) => a.localeCompare(b));

afterEach(cleanup);

describe("reference schematics in the editor", () => {
  it("finds_all_31_schematics", () => {
    expect(schematics).toHaveLength(31);
  });

  it.each(schematics)("%s_loads_in_the_editor", (id, text) => {
    const parsed = parseProject(JSON.parse(text));
    if (!parsed.ok) throw new Error(`${id}: ${parsed.error}`);
    const store = createEditorStore({ project: parsed.project });
    render(<Editor store={store} />);
    const shown = screen.getAllByTestId(/^part-/);
    expect(shown, `${id} parts`).toHaveLength(parsed.project.schematic.parts.length);
    expect(screen.getByText("No problems"), `${id} problems`).toBeTruthy();
  });
});
