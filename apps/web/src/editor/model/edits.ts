// Pure edit operations on the schematic document. Every function returns the
// input object (`===`) when nothing changes, so the store can skip history.
import {
  type NetLabel,
  type Part,
  type PartType,
  type Point,
  type Rotation,
  type Schematic,
  type Wire,
} from "@nodal/schema";
import { produce } from "immer";
import { SYMBOLS } from "../../symbols/catalog";
import { pinPositions, rotateCw } from "../geometry";
import { nextLabelText, nextName } from "./naming";
import { followEnd, normalizeWire } from "./wires";

export interface Clip {
  parts: Part[];
  wires: Wire[];
  labels: NetLabel[];
}

interface Displacement {
  from: Point;
  to: Point;
}

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const plain = (p: Point): Point => ({ x: p.x, y: p.y });

export function addPart(
  doc: Schematic,
  id: string,
  type: PartType,
  at: Point,
  rotation: Rotation,
  mirror: boolean,
): Schematic {
  const def = SYMBOLS[type];
  return produce(doc, (d) => {
    d.parts.push({
      id,
      type,
      name: nextName(doc, def.prefix),
      x: at.x,
      y: at.y,
      rotation,
      mirror,
      params: { ...def.defaultParams },
    });
  });
}

export function addLabel(doc: Schematic, id: string, at: Point, rotation: Rotation): Schematic {
  return produce(doc, (d) => {
    d.labels.push({ id, text: nextLabelText(doc), x: at.x, y: at.y, rotation });
  });
}

export function addWire(doc: Schematic, id: string, points: Point[]): Schematic {
  const norm = normalizeWire(points);
  if (!norm) return doc;
  return produce(doc, (d) => {
    d.wires.push({ id, points: norm });
  });
}

/**
 * Unselected wires whose ends sit on an old pin or label anchor follow it.
 * Both ends following by the same delta translate the whole wire.
 */
function followWires(d: Schematic, selected: ReadonlySet<string>, moves: Displacement[]): void {
  if (moves.length === 0) return;
  const find = (at: Point | undefined) => (at ? moves.find((m) => same(m.from, at)) : undefined);
  const removed = new Set<string>();
  for (const w of d.wires) {
    if (selected.has(w.id)) continue;
    const pts = w.points.map(plain);
    const first = pts[0];
    const last = pts[pts.length - 1];
    const ms = find(first);
    const me = find(last);
    if (!ms && !me) continue;
    if (ms && me) {
      const dx = ms.to.x - ms.from.x;
      const dy = ms.to.y - ms.from.y;
      if (dx === me.to.x - me.from.x && dy === me.to.y - me.from.y) {
        w.points = pts.map((q) => ({ x: q.x + dx, y: q.y + dy }));
        continue;
      }
    }
    let cur: Point[] | null = pts;
    if (ms) cur = followEnd(cur, "start", ms.to);
    if (me && cur) cur = followEnd(cur, "end", me.to);
    if (cur) w.points = cur;
    else removed.add(w.id);
  }
  if (removed.size > 0) d.wires = d.wires.filter((w) => !removed.has(w.id));
}

function pinMoves(before: Part, after: Part): Displacement[] {
  const a = pinPositions(before);
  const b = pinPositions(after);
  const out: Displacement[] = [];
  a.forEach((pin, i) => {
    const to = b[i]?.at;
    if (to && !same(pin.at, to)) out.push({ from: pin.at, to });
  });
  return out;
}

export function moveItems(doc: Schematic, ids: readonly string[], delta: Point): Schematic {
  if (delta.x === 0 && delta.y === 0) return doc;
  const sel = new Set(ids);
  const moves: Displacement[] = [];
  let hit = false;
  for (const part of doc.parts) {
    if (!sel.has(part.id)) continue;
    hit = true;
    moves.push(...pinMoves(part, { ...part, x: part.x + delta.x, y: part.y + delta.y }));
  }
  for (const l of doc.labels) {
    if (!sel.has(l.id)) continue;
    hit = true;
    moves.push({ from: { x: l.x, y: l.y }, to: { x: l.x + delta.x, y: l.y + delta.y } });
  }
  if (!hit && !doc.wires.some((w) => sel.has(w.id))) return doc;
  return produce(doc, (d) => {
    for (const p of d.parts) {
      if (!sel.has(p.id)) continue;
      p.x += delta.x;
      p.y += delta.y;
    }
    for (const l of d.labels) {
      if (!sel.has(l.id)) continue;
      l.x += delta.x;
      l.y += delta.y;
    }
    for (const w of d.wires) {
      if (!sel.has(w.id)) continue;
      w.points = w.points.map((q) => ({ x: q.x + delta.x, y: q.y + delta.y }));
    }
    followWires(d, sel, moves);
  });
}

