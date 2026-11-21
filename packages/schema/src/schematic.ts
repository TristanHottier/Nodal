// Schematic document (editor model). Coordinates are integer grid units.
// Part `params` hold raw strings; M5b parses them (ADR 0009).
import { z } from "zod";

export const PART_TYPES = [
  "resistor",
  "capacitor",
  "inductor",
  "vsource",
  "isource",
  "vcvs",
  "vccs",
  "ccvs",
  "cccs",
  "diode",
  "npn",
  "pnp",
  "nmos",
  "pmos",
  "switch",
  "opamp",
  "ground",
] as const;

export type PartType = (typeof PART_TYPES)[number];

const coordinate = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const id = z.string().min(1);
const rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

const point = z.strictObject({ x: coordinate, y: coordinate });

const part = z.strictObject({
  id,
  type: z.enum(PART_TYPES),
  name: z.string().min(1),
  x: coordinate,
  y: coordinate,
  rotation,
  mirror: z.boolean(),
  params: z.record(z.string(), z.string()),
});

const wire = z.strictObject({ id, points: z.array(point).min(2) });

const netLabel = z.strictObject({
  id,
  text: z.string().min(1),
  x: coordinate,
  y: coordinate,
  rotation,
});

export const schematicSchema = z
  .strictObject({
    parts: z.array(part),
    wires: z.array(wire),
    labels: z.array(netLabel),
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>();
    const checkId = (kind: "parts" | "wires" | "labels", items: { id: string }[]) => {
      items.forEach((item, i) => {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: "custom",
            path: [kind, i, "id"],
            message: `duplicate id "${item.id}"`,
          });
        }
        seen.add(item.id);
      });
    };
    checkId("parts", s.parts);
    checkId("wires", s.wires);
    checkId("labels", s.labels);

    s.wires.forEach((w, wi) => {
      for (let i = 1; i < w.points.length; i++) {
        const a = w.points[i - 1];
        const b = w.points[i];
        if (!a || !b) continue;
        const path = ["wires", wi, "points", i];
        if (a.x === b.x && a.y === b.y) {
          ctx.addIssue({ code: "custom", path, message: "repeats the previous point" });
        } else if (a.x !== b.x && a.y !== b.y) {
          ctx.addIssue({ code: "custom", path, message: "segment must be horizontal or vertical" });
        }
      }
    });
  });

export type Rotation = z.infer<typeof rotation>;
export type Point = z.infer<typeof point>;
export type Part = z.infer<typeof part>;
export type Wire = z.infer<typeof wire>;
export type NetLabel = z.infer<typeof netLabel>;
export type Schematic = z.infer<typeof schematicSchema>;

export const EMPTY_SCHEMATIC: Readonly<Schematic> = Object.freeze({
  parts: [],
  wires: [],
  labels: [],
});
