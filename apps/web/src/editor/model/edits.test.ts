import type { Part, Point, Schematic, Wire } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { pinPositions } from "../geometry";
import {
  addLabel,
  addPart,
  addWire,
  copyItems,
  deleteItems,
  mirrorItems,
  moveItems,
  pasteClip,
  rotateItems,
} from "./edits";

const p = (x: number, y: number): Point => ({ x, y });
const empty = (): Schematic => ({ parts: [], wires: [], labels: [] });
const wire = (id: string, ...pts: Point[]): Wire => ({ id, points: pts });
const part = (over: Partial<Part>): Part => ({
  id: "r1",
  type: "resistor",
  name: "R1",
  x: 10,
  y: 10,
  rotation: 0,
  mirror: false,
  params: { value: "1k" },
  ...over,
});
const ids = () => {
  let n = 0;
  return () => "n" + String(++n);
};

function expectOrthogonal(doc: Schematic): void {
  for (const w of doc.wires) {
    for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1];
      const b = w.points[i];
      expect(a && b && (a.x === b.x || a.y === b.y)).toBe(true);
      expect(a && b && (a.x !== b.x || a.y !== b.y)).toBe(true);
    }
  }
}

describe("add", () => {
  it("add_part_uses_defaults", () => {
    const d = addPart(empty(), "a", "resistor", p(3, 4), 90, true);
    expect(d.parts).toEqual([
      {
        id: "a",
        type: "resistor",
        name: "R1",
        x: 3,
        y: 4,
        rotation: 90,
        mirror: true,
        params: { value: "1k" },
      },
    ]);
    expect(addPart(d, "b", "resistor", p(0, 0), 0, false).parts[1]?.name).toBe("R2");
    expect(addPart(d, "c", "ground", p(0, 0), 0, false).parts[1]?.name).toBe("GND1");
  });

  it("add_label_and_wire", () => {
    const d = addLabel(empty(), "l", p(1, 2), 0);
    expect(d.labels[0]).toEqual({ id: "l", text: "NET1", x: 1, y: 2, rotation: 0 });
  });

  it("add_wire_normalizes", () => {
    const d = addWire(empty(), "w", [p(0, 0), p(2, 0), p(5, 0), p(5, 3)]);
    expect(d.wires[0]?.points).toEqual([p(0, 0), p(5, 0), p(5, 3)]);
    const same = addWire(d, "x", [p(1, 1), p(1, 1)]);
    expect(same).toBe(d);
  });
});

describe("move", () => {
  it("move_translates_selected", () => {
    const d: Schematic = {
      parts: [part({})],
      wires: [wire("w", p(0, 0), p(0, 5))],
      labels: [{ id: "l", text: "A", x: 1, y: 1, rotation: 0 }],
    };
    const m = moveItems(d, ["r1", "w", "l"], p(2, 3));
    expect(m.parts[0]).toMatchObject({ x: 12, y: 13 });
    expect(m.wires[0]?.points).toEqual([p(2, 3), p(2, 8)]);
    expect(m.labels[0]).toMatchObject({ x: 3, y: 4 });
  });

  it("move_drags_attached_wire_end", () => {
    // Resistor pins at (10,7) and (10,13); wire runs from the far side into the bottom pin.
    const d: Schematic = {
      parts: [part({})],
      wires: [wire("w", p(4, 13), p(10, 13))],
      labels: [],
    };
    const m = moveItems(d, ["r1"], p(0, 2));
    expect(m.wires[0]?.points).toEqual([p(4, 13), p(10, 13), p(10, 15)]);
    expectOrthogonal(m);
  });

  it("move_translates_wire_when_both_ends_follow", () => {
    const d: Schematic = {
      parts: [part({}), part({ id: "r2", name: "R2", x: 20, y: 10 })],
      wires: [wire("w", p(10, 13), p(10, 16), p(20, 16), p(20, 13))],
      labels: [],
    };
    const m = moveItems(d, ["r1", "r2"], p(1, 1));
    expect(m.wires[0]?.points).toEqual([p(11, 14), p(11, 17), p(21, 17), p(21, 14)]);
  });

  it("move_leaves_unattached_wire", () => {
    const d: Schematic = {
      parts: [part({})],
      wires: [wire("w", p(0, 0), p(5, 0))],
      labels: [],
    };
    const m = moveItems(d, ["r1"], p(1, 1));
    expect(m.wires[0]).toBe(d.wires[0]);
  });

  it("move_label_anchor_drags_wire", () => {
    const d: Schematic = {
      parts: [],
      wires: [wire("w", p(0, 4), p(5, 4))],
      labels: [{ id: "l", text: "A", x: 5, y: 4, rotation: 0 }],
    };
    const m = moveItems(d, ["l"], p(0, 2));
    expect(m.wires[0]?.points).toEqual([p(0, 4), p(5, 4), p(5, 6)]);
  });

  it("move_deletes_wire_that_collapses", () => {
    const d: Schematic = {
      parts: [part({})],
      wires: [wire("w", p(10, 13), p(10, 15))],
      labels: [],
    };
    const m = moveItems(d, ["r1"], p(0, 2));
    // Start follows to (10,15), end stays: the wire has zero length.
    expect(m.wires).toEqual([]);
  });
});