function reshapeParts(
  doc: Schematic,
  ids: readonly string[],
  mapPart: (p: Part) => Part,
  mapLabel: ((l: NetLabel) => NetLabel) | null,
): Schematic {
  const sel = new Set(ids);
  const parts = doc.parts.filter((p) => sel.has(p.id));
  const labels = mapLabel ? doc.labels.filter((l) => sel.has(l.id)) : [];
  if (parts.length === 0 && labels.length === 0) return doc;
  const moves = parts.flatMap((p) => pinMoves(p, mapPart(p)));
  return produce(doc, (d) => {
    for (const p of d.parts) {
      if (sel.has(p.id)) Object.assign(p, mapPart(p));
    }
    if (mapLabel) {
      for (const l of d.labels) {
        if (sel.has(l.id)) Object.assign(l, mapLabel(l));
      }
    }
    followWires(d, sel, moves);
  });
}

/** Rotates selected parts and labels 90 degrees clockwise about their own origin. */
export function rotateItems(doc: Schematic, ids: readonly string[]): Schematic {
  return reshapeParts(
    doc,
    ids,
    (p) => ({ ...p, rotation: rotateCw(p.rotation) }),
    (l) => ({ ...l, rotation: rotateCw(l.rotation) }),
  );
}

/** Toggles `mirror` on selected parts; labels are unchanged. */
export function mirrorItems(doc: Schematic, ids: readonly string[]): Schematic {
  return reshapeParts(doc, ids, (p) => ({ ...p, mirror: !p.mirror }), null);
}

export function deleteItems(doc: Schematic, ids: readonly string[]): Schematic {
  const sel = new Set(ids);
  const any =
    doc.parts.some((p) => sel.has(p.id)) ||
    doc.wires.some((w) => sel.has(w.id)) ||
    doc.labels.some((l) => sel.has(l.id));
  if (!any) return doc;
  return produce(doc, (d) => {
    d.parts = d.parts.filter((p) => !sel.has(p.id));
    d.wires = d.wires.filter((w) => !sel.has(w.id));
    d.labels = d.labels.filter((l) => !sel.has(l.id));
  });
}

export function copyItems(doc: Schematic, ids: readonly string[]): Clip | null {
  const sel = new Set(ids);
  const clip: Clip = {
    parts: doc.parts.filter((p) => sel.has(p.id)).map((p) => ({ ...p, params: { ...p.params } })),
    wires: doc.wires
      .filter((w) => sel.has(w.id))
      .map((w) => ({ id: w.id, points: w.points.map(plain) })),
    labels: doc.labels.filter((l) => sel.has(l.id)).map((l) => ({ ...l })),
  };
  return clip.parts.length + clip.wires.length + clip.labels.length === 0 ? null : clip;
}

/** Adds copies of the clip with fresh ids, fresh part names and everything shifted by `offset`. */
export function pasteClip(
  doc: Schematic,
  clip: Clip,
  newId: () => string,
  offset: Point,
): { doc: Schematic; ids: string[] } {
  const out: string[] = [];
  const parts: Part[] = [];
  for (const p of clip.parts) {
    const id = newId();
    out.push(id);
    const name = nextName(
      { parts: [...doc.parts, ...parts], wires: [], labels: [] },
      SYMBOLS[p.type].prefix,
    );
    parts.push({
      ...p,
      id,
      name,
      x: p.x + offset.x,
      y: p.y + offset.y,
      params: { ...p.params },
    });
  }
  const wires: Wire[] = clip.wires.map((w) => {
    const id = newId();
    out.push(id);
    return { id, points: w.points.map((q) => ({ x: q.x + offset.x, y: q.y + offset.y })) };
  });
  const labels: NetLabel[] = clip.labels.map((l) => {
    const id = newId();
    out.push(id);
    return { ...l, id, x: l.x + offset.x, y: l.y + offset.y };
  });
  if (out.length === 0) return { doc, ids: [] };
  const next = produce(doc, (d) => {
    d.parts.push(...parts);
    d.wires.push(...wires);
    d.labels.push(...labels);
  });
  return { doc: next, ids: out };
}
