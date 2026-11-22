// Project to netlist IR. Pure; the editor never builds netlists itself.
import type { Netlist, Part, Project } from "@nodal/schema";
import { IR_VERSION, parseNetlist } from "@nodal/schema";
import { SYMBOLS } from "../symbols/catalog";
import type { Diagnostic } from "./diagnostics";
import type { RawElement } from "./elements";
import { irName, partToElement } from "./elements";
import { buildNets } from "./nets";
import { parseValue } from "./value";

export type { Diagnostic, DiagnosticCode } from "./diagnostics";

export interface NetlistResult {
  /** Null whenever an error diagnostic exists. */
  ir: Netlist | null;
  diagnostics: Diagnostic[];
}

const lower = (s: string): string => s.toLowerCase();

function convertModels(project: Project, diagnostics: Diagnostic[]) {
  return project.models.map((m) => {
    const params: Record<string, number> = {};
    for (const [key, raw] of Object.entries(m.params)) {
      if (raw.trim() === "") continue;
      const r = parseValue(raw);
      if (r.ok) params[key] = r.value;
      else {
        diagnostics.push({
          severity: "error",
          code: "invalid-model",
          message: `model ${m.name} ${key}: ${r.error}`,
          itemIds: [],
        });
      }
    }
    return { name: m.name, type: m.type, params };
  });
}

function checkSweeps(project: Project, diagnostics: Diagnostic[]): void {
  const sources = project.schematic.parts.filter(
    (p) => p.type === "vsource" || p.type === "isource",
  );
  for (const a of project.simulation.analyses) {
    if (a.type !== "dc" || sources.some((p) => p.name === a.source)) continue;
    const near = sources.find((p) => lower(p.name) === lower(a.source));
    diagnostics.push({
      severity: "error",
      code: "unknown-sweep-source",
      message: `DC sweep source ${a.source} is not a voltage or current source in this schematic`,
      itemIds: near ? [near.id] : [],
    });
  }
}

function checkDuplicates(named: { part: Part; element: RawElement }[], out: Diagnostic[]): void {
  const groups = new Map<string, Part[]>();
  for (const { part, element } of named) {
    const key = lower(element.name);
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    out.push({
      severity: "error",
      code: "duplicate-name",
      message: `duplicate element name ignoring case: ${parts.map(irName).join(", ")}`,
      itemIds: parts.map((p) => p.id).sort(),
    });
  }
}

function checkConnections(
  doc: Project["schematic"],
  netOfPin: ReadonlyMap<string, string>,
  out: Diagnostic[],
): void {
  const pinCount = new Map<string, number>();
  for (const name of netOfPin.values()) pinCount.set(name, (pinCount.get(name) ?? 0) + 1);
  for (const part of doc.parts) {
    if (part.type === "ground") continue;
    const alone = SYMBOLS[part.type].pins.filter(
      (p) => pinCount.get(netOfPin.get(`${part.id}:${p.name}`) ?? "") === 1,
    );
    if (alone.length === SYMBOLS[part.type].pins.length) {
      out.push({
        severity: "warning",
        code: "unconnected-part",
        message: `${part.name} is not connected to anything`,
        itemIds: [part.id],
      });
    } else {
      for (const pin of alone) {
        out.push({
          severity: "warning",
          code: "dangling-pin",
          message: `${part.name} pin ${pin.name} is not connected to anything`,
          itemIds: [part.id],
        });
      }
    }
  }
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One `parseNetlist` issue as a diagnostic. `elements.<i>` paths name the part that
 * produced element i; the internal path is dropped from the message.
 */
function irIssue(issue: string, named: readonly { part: Part }[]): Diagnostic {
  const m = /^(?:(elements|models)\.(\d+)[^:]*: )?(.*)$/s.exec(issue);
  const text = (m?.[3] ?? issue).replace(/^element (\S+): /, "$1 ");
  const part = m?.[1] === "elements" ? named[Number(m[2])]?.part : undefined;
  return {
    severity: "error",
    code: "ir-invalid",
    message: capitalize(text),
    itemIds: part ? [part.id] : [],
  };
}

export function projectToNetlist(project: Project): NetlistResult {
  const doc = project.schematic;
  if (doc.parts.length === 0 && doc.wires.length === 0 && doc.labels.length === 0) {
    return { ir: null, diagnostics: [] };
  }
  const diagnostics: Diagnostic[] = [];
  const nets = buildNets(doc);
  diagnostics.push(...nets.diagnostics);

  const named: { part: Part; element: RawElement }[] = [];
  const ctx = {
    netOfPin: nets.netOfPin,
    models: project.models,
    parts: doc.parts,
    report: (d: Diagnostic) => diagnostics.push(d),
  };
  for (const part of doc.parts) {
    const element = partToElement(part, ctx);
    if (element) named.push({ part, element });
  }
  checkDuplicates(named, diagnostics);
  if (!doc.parts.some((p) => p.type === "ground")) {
    diagnostics.push({
      severity: "error",
      code: "no-ground",
      message: "the schematic has no ground symbol",
      itemIds: [],
    });
  }
  for (const { part, element } of named) {
    if (element.kind === "Q" || element.kind === "M") continue;
    if (element.nodes[0] === element.nodes[1]) {
      diagnostics.push({
        severity: "error",
        code: "shorted-element",
        message: `${part.name} has both terminals on net ${element.nodes[0] ?? ""}`,
        itemIds: [part.id],
      });
    }
  }
  const models = convertModels(project, diagnostics);
  checkSweeps(project, diagnostics);
  checkConnections(doc, nets.netOfPin, diagnostics);

  if (diagnostics.some((d) => d.severity === "error")) return { ir: null, diagnostics };
  const parsed = parseNetlist({
    irVersion: IR_VERSION,
    title: project.name,
    elements: named.map((n) => n.element),
    models,
    analyses: project.simulation.analyses,
    options: project.simulation.options,
  });
  if (!parsed.ok) {
    for (const issue of parsed.issues) diagnostics.push(irIssue(issue, named));
    return { ir: null, diagnostics };
  }
  return { ir: parsed.value, diagnostics };
}
