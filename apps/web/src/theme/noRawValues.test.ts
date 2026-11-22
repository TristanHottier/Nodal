// @vitest-environment node
// Guard for ADR 0012: colors and sizes live in tokens.css only.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Files exempt from every check: the token source and the color helper. */
const EXEMPT = new Set(["theme/tokens.css", "theme/color.ts"]);

/**
 * Files that still hold raw color literals until the canvas and waveform restyles land.
 * Tasks 4 (canvas) and 5 (waveform) must empty this set.
 */
const PENDING = new Set([
  "waveform/Plot.tsx", // TRACE_COLORS, CURSOR_COLORS and grid stroke: Task 5
  "waveform/WaveformPanel.tsx", // trace color fallbacks: Task 5
]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SRC)
  .map((p) => ({ path: p, rel: relative(SRC, p).split(sep).join("/") }))
  .filter(({ rel }) => /\.(css|ts|tsx)$/.test(rel))
  .filter(({ rel }) => !EXEMPT.has(rel) && !/\.test\.tsx?$/.test(rel));

function offenders(pattern: RegExp, only?: (rel: string) => boolean, pending = true): string[] {
  const out: string[] = [];
  for (const { path, rel } of files) {
    if (only && !only(rel)) continue;
    if (pending && PENDING.has(rel)) continue;
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, i) => {
        // `url(#id)` references are not colors.
        const cleaned = line.replace(/url\(#[^)]*\)/g, "");
        if (pattern.test(cleaned)) out.push(`${rel}:${String(i + 1)}: ${line.trim()}`);
      });
  }
  return out;
}

describe("no raw design values outside tokens.css", () => {
  it("has no hex colors", () => {
    expect(offenders(/#[0-9a-fA-F]{3,8}\b/)).toEqual([]);
  });

  it("has no rgb, hsl or oklch literals", () => {
    expect(offenders(/\b(rgba?|hsla?|oklch|oklab)\(/)).toEqual([]);
  });

  it("has no px, rem or em lengths in .css files", () => {
    expect(offenders(/\b\d*\.?\d+(px|rem|em)\b/, (rel) => rel.endsWith(".css"), false)).toEqual([]);
  });

  it("exports no *_CSS template strings", () => {
    expect(offenders(/export\s+const\s+\w+_CSS\b/, (rel) => /\.tsx?$/.test(rel), false)).toEqual(
      [],
    );
  });

  it("keeps PENDING honest: every pending file still has a raw color", () => {
    for (const rel of PENDING) {
      const text = readFileSync(join(SRC, rel), "utf8");
      expect(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(/.test(text), rel).toBe(true);
    }
  });
});
