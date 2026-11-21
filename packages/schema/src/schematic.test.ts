import { describe, expect, it } from "vitest";
import { EMPTY_SCHEMATIC, PART_TYPES, schematicSchema } from "./schematic";

function at<T>(items: T[], i: number): T {
  const item = items[i];
  if (item === undefined) throw new Error(`no item ${String(i)}`);
  return item;
}

function valid() {
  return {
    parts: PART_TYPES.map((type, i) => ({
      id: `p${String(i)}`,
      type,
      name: `X${String(i)}`,
      x: i * 10,
      y: -20,
      rotation: 0,
      mirror: false,
      params: { value: "1k" },
    })),
    wires: [
      {
        id: "w0",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 20 },
        ],
      },
    ],
    labels: [{ id: "l0", text: "vout", x: 10, y: 20, rotation: 90 }],
  };
}

function issuePaths(input: unknown): PropertyKey[][] {
  const r = schematicSchema.safeParse(input);
  if (r.success) throw new Error("accepted");
  return r.error.issues.map((i) => [...i.path]);
}

describe("schematicSchema", () => {
  it("accepts_valid_schematic", () => {
    expect(schematicSchema.safeParse(valid()).success).toBe(true);
    expect(schematicSchema.safeParse(EMPTY_SCHEMATIC).success).toBe(true);
  });

  it("rejects_diagonal_segment", () => {
    const s = valid();
    at(s.wires, 0).points[1] = { x: 10, y: 5 };
    at(s.wires, 0).points[2] = { x: 20, y: 20 };
    expect(issuePaths(s)).toContainEqual(["wires", 0, "points", 1]);
  });

  it("rejects_single_point_wire", () => {
    const s = valid();
    at(s.wires, 0).points = [{ x: 0, y: 0 }];
    expect(issuePaths(s)).toContainEqual(["wires", 0, "points"]);
  });

  it("rejects_repeated_point", () => {
    const s = valid();
    at(s.wires, 0).points[1] = { x: 0, y: 0 };
    at(s.wires, 0).points[2] = { x: 0, y: 20 };
    expect(issuePaths(s)).toContainEqual(["wires", 0, "points", 1]);
  });

  it("rejects_fractional_coordinate", () => {
    const s = valid();
    at(s.parts, 0).x = 1.5;
    expect(issuePaths(s)).toContainEqual(["parts", 0, "x"]);
  });

  it("rejects_duplicate_id_across_kinds", () => {
    const s = valid();
    at(s.wires, 0).id = "p0";
    expect(issuePaths(s)).toContainEqual(["wires", 0, "id"]);
  });

  it("rejects_unknown_part_type", () => {
    const s = valid();
    (at(s.parts, 0) as { type: string }).type = "memristor";
    expect(issuePaths(s)).toContainEqual(["parts", 0, "type"]);
  });

  it("rejects_rotation_45", () => {
    const s = valid();
    (at(s.parts, 0) as { rotation: number }).rotation = 45;
    expect(issuePaths(s)).toContainEqual(["parts", 0, "rotation"]);
  });

  it("rejects_extra_field", () => {
    const s = { ...valid(), extra: 1 };
    expect(issuePaths(s)).toContainEqual([]);
  });
});
