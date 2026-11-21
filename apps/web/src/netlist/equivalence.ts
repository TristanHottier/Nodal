// Netlist equivalence: same circuit up to element order, name case and a bijective node renaming.
import type { Netlist, NetlistElement } from "@nodal/schema";

const lower = (s: string): string => s.toLowerCase();

/** Structural equality; numbers compare with `===`, absent and undefined keys are equal. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => deepEqual(x, b[i]))
    );
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
    return [...keys].every((k) => deepEqual(ra[k], rb[k]));
  }
  return a === b;
}

const show = (v: unknown): string => (v === undefined ? "undefined" : JSON.stringify(v));

class NodeMap {
  private readonly forward = new Map<string, string>([["0", "0"]]);
  private readonly backward = new Map<string, string>([["0", "0"]]);

  /** Returns an error text when `a` and `b` cannot correspond. */
  link(a: string, b: string): string | undefined {
    const x = lower(a);
    const y = lower(b);
    const f = this.forward.get(x);
    const g = this.backward.get(y);
    if (f !== undefined && f !== y)
      return `node ${a} is already ${f} in the other netlist, not ${b}`;
    if (g !== undefined && g !== x)
      return `node ${b} is already ${g} in the other netlist, not ${a}`;
    this.forward.set(x, y);
    this.backward.set(y, x);
    return undefined;
  }
}

function nodesOf(e: NetlistElement, key: "nodes" | "controlNodes"): readonly string[] {
  return key in e ? ((e as Record<string, unknown>)[key] as string[]) : [];
}

function compareElement(a: NetlistElement, b: NetlistElement, map: NodeMap, out: string[]): void {
  if (a.kind !== b.kind) {
    out.push(`${a.name}: kind ${a.kind} vs ${b.kind}`);
    return;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const skip = new Set(["name", "nodes", "controlNodes"]);
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (!skip.has(k) && !deepEqual(ra[k], rb[k])) {
      out.push(`${a.name} ${k}: ${show(ra[k])} vs ${show(rb[k])}`);
    }
  }
  for (const key of ["nodes", "controlNodes"] as const) {
    const na = nodesOf(a, key);
    const nb = nodesOf(b, key);
    na.forEach((n, i) => {
      const other = nb[i];
      if (other === undefined) return;
      const err = map.link(n, other);
      if (err !== undefined) out.push(`${a.name} ${key}[${String(i)}]: ${err}`);
    });
  }
}

/** Differences between two parsed netlists; empty when they describe the same circuit. */
export function compareNetlists(a: Netlist, b: Netlist): string[] {
  const out: string[] = [];
  if (a.title !== b.title) out.push(`title: ${show(a.title)} vs ${show(b.title)}`);

  const byName = (n: Netlist): Map<string, NetlistElement> =>
    new Map(n.elements.map((e) => [lower(e.name), e]));
  const ea = byName(a);
  const eb = byName(b);
  const map = new NodeMap();
  for (const [key, ela] of ea) {
    const elb = eb.get(key);
    if (!elb) out.push(`element ${ela.name} is missing from the second netlist`);
    else compareElement(ela, elb, map, out);
  }
  for (const [key, elb] of eb) {
    if (!ea.has(key)) out.push(`element ${elb.name} is not in the first netlist`);
  }

  const ma = new Map(a.models.map((m) => [lower(m.name), m]));
  const mb = new Map(b.models.map((m) => [lower(m.name), m]));
  for (const [key, m] of ma) {
    const other = mb.get(key);
    if (!other) out.push(`model ${m.name} is missing from the second netlist`);
    else {
      if (m.type !== other.type) out.push(`model ${m.name} type: ${m.type} vs ${other.type}`);
      if (!deepEqual(m.params, other.params)) {
        out.push(`model ${m.name} params: ${show(m.params)} vs ${show(other.params)}`);
      }
    }
  }
  for (const [key, m] of mb) {
    if (!ma.has(key)) out.push(`model ${m.name} is not in the first netlist`);
  }

  if (!deepEqual(a.analyses, b.analyses)) {
    out.push(`analyses: ${show(a.analyses)} vs ${show(b.analyses)}`);
  }
  if (!deepEqual(a.options, b.options)) {
    out.push(`options: ${show(a.options)} vs ${show(b.options)}`);
  }
  return out;
}
