// @vitest-environment node
// Guard for ADR 0012: colors and sizes live in tokens.css only.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Files exempt from every check: the token source and the color helper. */
const EXEMPT = new Set(["theme/tokens.css", "theme/color.ts"]);

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

function offenders(pattern: RegExp, only?: (rel: string) => boolean): string[] {
  const out: string[] = [];
  for (const { path, rel } of files) {
    if (only && !only(rel)) continue;
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, i) => {
        // Breakpoints may use px, but only on `@media` lines.
        if (/^\s*@media\b/.test(line)) return;
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
    expect(offenders(/\b\d*\.?\d+(px|rem|em)\b/, (rel) => rel.endsWith(".css"))).toEqual([]);
  });

  it("lets @media lines carry px breakpoints and nothing else", () => {
    const re = /\b\d*\.?\d+(px|rem|em)\b/;
    // The real editor stylesheet uses such a line, and the guard above lets it through.
    const editorCss = readFileSync(join(SRC, "editor/Editor.css"), "utf8");
    expect(editorCss.split("\n").some((l) => /^\s*@media\b/.test(l) && re.test(l))).toBe(true);
    const media = "@media (min-width: 1024px) and (max-width: 1279px) {";
    expect(re.test(media)).toBe(true);
    const css = [media, "  .a { width: 10px; }", "}"];
    const hits = css.filter((l) => !/^\s*@media\b/.test(l) && re.test(l));
    expect(hits).toEqual(["  .a { width: 10px; }"]);
  });

  it("exports no *_CSS template strings", () => {
    expect(offenders(/export\s+const\s+\w+_CSS\b/, (rel) => /\.tsx?$/.test(rel))).toEqual([]);
  });
});