describe("rotate and mirror", () => {
  it("rotate_part_and_label", () => {
    const d: Schematic = {
      parts: [part({})],
      wires: [],
      labels: [{ id: "l", text: "A", x: 1, y: 1, rotation: 270 }],
    };
    const r = rotateItems(d, ["r1", "l"]);
    expect(r.parts[0]?.rotation).toBe(90);
    expect(r.labels[0]).toMatchObject({ x: 1, y: 1, rotation: 0 });
  });

  it("rotate_keeps_wires_orthogonal", () => {
    const part1 = part({});
    const [top, bottom] = pinPositions(part1).map((q) => q.at);
    if (!top || !bottom) throw new Error("pins");
    const d: Schematic = {
      parts: [part1],
      wires: [wire("a", p(top.x, 2), top), wire("b", bottom, p(bottom.x + 6, bottom.y))],
      labels: [],
    };
    let cur = d;
    for (let k = 0; k < 4; k++) {
      cur = rotateItems(cur, ["r1"]);
      expectOrthogonal(cur);
      const pins = pinPositions(cur.parts[0] as Part).map((q) => q.at);
      expect(cur.wires[0]?.points.at(-1)).toEqual(pins[0]);
      expect(cur.wires[1]?.points[0]).toEqual(pins[1]);
    }
  });

  it("mirror_toggles", () => {
    const d: Schematic = {
      parts: [part({})],
      wires: [],
      labels: [{ id: "l", text: "A", x: 1, y: 1, rotation: 90 }],
    };
    const m = mirrorItems(d, ["r1", "l"]);
    expect(m.parts[0]?.mirror).toBe(true);
    expect(m.labels[0]).toBe(d.labels[0]);
    expect(mirrorItems(m, ["r1"]).parts[0]?.mirror).toBe(false);
  });

  it("mirror_moves_wire_on_controlled_source_pins", () => {
    const e = part({ id: "e1", type: "vcvs", name: "E1", x: 20, y: 20 });
    const cp = pinPositions(e).find((q) => q.name === "cp")?.at;
    if (!cp) throw new Error("cp");
    const d: Schematic = {
      parts: [e],
      wires: [wire("w", p(cp.x - 4, cp.y), cp)],
      labels: [],
    };
    const m = mirrorItems(d, ["e1"]);
    const newCp = m.parts[0] ? pinPositions(m.parts[0]).find((q) => q.name === "cp")?.at : null;
    expect(newCp).toEqual(p(24, 18));
    expect(m.wires[0]?.points.at(-1)).toEqual(newCp);
    expectOrthogonal(m);
  });
});

