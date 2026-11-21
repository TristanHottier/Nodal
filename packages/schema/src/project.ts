// Project file (`.nodal.json`), format version 1. See docs/ARCHITECTURE.md section 7.
import { z } from "zod";
import { PROJECT_FORMAT, PROJECT_FORMAT_VERSION } from "./constants";
import type { Analysis, SimOptions } from "./ir";
import { analysisSchema, modelNameRegex, optionsSchema } from "./ir";
import { MODEL_KINDS, PARAM_SPECS } from "./models";
import type { Schematic } from "./schematic";
import { schematicSchema } from "./schematic";

const modelSchema = z
  .strictObject({
    name: z.string().regex(modelNameRegex, { error: "must match ^[A-Za-z][A-Za-z0-9_]*$" }),
    type: z.enum(MODEL_KINDS),
    // Raw strings as typed by the user; the netlister parses them.
    params: z.record(z.string(), z.string()),
  })
  .superRefine((m, ctx) => {
    const allowed = PARAM_SPECS[m.type].map((s) => s.key);
    for (const key of Object.keys(m.params)) {
      if (!allowed.includes(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["params", key],
          message: `unsupported parameter ${key} for model type ${m.type}`,
        });
      }
    }
  });

export const projectSchema = z.strictObject({
  format: z.literal(PROJECT_FORMAT),
  formatVersion: z.literal(PROJECT_FORMAT_VERSION),
  name: z.string().min(1),
  createdAt: z.iso.datetime(),
  schematic: schematicSchema,
  models: z.array(modelSchema).superRefine((models, ctx) => {
    const seen = new Set<string>();
    models.forEach((m, i) => {
      const key = m.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [i, "name"],
          message: `model names must be unique ignoring case: ${m.name}`,
        });
      }
      seen.add(key);
    });
  }),
  simulation: z.strictObject({
    analyses: z.array(analysisSchema).min(1),
    options: optionsSchema,
  }),
});

export type ProjectModel = z.output<typeof modelSchema>;
export type Project = {
  format: typeof PROJECT_FORMAT;
  formatVersion: typeof PROJECT_FORMAT_VERSION;
  name: string;
  createdAt: string;
  schematic: Schematic;
  models: ProjectModel[];
  simulation: { analyses: Analysis[]; options: SimOptions };
};

export type ProjectParseResult = { ok: true; project: Project } | { ok: false; error: string };
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Migration `n` turns a version-`n` file into version `n + 1`. Empty until format version 2 exists. */
const MIGRATIONS: Readonly<Record<number, Migration>> = {};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Validate a decoded `.nodal.json` value, migrating older versions. Never throws. */
export function parseProject(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): ProjectParseResult {
  if (!isRecord(raw) || raw["format"] !== PROJECT_FORMAT) {
    return { ok: false, error: "not a Nodal project file" };
  }
  const version = raw["formatVersion"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    return { ok: false, error: "formatVersion must be a non-negative integer" };
  }
  if (version > PROJECT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `this file was saved by a newer version of Nodal (format version ${String(version)}); this version reads up to ${String(PROJECT_FORMAT_VERSION)}`,
    };
  }
  let current: Record<string, unknown> = raw;
  try {
    for (let v = version; v < PROJECT_FORMAT_VERSION; v++) {
      const step = migrations[v];
      if (!step) {
        return {
          ok: false,
          error: `no migration from format version ${String(v)} to ${String(v + 1)}`,
        };
      }
      current = step(current);
    }
  } catch (e) {
    return { ok: false, error: `migration failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (current["formatVersion"] !== PROJECT_FORMAT_VERSION) {
    return { ok: false, error: "migration did not produce the current format version" };
  }
  const r = projectSchema.safeParse(current);
  if (r.success) return { ok: true, project: r.data };
  const issue = r.error.issues[0];
  if (!issue) return { ok: false, error: "invalid project file" };
  return { ok: false, error: `${issue.path.map(String).join(".")}: ${issue.message}` };
}

/** Stable text form: key order as built, two-space indent, trailing newline. */
export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2) + "\n";
}

export function newProject(name: string, createdAt: string): Project {
  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    name,
    createdAt,
    schematic: { parts: [], wires: [], labels: [] },
    models: [],
    simulation: { analyses: [{ type: "op" }], options: optionsSchema.parse({}) },
  };
}
