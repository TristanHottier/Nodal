// Net extraction: union-find over pins, wires and label anchors, then net naming.
// Rules: docs/ARCHITECTURE.md sections 6.1 and 6.2.
import type { Point, Schematic } from "@nodal/schema";
import { nodeNameRegex } from "@nodal/schema";
import { pinPositions } from "../editor/geometry";
import { pointOnWire } from "../editor/model/connectivity";
import type { Diagnostic } from "./diagnostics";

class UnionFind {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(a: number): number {
    let root = a;
    for (;;) {
      const p = this.parent[root] ?? root;
      if (p === root) return root;
      root = p;
    }
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

export interface NetResult {
  /** Key `<partId>:<pinName>`, value the net name (`"0"` for ground). */
  netOfPin: Map<string, string>;
  diagnostics: Diagnostic[];
}

const key = (p: Point): string => `${String(p.x)},${String(p.y)}`;
const lower = (s: string): string => s.toLowerCase();

function labelProblem(text: string): string | undefined {
  if (!nodeNameRegex.test(text)) return "must use only letters, digits and underscore";
  if (text === "0" || lower(text) === "gnd") return "is reserved for ground";
  return undefined;
}

/** Generated name: N001 ... N999, then N1000 and up. */
const generated = (n: number): string => `N${String(n).padStart(3, "0")}`;

export function buildNets(doc: Schematic): NetResult {
  const diagnostics: Diagnostic[] = [];
  const pins = doc.parts.flatMap((part) =>
    pinPositions(part).map((pin) => ({
      id: `${part.id}:${pin.name}`,
      at: pin.at,
      ground: part.type === "ground",
    })),
  );
  const wireBase = pins.length;
  const labelBase = wireBase + doc.wires.length;
  const uf = new UnionFind(labelBase + doc.labels.length);

  // Everything at one connection point joins; a wire joins if the point lies anywhere on it.
  const members = new Map<string, { at: Point; ids: number[] }>();
  const touch = (at: Point, id: number): void => {
    const k = key(at);
    const entry = members.get(k) ?? { at, ids: [] };
    entry.ids.push(id);
    members.set(k, entry);
  };
  pins.forEach((pin, i) => {
    touch(pin.at, i);
  });
  doc.labels.forEach((l, i) => {
    touch({ x: l.x, y: l.y }, labelBase + i);
  });
  doc.wires.forEach((w, i) => {
    const first = w.points[0];
    const last = w.points[w.points.length - 1];
    if (first) touch(first, wireBase + i);
    if (last) touch(last, wireBase + i);
  });
  for (const { at, ids } of members.values()) {
    const [head, ...rest] = ids;
    if (head === undefined) continue;
    for (const id of rest) uf.union(head, id);
    doc.wires.forEach((w, i) => {
      if (pointOnWire(w, at)) uf.union(head, wireBase + i);
    });
  }

  // Ground is global.
  const groundPins = pins.flatMap((p, i) => (p.ground ? [i] : []));
  for (const g of groundPins) uf.union(groundPins[0] ?? g, g);

  // Valid labels with equal text, ignoring case, name one net.
  const firstWithText = new Map<string, number>();
  const validLabels: number[] = [];
  doc.labels.forEach((l, i) => {
    const problem = labelProblem(l.text);
    if (problem !== undefined) {
      diagnostics.push({
        severity: "error",
        code: "bad-label",
        message: `label "${l.text}" ${problem}`,
        itemIds: [l.id],
      });
      return;
    }
    validLabels.push(i);
    const first = firstWithText.get(lower(l.text));
    if (first === undefined) firstWithText.set(lower(l.text), i);
    else uf.union(labelBase + first, labelBase + i);
  });

  const pinsOfNet = new Map<number, number[]>();
  pins.forEach((_, i) => {
    const root = uf.find(i);
    pinsOfNet.set(root, [...(pinsOfNet.get(root) ?? []), i]);
  });
  const labelsOfNet = new Map<number, number[]>();
  for (const i of validLabels) {
    const root = uf.find(labelBase + i);
    labelsOfNet.set(root, [...(labelsOfNet.get(root) ?? []), i]);
  }

  const nameOfNet = new Map<number, string>();
  for (const [root, netPins] of pinsOfNet) {
    const labels = labelsOfNet.get(root) ?? [];
    const texts = labels.map((i) => doc.labels[i]?.text ?? "");
    const itemIds = labels.map((i) => doc.labels[i]?.id ?? "");
    const isGround = netPins.some((i) => pins[i]?.ground);
    if (isGround) {
      nameOfNet.set(root, "0");
      if (labels.length > 0) {
        diagnostics.push({
          severity: "error",
          code: "label-conflict",
          message: `net label ${texts.join(", ")} is on the ground net`,
          itemIds,
        });
      }
    } else if (labels.length > 0) {
      nameOfNet.set(root, texts[0] ?? "");
      if (new Set(texts.map(lower)).size > 1) {
        diagnostics.push({
          severity: "error",
          code: "label-conflict",
          message: `one net carries different labels: ${texts.join(", ")}`,
          itemIds,
        });
      }
    }
  }

  const taken = new Set(doc.labels.map((l) => lower(l.text)));
  let counter = 0;
  const netOfPin = new Map<string, string>();
  pins.forEach((pin, i) => {
    const root = uf.find(i);
    let name = nameOfNet.get(root);
    if (name === undefined) {
      do name = generated(++counter);
      while (taken.has(lower(name)));
      nameOfNet.set(root, name);
    }
    netOfPin.set(pin.id, name);
  });
  return { netOfPin, diagnostics };
}
