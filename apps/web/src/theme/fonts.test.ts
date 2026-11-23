// @vitest-environment node
// Font stacks and self-hosted @font-face rules (ADR 0013).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTokens } from "./parseTokens";

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const themes = parseTokens(read("./tokens.css"));
const fontsCss = read("./fonts.css");

describe("fonts", () => {
  it("puts Inter first in the UI stack and JetBrains Mono first in the mono stack", () => {
    expect(themes.light["--font-ui"]).toMatch(/^"Inter Variable",\s*system-ui/);
    expect(themes.light["--font-mono"]).toMatch(/^"JetBrains Mono Variable",\s*ui-monospace/);
  });

  it("declares one Latin variable face per family with font-display swap", () => {
    const faces = fontsCss.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(2);
    for (const face of faces) {
      expect(face).toContain("font-display: swap");
      expect(face).toMatch(/-latin-wght-normal\.woff2/);
      expect(face).toContain("unicode-range");
    }
    expect(fontsCss).toContain('font-family: "Inter Variable"');
    expect(fontsCss).toContain('font-family: "JetBrains Mono Variable"');
  });
});
