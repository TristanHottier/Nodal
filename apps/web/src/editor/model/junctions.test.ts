import type { Part, Point, Schematic, Wire } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { junctionDots } from "./junctions";

const p = (x: number, y: number): Point => ({ x, y });
const wire = (id: string, ...pts: Point[]): Wire => ({ id, points: pts });
const doc = (wires: Wire[], parts: Part[] = [], labels: Schematic["labels"] = []): Schematic => ({
  parts,
  wires,
  labels,
});
const resistor = (id: string, x: number, y: number): Part => ({
  id,
  type: "resistor",
  name: id.toUpperCase(),
  x,
  y,
  rotation: 0,
  mirror: false,
  params: { value: "1k" },
});

describe("junctionDots", () => {
  it("t_junction", () => {
    const d = doc([wire("a", p(0, 0), p(10, 0)), wire("b", p(5, 0), p(5, 5))]);
    expect(junctionDots(d)).toEqual([p(5, 0)]);
  });

  it("plain_crossing_no_dot", () => {
    const d = doc([wire("a", p(0, 5), p(10, 5)), wire("b", p(5, 0), p(5, 10))]);
    expect(junctionDots(d)).toEqual([]);
  });

  it("corner_no_dot", () => {
    expect(junctionDots(doc([wire("a", p(0, 0), p(5, 0), p(5, 5))]))).toEqual([]);
  });

  it("dot_at_corner_with_third_wire", () => {
    const d = doc([wire("a", p(0, 0), p(5, 0), p(5, 5)), wire("b", p(5, 0), p(10, 0))]);
    expect(junctionDots(d)).toEqual([p(5, 0)]);
  });

  it("two_ends_meeting_no_dot", () => {
    const d = doc([wire("a", p(0, 0), p(5, 0)), wire("b", p(5, 0), p(5, 5))]);
    expect(junctionDots(d)).toEqual([]);
  });

  it("three_ends_meeting_dot", () => {
    const d = doc([
      wire("a", p(0, 0), p(5, 0)),
      wire("b", p(5, 0), p(5, 5)),
      wire("c", p(5, -5), p(5, 0)),
    ]);
    expect(junctionDots(d)).toEqual([p(5, 0)]);
  });

  it("pin_on_wire_interior_dot", () => {
    // Resistor at (10,10) has pins (10,7) and (10,13).
    const d = doc([wire("a", p(5, 7), p(15, 7))], [resistor("r1", 10, 10)]);
    expect(junctionDots(d)).toEqual([p(10, 7)]);
  });

  it("wire_end_on_pin_no_dot", () => {
    const d = doc([wire("a", p(10, 7), p(15, 7))], [resistor("r1", 10, 10)]);
    expect(junctionDots(d)).toEqual([]);
  });

  it("four_way_one_dot", () => {
    const d = doc([
      wire("a", p(0, 0), p(10, 0)),
      wire("b", p(5, -5), p(5, 0)),
      wire("c", p(5, 0), p(5, 5)),
    ]);
    expect(junctionDots(d)).toEqual([p(5, 0)]);
  });

  it("label_does_not_count", () => {
    const d = doc(
      [wire("a", p(0, 0), p(10, 0)), wire("b", p(5, 0), p(5, 5))],
      [],
      [{ id: "l1", text: "X", x: 5, y: 0, rotation: 0 }],
    );
    expect(junctionDots(d)).toEqual([p(5, 0)]);
    const only = doc(
      [wire("a", p(0, 0), p(5, 0))],
      [],
      [{ id: "l1", text: "X", x: 5, y: 0, rotation: 0 }],
    );
    expect(junctionDots(only)).toEqual([]);
  });

  it("self_crossing_wire_alone_no_dot", () => {
    const d = doc([wire("a", p(0, 0), p(10, 0), p(10, 5), p(5, 5), p(5, -5))]);
    expect(junctionDots(d)).toEqual([]);
  });

  it("self_crossing_wire_with_pin_dot", () => {
    // Resistor at (5,3) has pins (5,0) and (5,6); the wire crosses itself at (5,0).
    const d = doc(
      [wire("a", p(0, 0), p(10, 0), p(10, 5), p(5, 5), p(5, -5))],
      [resistor("r1", 5, 3)],
    );
    expect(junctionDots(d)).toEqual([p(5, 0)]);
  });

  it("wire_end_plus_pass_through_same_wire_counts_one", () => {
    // Wire ends at (5,0) after passing through it: degree 1 (the end only), no dot.
    const d = doc([wire("a", p(0, 0), p(10, 0), p(10, 3), p(5, 3), p(5, 0))]);
    expect(junctionDots(d)).toEqual([]);
  });

  it("sorted_and_unique", () => {
    const d = doc([
      wire("a", p(0, 0), p(20, 0)),
      wire("b", p(15, 0), p(15, 5)),
      wire("c", p(5, 0), p(5, 5)),
      wire("d", p(15, -5), p(15, 0)),
    ]);
    expect(junctionDots(d)).toEqual([p(5, 0), p(15, 0)]);
  });
});
