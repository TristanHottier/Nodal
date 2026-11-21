// Test helpers: build schematics and projects without the editor UI.
import type { PartType, Point, Project, Rotation, Schematic } from "@nodal/schema";
import { newProject } from "@nodal/schema";
import { pinPositions } from "../editor/geometry";
import { addLabel, addPart, addWire } from "../editor/model/edits";

let counter = 0;
export const nid = (): string => `t${String(++counter)}`;
export const pt = (x: number, y: number): Point => ({ x, y });

export const emptyDoc = (): Schematic => ({ parts: [], wires: [], labels: [] });

export interface PutOptions {
  rotation?: Rotation;
  params?: Record<string, string>;
  name?: string;
  id?: string;
}

/** Add a part, optionally overriding its name and parameters. */
export function put(
  doc: Schematic,
  type: PartType,
  at: Point,
  opts: PutOptions = {},
): { doc: Schematic; id: string } {
  const id = opts.id ?? nid();
  const added = addPart(doc, id, type, at, opts.rotation ?? 0, false);
  return {
    id,
    doc: {
      ...added,
      parts: added.parts.map((p) =>
        p.id === id
          ? { ...p, name: opts.name ?? p.name, params: { ...p.params, ...opts.params } }
          : p,
      ),
    },
  };
}

/** Add a label with the given text. */
export function label(doc: Schematic, at: Point, text: string, id = nid()): Schematic {
  const added = addLabel(doc, id, at, 0);
  return { ...added, labels: added.labels.map((l) => (l.id === id ? { ...l, text } : l)) };
}

export function wire(doc: Schematic, ...points: Point[]): Schematic {
  return addWire(doc, nid(), points);
}

/** Put a part and a label on each named pin. */
export function putTagged(
  doc: Schematic,
  type: PartType,
  at: Point,
  tags: Record<string, string>,
  opts: PutOptions = {},
): { doc: Schematic; id: string } {
  const r = put(doc, type, at, opts);
  const part = r.doc.parts.find((p) => p.id === r.id);
  if (!part) throw new Error("part missing");
  let d = r.doc;
  for (const pin of pinPositions(part)) {
    const text = tags[pin.name];
    if (text !== undefined) d = label(d, pin.at, text);
  }
  return { doc: d, id: r.id };
}

export function project(schematic: Schematic): Project {
  return { ...newProject("T", "2026-01-01T00:00:00.000Z"), schematic };
}

/** Put a part and label every pin `<partName>_<pinName>`. */
export function putAll(
  doc: Schematic,
  type: PartType,
  at: Point,
  opts: PutOptions = {},
): { doc: Schematic; id: string } {
  const r = put(doc, type, at, opts);
  const part = r.doc.parts.find((p) => p.id === r.id);
  if (!part) throw new Error("part missing");
  let d = r.doc;
  for (const pin of pinPositions(part)) d = label(d, pin.at, `${part.name}_${pin.name}`);
  return { doc: d, id: r.id };
}
