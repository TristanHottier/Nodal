import { optionsSchema, parseNetlist, type Project } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import l1Json from "../../../../validation/circuits/L1.json?raw";
import { compareNetlists } from "./equivalence";
import { projectToNetlist } from "./netlister";
import { emptyDoc, label, pt, put, putAll, putTagged, project, wire } from "./testDoc";

const codes = (p: Project) => projectToNetlist(p).diagnostics.map((d) => d.code);

function divider() {
  let d = put(emptyDoc(), "vsource", pt(0, 0), { params: { dc: "10" } }).doc;
  d = put(d, "resistor", pt(7, -3), { rotation: 270, params: { value: "1k" } }).doc;
  d = put(d, "resistor", pt(10, 3), { params: { value: "3k" } }).doc;
  d = put(d, "ground", pt(0, 6)).doc;
  d = wire(d, pt(0, -3), pt(4, -3));
  d = wire(d, pt(10, -3), pt(10, 0));
  d = wire(d, pt(0, 3), pt(0, 6));
  d = wire(d, pt(10, 6), pt(0, 6));
  d = label(d, pt(2, -3), "in");
  d = label(d, pt(10, -1), "out");
  return d;
}

describe("projectToNetlist", () => {
  it("divider_matches_L1", () => {
    const p = {
      ...project(divider()),
      name: "L1 divider",
      simulation: {
        analyses: [{ type: "op" as const }],
        options: optionsSchema.parse({ reltol: 1e-6, vntol: 1e-9, abstol: 1e-15, chgtol: 1e-18 }),
      },
    };
    const { ir, diagnostics } = projectToNetlist(p);
    expect(diagnostics).toEqual([]);
    const ref = parseNetlist(JSON.parse(l1Json));
    expect(ref.ok).toBe(true);
    if (!ir || !ref.ok) throw new Error("no netlist");
    expect(compareNetlists(ref.value, ir)).toEqual([]);
  });

  it("every_part_type_maps", () => {
    let d = emptyDoc();
    let x = 0;
    const add = (type: Parameters<typeof putAll>[1], params: Record<string, string> = {}) => {
      d = putAll(d, type, pt((x += 20), 0), { params }).doc;
    };
    add("resistor");
    add("capacitor", { ic: "1" });
    add("inductor");
    add("vsource");
    add("isource");
    add("vcvs");
    add("vccs");
    add("ccvs", { controlSource: "V1" });
    add("cccs", { controlSource: "V1" });
    add("diode", { model: "DM" });
    add("npn", { model: "QN" });
    add("pnp", { model: "QP" });
    add("nmos", { model: "MN", w: "10u", l: "1u" });
    add("pmos", { model: "MP" });
    add("switch", { model: "SM" });
    add("opamp");
    d = put(d, "ground", pt(0, 40)).doc;
    const p = project(d);
    p.models = [
      { name: "DM", type: "D", params: { IS: "1e-14" } },
      { name: "QN", type: "NPN", params: {} },
      { name: "QP", type: "PNP", params: {} },
      { name: "MN", type: "NMOS", params: {} },
      { name: "MP", type: "PMOS", params: {} },
      { name: "SM", type: "SW", params: {} },
    ];
    const { ir, diagnostics } = projectToNetlist(p);
    expect(diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    if (!ir) throw new Error("no netlist");
    const el = (n: string) => ir.elements.find((e) => e.name === n);
    expect(ir.elements.map((e) => e.kind)).toEqual([
      "R",
      "C",
      "L",
      "V",
      "I",
      "E",
      "G",
      "H",
      "F",
      "D",
      "Q",
      "Q",
      "M",
      "M",
      "S",
      "E",
    ]);
    expect(el("R1")).toMatchObject({ nodes: ["R1_1", "R1_2"], value: 1000 });
    expect(el("C1")).toMatchObject({ ic: 1 });
    expect(el("E1")).toMatchObject({
      nodes: ["E1_p", "E1_n"],
      controlNodes: ["E1_cp", "E1_cn"],
      gain: 1,
    });
    expect(el("G1")).toMatchObject({ controlNodes: ["G1_cp", "G1_cn"] });
    expect(el("H1")).toMatchObject({ controlSource: "V1" });
    expect(el("F1")).toMatchObject({ controlSource: "V1" });
    expect(el("D1")).toMatchObject({ nodes: ["D1_a", "D1_k"], model: "DM" });
    expect(el("Q1")).toMatchObject({ nodes: ["Q1_c", "Q1_b", "Q1_e"] });
    expect(el("M1")).toMatchObject({
      nodes: ["M1_d", "M1_g", "M1_s", "M1_b"],
      w: 1e-5,
      l: 1e-6,
    });
    expect(el("M2")).not.toHaveProperty("w");
    expect(el("S1")).toMatchObject({
      nodes: ["S1_p", "S1_n"],
      controlNodes: ["S1_cp", "S1_cn"],
    });
    expect(el("EU1")).toMatchObject({
      kind: "E",
      nodes: ["U1_out", "0"],
      controlNodes: ["U1_inp", "U1_inn"],
      gain: 1e6,
    });
    expect(ir.models.find((m) => m.name === "DM")?.params).toEqual({ IS: 1e-14 });
  });

  it("ac_and_waveforms_map", () => {
    let d = emptyDoc();
    d = putTagged(d, "vsource", pt(0, 0), { p: "a", n: "a0" }, { params: { acMag: "2" } }).doc;
    d = putTagged(
      d,
      "vsource",
      pt(20, 0),
      { p: "b", n: "b0" },
      {
        params: {
          wave: "pulse",
          v1: "0",
          v2: "5",
          tr: "1n",
          tf: "1n",
          pw: "1u",
          per: "2u",
          acMag: "1",
          acPhase: "90",
        },
      },
    ).doc;
    d = putTagged(
      d,
      "vsource",
      pt(40, 0),
      { p: "c", n: "c0" },
      { params: { wave: "sin", vo: "0", va: "1", freq: "1k", td: "1m" } },
    ).doc;
    d = putTagged(
      d,
      "isource",
      pt(60, 0),
      { p: "e", n: "e0" },
      { params: { wave: "pwl", pwl: "0 0; 1m 5" } },
    ).doc;
    d = put(d, "ground", pt(0, 40)).doc;
    const { ir, diagnostics } = projectToNetlist(project(d));
    expect(diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    const [v1, v2, v3, i1] = ir?.elements ?? [];
    expect(v1).toMatchObject({ ac: { mag: 2, phase: 0 } });
    expect(v2).toMatchObject({
      ac: { mag: 1, phase: 90 },
      tran: { type: "pulse", v1: 0, v2: 5, td: 0, tr: 1e-9, tf: 1e-9, pw: 1e-6, per: 2e-6 },
    });
    expect(v3).toMatchObject({
      tran: { type: "sin", vo: 0, va: 1, freq: 1000, td: 1e-3, theta: 0, phase: 0 },
    });
    expect(i1).toMatchObject({
      tran: {
        type: "pwl",
        points: [
          [0, 0],
          [0.001, 5],
        ],
      },
    });
  });

  it("missing_model_and_type_mismatch", () => {
    let d = putTagged(emptyDoc(), "diode", pt(0, 0), { a: "x", k: "y" }, { name: "D1" }).doc;
    d = putTagged(
      d,
      "diode",
      pt(20, 0),
      { a: "x", k: "y" },
      { name: "D2", params: { model: "NOPE" } },
    ).doc;
    d = putTagged(
      d,
      "diode",
      pt(40, 0),
      { a: "x", k: "y" },
      { name: "D3", params: { model: "QN" } },
    ).doc;
    d = put(d, "ground", pt(0, 40)).doc;
    const p = project(d);
    p.models = [{ name: "QN", type: "NPN", params: {} }];
    const r = projectToNetlist(p);
    expect(r.diagnostics.map((x) => [x.code, x.message])).toEqual([
      ["missing-model", "D1 has no model"],
      ["missing-model", "D2 model NOPE not found"],
      ["model-type-mismatch", "D3 model QN is NPN, expected D"],
    ]);
    expect(r.ir).toBeNull();
  });

  it("invalid_model_param_reported", () => {
    const p = project(put(emptyDoc(), "ground", pt(0, 0)).doc);
    p.models = [{ name: "DM", type: "D", params: { IS: "1x" } }];
    const r = projectToNetlist(p);
    expect(r.diagnostics.map((x) => [x.code, x.message])).toEqual([
      ["invalid-model", "model DM IS: not a number: 1x"],
    ]);
  });

  function controlled() {
    let d = putTagged(emptyDoc(), "vsource", pt(0, 0), { p: "a", n: "b" }, { id: "v1" }).doc;
    d = putTagged(
      d,
      "ccvs",
      pt(20, 0),
      { p: "c", n: "b" },
      { id: "h1", params: { controlSource: "V1" } },
    ).doc;
    return put(d, "ground", pt(0, 40)).doc;
  }

  it("renamed_control_source_reports", () => {
    const ok = projectToNetlist(project(controlled()));
    expect(ok.diagnostics.filter((x) => x.severity === "error")).toEqual([]);

    const renamed = {
      ...controlled(),
    };
    renamed.parts = renamed.parts.map((q) => (q.id === "v1" ? { ...q, name: "V9" } : q));
    const r = projectToNetlist(project(renamed));
    expect(r.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown-control-source", itemIds: ["h1"] }),
    );

    const cased = controlled();
    cased.parts = cased.parts.map((q) =>
      q.id === "h1" ? { ...q, params: { ...q.params, controlSource: "v1" } } : q,
    );
    expect(projectToNetlist(project(cased)).diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown-control-source", itemIds: ["h1", "v1"] }),
    );
  });

  it("sweep_source_must_exist", () => {
    const sweep = (source: string): Project => ({
      ...project(controlled()),
      simulation: {
        analyses: [{ type: "dc", source, start: 0, stop: 1, step: 0.5 }],
        options: optionsSchema.parse({}),
      },
    });
    expect(projectToNetlist(sweep("V1")).ir).not.toBeNull();
    const missing = projectToNetlist(sweep("V2"));
    expect(missing.ir).toBeNull();
    expect(missing.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown-sweep-source", itemIds: [] }),
    );
    expect(projectToNetlist(sweep("v1")).diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown-sweep-source", itemIds: ["v1"] }),
    );
    expect(projectToNetlist(sweep("H1")).diagnostics.map((x) => x.code)).toContain(
      "unknown-sweep-source",
    );
  });

  it("bad_and_duplicate_names", () => {
    let d = emptyDoc();
    d = putTagged(d, "resistor", pt(0, 0), { "1": "a", "2": "b" }, { name: "X1", id: "p1" }).doc;
    d = putTagged(d, "resistor", pt(20, 0), { "1": "a", "2": "b" }, { name: "RA", id: "p2" }).doc;
    d = putTagged(d, "resistor", pt(40, 0), { "1": "a", "2": "b" }, { name: "Ra", id: "p3" }).doc;
    d = putTagged(
      d,
      "opamp",
      pt(60, 0),
      { inn: "a", inp: "b", out: "c" },
      { name: "A B", id: "p4" },
    ).doc;
    d = put(d, "ground", pt(0, 40)).doc;
    const r = projectToNetlist(project(d));
    expect(
      r.diagnostics.filter((x) => x.severity === "error").map((x) => [x.code, x.itemIds]),
    ).toEqual([
      ["bad-name", ["p1"]],
      ["bad-name", ["p4"]],
      ["duplicate-name", ["p2", "p3"]],
    ]);
  });

  it("opamp_name_collides_with_vcvs", () => {
    let d = putTagged(
      emptyDoc(),
      "opamp",
      pt(0, 0),
      { inn: "a", inp: "b", out: "c" },
      { name: "U1", id: "u" },
    ).doc;
    d = putTagged(
      d,
      "vcvs",
      pt(20, 0),
      { p: "a", n: "b", cp: "c", cn: "a" },
      { name: "EU1", id: "e" },
    ).doc;
    d = put(d, "ground", pt(0, 40)).doc;
    expect(projectToNetlist(project(d)).diagnostics).toContainEqual(
      expect.objectContaining({ code: "duplicate-name", itemIds: ["e", "u"] }),
    );
  });

  it("shorted_and_dangling", () => {
    let d = putTagged(emptyDoc(), "resistor", pt(0, 0), { "1": "s", "2": "s" }, { id: "r1" }).doc;
    d = put(d, "ground", pt(0, 40)).doc;
    const r = projectToNetlist(project(d));
    expect(r.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "error", code: "shorted-element", itemIds: ["r1"] }),
    );
  });

  it("warnings_keep_ir", () => {
    let d = putTagged(emptyDoc(), "vsource", pt(0, 0), { p: "a" }, { id: "v1" }).doc;
    d = put(d, "ground", pt(0, 10), { id: "g" }).doc;
    d = wire(d, pt(0, 3), pt(0, 10));
    d = putTagged(d, "resistor", pt(20, 0), { "1": "a" }, { id: "r1" }).doc;
    d = putTagged(d, "resistor", pt(40, 0), {}, { id: "r2" }).doc;
    const r = projectToNetlist(project(d));
    expect(r.ir).not.toBeNull();
    expect(r.diagnostics.map((x) => [x.severity, x.code, x.itemIds])).toEqual([
      ["warning", "dangling-pin", ["r1"]],
      ["warning", "unconnected-part", ["r2"]],
    ]);
  });

  it("no_ground", () => {
    const d = putTagged(emptyDoc(), "resistor", pt(0, 0), { "1": "a", "2": "b" }).doc;
    const r = projectToNetlist(project(d));
    expect(r.diagnostics.filter((x) => x.severity === "error").map((x) => x.code)).toEqual([
      "no-ground",
    ]);
    expect(r.ir).toBeNull();
  });

  it("invalid_value_names_part_and_key", () => {
    let d = putTagged(
      emptyDoc(),
      "resistor",
      pt(0, 0),
      { "1": "a", "2": "b" },
      { id: "r1", params: { value: "4,7k" } },
    ).doc;
    d = putTagged(
      d,
      "resistor",
      pt(20, 0),
      { "1": "a", "2": "b" },
      { id: "r2", params: { value: "" } },
    ).doc;
    d = put(d, "ground", pt(0, 40)).doc;
    const r = projectToNetlist(project(d));
    expect(r.diagnostics.map((x) => [x.code, x.message, x.itemIds])).toEqual([
      ["invalid-value", "R1 value: not a number: 4,7k", ["r1"]],
      ["missing-value", "R2 value: required", ["r2"]],
    ]);
  });

  it("ir_null_on_error", () => {
    expect(codes(project(emptyDoc()))).toEqual(["no-ground"]);
    let d = putTagged(
      emptyDoc(),
      "vsource",
      pt(0, 0),
      { p: "a", n: "b" },
      { params: { wave: "pulse", v1: "0", v2: "1", tr: "0", tf: "1n", pw: "1u", per: "2u" } },
    ).doc;
    d = put(d, "ground", pt(0, 40)).doc;
    const r = projectToNetlist(project(d));
    expect(r.ir).toBeNull();
    const bad = r.diagnostics.filter((x) => x.code === "ir-invalid");
    expect(bad).toHaveLength(1);
    expect(bad[0]?.message).toContain("tr");
  });
});
