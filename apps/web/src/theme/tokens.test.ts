// @vitest-environment node
// Contrast and color-vision checks run on the token values themselves (ROADMAP M8 exit criteria).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  inSrgbGamut,
  oklabDistance,
  oklchToSrgb,
  parseOklch,
  simulateCvd,
  type Rgb,
} from "./color";
import { parseTokens } from "./parseTokens";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
const themes = parseTokens(css);

const TEXT_ON = ["--color-canvas", "--color-panel", "--color-panel-raised"];
const TEXT = [
  "--color-text",
  "--color-text-muted",
  "--color-error",
  "--color-warning",
  "--color-op-tag",
];
const UI = ["--color-accent", "--color-focus", "--color-border-strong", "--color-ink"];
const TRACES = [1, 2, 3, 4, 5, 6].map((n) => `--color-trace-${String(n)}`);
const BRAND = ["--color-brand-1", "--color-brand-2"];
const CURSORS = ["--color-cursor-a", "--color-cursor-b"];

describe("tokens.css", () => {
  it("repeats the dark theme exactly for the system choice", () => {
    expect(themes.systemDark).toEqual(themes.dark);
  });

  it("overrides every light color in the dark block", () => {
    const darkOnly = parseTokens(
      css.replace(
        /:root,\n\[data-theme="light"\] \{[\s\S]*?\n\}/,
        ':root,\n[data-theme="light"] {}',
      ),
    );
    const colors = Object.keys(themes.light).filter((k) => k.startsWith("--color-"));
    for (const k of colors) expect(darkOnly.dark[k], k).toBeDefined();
  });

  for (const [name, tokens] of [
    ["light", themes.light],
    ["dark", themes.dark],
  ] as const) {
    describe(`${name} theme`, () => {
      const rgb = (token: string): Rgb => {
        const value = tokens[token];
        if (value === undefined) throw new Error(`${token} is missing`);
        return oklchToSrgb(...parseOklch(value));
      };
      const ratio = (fg: string, bg: string) => contrastRatio(rgb(fg), rgb(bg));

      it("defines every color in OKLCH inside the sRGB gamut", () => {
        const colors = Object.keys(tokens).filter((k) => k.startsWith("--color-"));
        expect(colors.length).toBeGreaterThan(20);
        for (const k of colors) expect(inSrgbGamut(rgb(k)), k).toBe(true);
      });

      it("gives text at least 4.5:1", () => {
        for (const bg of TEXT_ON)
          for (const fg of TEXT)
            expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio("--color-on-accent", "--color-accent")).toBeGreaterThanOrEqual(4.5);
        expect(ratio("--color-text", "--color-accent-soft")).toBeGreaterThanOrEqual(4.5);
      });

      it("gives UI components and focus rings at least 3:1", () => {
        for (const bg of ["--color-canvas", "--color-panel"])
          for (const fg of UI) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
        // Brand mark stops: outside the 60/30/10 split, but they must read on both surfaces.
        for (const bg of ["--color-canvas", "--color-panel"])
          for (const fg of BRAND) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
        // The ring sits --focus-offset outside the control, so it meets the panel, not the accent fill.
        for (const fg of ["--color-success"])
          expect(ratio(fg, "--color-panel"), fg).toBeGreaterThanOrEqual(3);
        for (const fg of [...TRACES, ...CURSORS])
          expect(ratio(fg, "--color-plot-bg"), fg).toBeGreaterThanOrEqual(3);
      });

      it("keeps traces apart with normal vision and under each color-vision deficiency", () => {
        const colors = TRACES.map(rgb);
        for (const view of ["normal", "protan", "deutan", "tritan"] as const) {
          const seen = colors.map((c) => (view === "normal" ? c : simulateCvd(c, view)));
          for (let i = 0; i < seen.length; i++)
            for (let j = i + 1; j < seen.length; j++) {
              const a = seen[i];
              const b = seen[j];
              if (a === undefined || b === undefined) throw new Error("unreachable");
              expect(
                oklabDistance(a, b),
                `${view}: trace ${String(i + 1)} vs ${String(j + 1)}`,
              ).toBeGreaterThanOrEqual(0.06);
            }
        }
      });
    });
  }
});
