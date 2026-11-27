// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PARAM_SPECS } from "@nodal/schema";
import { describe, expect, it } from "vitest";
import { inferKind, renderEntry } from "../../build/codexMarkdown";
import { CODEX } from "./catalog";
import { loadEntry } from "./entries";

const DIR = fileURLToPath(new URL("./entries/", import.meta.url));
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.slice(0, -3))
  .sort();
const source = (id: string): string => readFileSync(`${DIR}${id}.md`, "utf8");

/** Backticked names that look like model keys but are not parameters. */
const ALLOWED_TOKENS = new Set(["NPN", "PNP", "NMOS", "PMOS", "DC", "AC", "MNA"]);

/**
 * The field labels of the analysis and options forms. No component exports them as a
 * constant, so they are read from the two .tsx files as text: `label="..."` props, the
 * `key: "..."` rows that OptionsFields maps to labels, and the plain "uic" checkbox label.
 */
const SIM_DIR = fileURLToPath(new URL("../simulation/", import.meta.url));
const LABELS = new Set(
  ["AnalysisFields.tsx", "OptionsFields.tsx"].flatMap((f) => {
    const text = readFileSync(`${SIM_DIR}${f}`, "utf8");
    return [
      ...[...text.matchAll(/label="([a-z][a-zA-Z]*)"/g)].map((m) => m[1] ?? ""),
      ...[...text.matchAll(/key: "([a-z][a-zA-Z]*)"/g)].map((m) => m[1] ?? ""),
      ...[...text.matchAll(/>\s*([a-z][a-zA-Z]*)\s*<\/label>/g)].map((m) => m[1] ?? ""),
    ];
  }),
);
/** Option values (not labels) the Settings prose may quote. */
const VALUES = new Set(["lin", "dec", "oct", "trap", "gear"]);

describe("codex entries", () => {
  it("has a file for every catalog id and a catalog id for every file", () => {
    expect(FILES).toEqual(CODEX.map((e) => e.id).sort());
  });

  it.each(CODEX.map((e) => [e.id, e] as const))("%s renders with its catalog title", (id, meta) => {
    const out = renderEntry(source(id), meta.kind, id);
    expect(out.title).toBe(meta.title);
    expect(inferKind(source(id), id)).toBe(meta.kind);
  });

  it.each(CODEX.filter((e) => e.kind === "part" && e.model !== undefined))(
    "$id names only real model parameters",
    (meta) => {
      if (meta.model === undefined) return;
      const keys = new Set(PARAM_SPECS[meta.model].map((s) => s.key));
      const tokens = [...source(meta.id).matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
      for (const t of tokens.filter((x) => /^[A-Z][A-Z0-9]{1,5}$/.test(x))) {
        expect(keys.has(t) || ALLOWED_TOKENS.has(t), `${meta.id}: ${t}`).toBe(true);
      }
    },
  );

  it("loads an entry through the ?codex module", async () => {
    const entry = await loadEntry("resistor");
    expect(entry.title).toBe("Resistor");
    expect(entry.html).toContain('id="what-it-is"');
  });

  it("rejects an unknown id", async () => {
    await expect(loadEntry("no-such-entry")).rejects.toThrow(/no-such-entry/);
  });

  it("no entry body contains TODO", () => {
    for (const id of FILES) expect(source(id), id).not.toMatch(/TODO/);
  });

  it.each(CODEX.filter((e) => e.analysis !== undefined))(
    "$id names only real settings labels",
    (meta) => {
      const section =
        /^## Settings\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(source(meta.id))?.[1] ?? "";
      expect(section, `${meta.id}: no Settings section`).not.toBe("");
      const tokens = [...section.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
      for (const t of tokens.filter((x) => /^[a-z][a-zA-Z]*$/.test(x))) {
        expect(LABELS.has(t) || VALUES.has(t), `${meta.id}: ${t}`).toBe(true);
      }
    },
  );
});
