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

  // Task 10 turns this on once the prose replaces the stubs.
  it.todo("no entry body still contains TODO");
});
