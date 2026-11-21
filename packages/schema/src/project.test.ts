import { describe, expect, it } from "vitest";
import { newProject, parseProject, serializeProject } from "./project";

const base = () =>
  JSON.parse(serializeProject(newProject("Demo", "2026-11-21T00:00:00.000Z"))) as Record<
    string,
    unknown
  >;
const noop = (r: Record<string, unknown>) => r;

describe("project file", () => {
  it("accepts_new_project", () => {
    const r = parseProject(base());
    expect(r.ok).toBe(true);
  });

  it("roundtrip_serialize_parse", () => {
    const p = newProject("Demo", "2026-11-21T00:00:00.000Z");
    const text = serializeProject(p);
    expect(text.endsWith("\n")).toBe(true);
    const r = parseProject(JSON.parse(text));
    expect(r).toEqual({ ok: true, project: p });
    expect(serializeProject(p)).toBe(text);
  });

  it("rejects_wrong_format", () => {
    for (const raw of [null, 3, "x", [], { format: "other", formatVersion: 1 }]) {
      expect(parseProject(raw)).toEqual({ ok: false, error: "not a Nodal project file" });
    }
  });

  it("rejects_future_version", () => {
    const r = parseProject({ ...base(), formatVersion: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("format version 2");
  });

  it("rejects_non_integer_version", () => {
    for (const v of [1.5, "1", -1, null]) {
      expect(parseProject({ ...base(), formatVersion: v }).ok).toBe(false);
    }
  });

  it("applies_migrations_in_order", () => {
    const old = { ...base(), formatVersion: 0, title: "legacy" } as Record<string, unknown>;
    delete old["name"];
    const r = parseProject(old, {
      0: (raw) => {
        const { title, ...rest } = raw;
        return { ...rest, name: title, formatVersion: 1 };
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.name).toBe("legacy");
  });

  it("missing_migration_step_is_an_error", () => {
    const r = parseProject({ ...base(), formatVersion: 0 }, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("migration");
  });

  it("errors_when_migration_leaves_wrong_version", () => {
    expect(parseProject({ ...base(), formatVersion: 0 }, { 0: noop }).ok).toBe(false);
  });

  it("rejects_empty_analyses", () => {
    const b = base();
    expect(parseProject({ ...b, simulation: { analyses: [], options: {} } }).ok).toBe(false);
  });

  it("rejects_unknown_model_param", () => {
    const model = (type: string, params: Record<string, string>) => ({
      ...base(),
      models: [{ name: "M1", type, params }],
    });
    expect(parseProject(model("D", { BV: "5" })).ok).toBe(false);
    expect(parseProject(model("NMOS", { IS: "1e-14" })).ok).toBe(true);
  });

  it("rejects_duplicate_model_names_ignoring_case", () => {
    const r = parseProject({
      ...base(),
      models: [
        { name: "Dx", type: "D", params: {} },
        { name: "dX", type: "D", params: {} },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("reports_issue_path", () => {
    const r = parseProject({
      ...base(),
      schematic: {
        parts: [],
        wires: [
          {
            id: "w1",
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ],
        labels: [],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("schematic.wires.0");
  });
});
