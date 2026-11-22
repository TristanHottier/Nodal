// M5b exit test: every reference schematic loads, netlists cleanly and matches its reference IR.
import { parseNetlist, parseProject } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { compareNetlists } from "./equivalence";
import { projectToNetlist } from "./netlister";

const read = (files: Record<string, string>, suffix: string): Map<string, string> =>
  new Map(
    Object.entries(files).map(([path, text]) => {
      const file = path.slice(path.lastIndexOf("/") + 1);
      return [file.slice(0, file.length - suffix.length), text];
    }),
  );

const references = read(
  import.meta.glob<string>("../../../../validation/circuits/*.json", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
  ".json",
);
const schematics = read(
  import.meta.glob<string>("../../../../validation/schematics/*.nodal.json", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
  ".nodal.json",
);

/** Sorted node names used by the elements, ground excluded. */
function nodeNames(
  elements: readonly { nodes: readonly string[]; controlNodes?: readonly string[] }[],
): string[] {
  const names = new Set<string>();
  for (const e of elements) for (const n of [...e.nodes, ...(e.controlNodes ?? [])]) names.add(n);
  names.delete("0");
  return [...names].sort();
}

describe("reference schematics", () => {
  it.each([...schematics.keys()].sort())("%s_netlists_to_its_reference", (id) => {
    const referenceText = references.get(id);
    expect(referenceText, `validation/circuits/${id}.json exists`).toBeDefined();
    const parsedProject = parseProject(JSON.parse(schematics.get(id) ?? "null"));
    if (!parsedProject.ok) throw new Error(`${id}: ${parsedProject.error}`);

    const { ir, diagnostics } = projectToNetlist(parsedProject.project);
    expect(
      diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
      `${id} diagnostics`,
    ).toEqual([]);
    if (!ir) throw new Error(`${id}: no netlist`);

    const reference = parseNetlist(JSON.parse(referenceText ?? "null"));
    if (!reference.ok) throw new Error(`${id} reference: ${reference.issues.join("; ")}`);
    expect(compareNetlists(ir, reference.value), `${id} differences`).toEqual([]);
    expect(ir.title, `${id} title`).toBe(reference.value.title);
    expect(nodeNames(ir.elements), `${id} node names`).toEqual(nodeNames(reference.value.elements));
  });

  it("every_reference_circuit_has_a_schematic", () => {
    const referenceIds = [...references.keys()].sort();
    const schematicIds = [...schematics.keys()].sort();
    expect(referenceIds).toHaveLength(31);
    expect(
      referenceIds.filter((id) => !schematics.has(id)),
      "reference circuits without a schematic",
    ).toEqual([]);
    expect(
      schematicIds.filter((id) => !references.has(id)),
      "schematics without a reference circuit",
    ).toEqual([]);
    expect(schematicIds).toEqual(referenceIds);
  });
});