describe("delete", () => {
  it("delete_keeps_dangling_wires", () => {
    const d: Schematic = {
      parts: [part({})],
      wires: [wire("w", p(4, 13), p(10, 13))],
      labels: [{ id: "l", text: "A", x: 0, y: 0, rotation: 0 }],
    };
    const r = deleteItems(d, ["r1", "l"]);
    expect(r.parts).toEqual([]);
    expect(r.labels).toEqual([]);
    expect(r.wires).toEqual(d.wires);
    expect(deleteItems(d, ["w"]).wires).toEqual([]);
  });
});

describe("clipboard", () => {
  const doc: Schematic = {
    parts: [part({}), part({ id: "r2", name: "R2", x: 20, y: 10 })],
    wires: [wire("w", p(10, 13), p(20, 13))],
    labels: [{ id: "l", text: "OUT", x: 5, y: 5, rotation: 90 }],
  };

  it("copy_nothing_selected_is_null", () => {
    expect(copyItems(doc, [])).toBeNull();
    expect(copyItems(doc, ["nope"])).toBeNull();
  });

  it("paste_renames_and_offsets", () => {
    const clip = copyItems(doc, ["r1", "w", "l"]);
    if (!clip) throw new Error("clip");
    const { doc: d, ids: out } = pasteClip(doc, clip, ids(), p(2, 2));
    expect(out).toHaveLength(3);
    expect(d.parts[2]).toMatchObject({ id: "n1", name: "R3", x: 12, y: 12 });
    expect(d.parts[2]?.params).toEqual({ value: "1k" });
    expect(d.parts[2]?.params).not.toBe(doc.parts[0]?.params);
    expect(d.wires[1]?.points).toEqual([p(12, 15), p(22, 15)]);
    expect(d.labels[1]).toMatchObject({ text: "OUT", x: 7, y: 7, rotation: 90 });
    expect(new Set([...d.parts, ...d.wires, ...d.labels].map((i) => i.id)).size).toBe(7);
  });

  it("paste_after_delete", () => {
    const clip = copyItems(doc, ["r1"]);
    if (!clip) throw new Error("clip");
    const gone = deleteItems(doc, ["r1", "r2"]);
    const { doc: d } = pasteClip(gone, clip, ids(), p(2, 2));
    expect(d.parts[0]).toMatchObject({ name: "R1", x: 12, y: 12 });
  });

  it("repeated_paste_offsets", () => {
    const base: Schematic = { parts: [part({})], wires: [], labels: [] };
    const clip = copyItems(base, ["r1"]);
    if (!clip) throw new Error("clip");
    const next = ids();
    const a = pasteClip(base, clip, next, p(2, 2));
    const b = pasteClip(a.doc, clip, next, p(4, 4));
    expect(b.doc.parts.map((q) => [q.name, q.x, q.y])).toEqual([
      ["R1", 10, 10],
      ["R2", 12, 12],
      ["R3", 14, 14],
    ]);
  });

  it("paste_names_in_clip_order_within_one_call", () => {
    const clip = copyItems(doc, ["r1", "r2"]);
    if (!clip) throw new Error("clip");
    const { doc: d } = pasteClip(doc, clip, ids(), p(0, 5));
    expect(d.parts.slice(2).map((q) => q.name)).toEqual(["R3", "R4"]);
  });
});

describe("no-ops", () => {
  it("noop_returns_same_object", () => {
    const d: Schematic = {
      parts: [part({})],
      wires: [wire("w", p(10, 13), p(20, 13))],
      labels: [],
    };
    expect(moveItems(d, ["r1", "w"], p(0, 0))).toBe(d);
    expect(moveItems(d, ["unknown"], p(1, 1))).toBe(d);
    expect(deleteItems(d, ["unknown"])).toBe(d);
    expect(rotateItems(d, ["unknown"])).toBe(d);
    expect(rotateItems(d, ["w"])).toBe(d);
    expect(mirrorItems(d, [])).toBe(d);
  });
});
