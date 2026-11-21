import { describe, expect, it } from "vitest";
import { buildNets } from "./nets";
import { emptyDoc, label, pt, put, putTagged, wire } from "./testDoc";

/** Resistor R1 at (0,0): pins "1" at (0,-3) and "2" at (0,3). */
const r1 = () => put(emptyDoc(), "resistor", pt(0, 0), { id: "r1" }).doc;

describe("buildNets", () => {
  it("t_junction_connects", () => {
    // R1.1 and R2.1 meet through a T: a horizontal wire with a vertical wire ending on it.
    let d = r1();
    d = put(d, "resistor", pt(10, 0), { id: "r2" }).doc;
    d = wire(d, pt(0, -3), pt(0, -6), pt(10, -6), pt(10, -3));
    d = wire(d, pt(5, -6), pt(5, -9));
    d = put(d, "capacitor", pt(5, -12), { id: "c1" }).doc;
    const { netOfPin } = buildNets(d);
    expect(netOfPin.get("r1:1")).toBe(netOfPin.get("r2:1"));
    expect(netOfPin.get("c1:2")).toBe(netOfPin.get("r1:1"));
    expect(netOfPin.get("r1:2")).not.toBe(netOfPin.get("r1:1"));
  });

  it("crossing_without_dot_does_not_connect", () => {
    let d = r1();
    d = put(d, "resistor", pt(10, 0), { id: "r2" }).doc;
    d = wire(d, pt(0, -3), pt(0, -6), pt(14, -6)); // A: from R1.1, runs along y = -6
    d = wire(d, pt(2, -9), pt(2, -3), pt(10, -3)); // B: crosses A at (2,-6), ends on R2.1
    const n = buildNets(d).netOfPin;
    expect(n.get("r1:1")).not.toBe(n.get("r2:1"));
  });

  it("wire_end_on_wire_interior_connects", () => {
    let d = r1();
    d = put(d, "resistor", pt(10, 0), { id: "r2" }).doc;
    d = wire(d, pt(0, -3), pt(0, -6), pt(14, -6));
    d = wire(d, pt(10, -3), pt(10, -6)); // ends inside A
    const n = buildNets(d).netOfPin;
    expect(n.get("r1:1")).toBe(n.get("r2:1"));
  });

  it("wire_end_on_bend_connects", () => {
    let d = r1();
    d = wire(d, pt(0, -3), pt(0, -6), pt(8, -6));
    d = wire(d, pt(0, -6), pt(-6, -6));
    d = put(d, "capacitor", pt(-6, -3), { id: "c1" }).doc; // C1.1 at (-6,-6)
    const n = buildNets(d).netOfPin;
    expect(n.get("c1:1")).toBe(n.get("r1:1"));
  });

  it("pin_on_wire_interior_connects", () => {
    let d = r1();
    d = put(d, "resistor", pt(10, 0), { id: "r2" }).doc;
    // R2.1 at (10,-3) sits inside this wire.
    d = wire(d, pt(0, -3), pt(20, -3));
    const n = buildNets(d).netOfPin;
    expect(n.get("r2:1")).toBe(n.get("r1:1"));
  });

  it("labels_join_separate_wires", () => {
    let d = r1();
    d = put(d, "resistor", pt(10, 0), { id: "r2" }).doc;
    d = label(d, pt(0, -3), "SIG");
    d = label(d, pt(10, -3), "SIG");
    const n = buildNets(d).netOfPin;
    expect(n.get("r1:1")).toBe("SIG");
    expect(n.get("r2:1")).toBe("SIG");
  });

  it("labels_join_ignoring_case", () => {
    let d = r1();
    d = put(d, "resistor", pt(10, 0), { id: "r2" }).doc;
    d = label(d, pt(0, -3), "OUT");
    d = label(d, pt(10, -3), "out");
    const r = buildNets(d);
    expect(r.diagnostics).toEqual([]);
    expect(r.netOfPin.get("r1:1")).toBe("OUT");
    expect(r.netOfPin.get("r2:1")).toBe("OUT");
  });

  it("label_conflict_on_one_net", () => {
    let d = r1();
    d = label(d, pt(0, -3), "A", "la");
    d = label(d, pt(0, -3), "B", "lb");
    const r = buildNets(d);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "label-conflict",
      itemIds: ["la", "lb"],
    });
    expect(r.netOfPin.get("r1:1")).toBe("A");
  });

  it("ground_forces_zero", () => {
    let d = r1();
    d = put(d, "ground", pt(0, 10), { id: "g1" }).doc;
    d = wire(d, pt(0, 3), pt(0, 10));
    d = put(d, "resistor", pt(10, 0), { id: "r2" }).doc;
    d = put(d, "ground", pt(10, 10), { id: "g2" }).doc; // separate, but ground is global
    d = wire(d, pt(10, 3), pt(10, 10));
    const n = buildNets(d).netOfPin;
    expect(n.get("r1:2")).toBe("0");
    expect(n.get("g1:gnd")).toBe("0");
    expect(n.get("r2:2")).toBe("0");
    expect(n.get("r1:1")).not.toBe("0");
  });

  it("label_on_ground_net_conflicts", () => {
    let d = r1();
    d = put(d, "ground", pt(0, 3), { id: "g1" }).doc;
    d = label(d, pt(0, 3), "X", "lx");
    const r = buildNets(d);
    expect(r.diagnostics.map((x) => x.code)).toEqual(["label-conflict"]);
    expect(r.netOfPin.get("r1:2")).toBe("0");
  });

  it("bad_labels_reported", () => {
    let d = r1();
    d = label(d, pt(0, -3), "a-b", "l1");
    d = label(d, pt(0, 3), "GnD", "l2");
    const r = buildNets(d);
    expect(r.diagnostics.map((x) => [x.code, x.itemIds])).toEqual([
      ["bad-label", ["l1"]],
      ["bad-label", ["l2"]],
    ]);
    expect(r.netOfPin.get("r1:1")).toBe("N001");
  });

  it("generated_names_skip_labels", () => {
    let d = r1();
    d = put(d, "resistor", pt(10, 0), { id: "r2" }).doc;
    d = label(d, pt(0, -3), "n001");
    const n = buildNets(d).netOfPin;
    expect(n.get("r1:1")).toBe("n001");
    expect(n.get("r1:2")).toBe("N002");
    expect(n.get("r2:1")).toBe("N003");
    expect(n.get("r2:2")).toBe("N004");
  });

  it("labels_on_pinless_nets_are_ignored", () => {
    let d = r1();
    d = wire(d, pt(20, 0), pt(30, 0));
    d = label(d, pt(20, 0), "A");
    d = label(d, pt(30, 0), "B");
    expect(buildNets(d).diagnostics).toEqual([]);
  });

  it("putTagged_uses_catalog_pins", () => {
    const { doc } = putTagged(emptyDoc(), "diode", pt(0, 0), { a: "AN", k: "CA" }, { id: "d1" });
    const n = buildNets(doc).netOfPin;
    expect([n.get("d1:a"), n.get("d1:k")]).toEqual(["AN", "CA"]);
  });
});
