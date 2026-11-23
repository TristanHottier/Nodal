# 0013. Visual design: modern engineering tool

- Status: Accepted
- Date: 2026-11-22

## Context

ADR 0012 gave Nodal a breadboard-inspired look (Solderless) for v1.0.0. The owner reviewed the released app and found the chrome dated: near-default controls, system fonts, text-only buttons and a layout that did not read as a current tool. The M8 critique records the same weakness as finding C13 ("Chrome is near-default controls"), and C3, C5, C9, C11 and C12 add a missing logo in the header, a palette without icons, an unlabelled run bar, a ragged unit column and no first-run prompt.

The product record (`apps/web/PRODUCT.md`) is unchanged on audience: EE students on a laptop. What changes is the tone, from a themed look to a modern engineering tool. The app is still an Operate surface, so layout and controls stay conventional and the schematic stays the center of attention.

## Decision

### Two passes

The redesign runs in two passes.

1. A baseline pass makes the app look like a current tool. The reference is Linear: dense, tool-like, cool neutral greys, one accent, rounded controls, quiet borders. The baseline is intentionally conventional. It fixes the dated feel and the M8 findings listed above.
2. A distinctive pass, run with the impeccable skill, then changes what is generic about the baseline. Its critique lives in `docs/design/m9-critique.md`, and the result is recorded in the "Distinctive pass" section below.

### What the baseline means in tokens

All values stay in `apps/web/src/theme/tokens.css`, in OKLCH for colors.

- Color: a cool neutral scale for canvas and panels, and one accent for primary actions, selection and focus. Error, warning and success keep their own tokens.
- Shape: one radius scale for controls, panels and popovers.
- Elevation: quiet borders first, with shadow only on popovers and menus.
- Density: compact controls and tight spacing, sized so the 1024 px layout needs no scrolling in the palette.

### Fonts

- Inter for the UI, JetBrains Mono for numbers, values and code.
- Both come from Fontsource as variable woff2 files (`@fontsource-variable/inter` 5.3.0 and `@fontsource-variable/jetbrains-mono` 5.3.0). Both are licensed under the SIL Open Font License 1.1, and the licence is credited in the repository.
- Self-hosted, Latin subset only, `font-display: swap`. Only the Inter Latin file is preloaded.
- The CI Lighthouse limits must still hold (LCP at most 2.5 s, CLS at most 0.1, TBT at most 200 ms). The CI run is the evidence, and nothing is claimed beyond it.

### Icons

Lucide (`lucide-react` 1.73.0, ISC licence), imported per icon, for UI controls such as the tool rail and run bar. Schematic symbols stay hand-drawn IEC 60617 (ADR 0007).

### Theme

The default theme follows the OS (`prefers-color-scheme`). The Theme select in the status bar still overrides it, and the choice is stored per browser.

### Layout

- A top bar with the brand mark.
- An icon tool rail with tooltips and shortcut hints, and labels that do not wrap.
- The parts panel, the canvas, and the inspector.
- With nothing selected, the inspector shows Analyses first and Models collapsed below it.
- The run bar has a labelled analysis select and shows progress only while a run is active.
- Results sit below the canvas, with a unit column that lines up.
- An empty editor shows a first-run prompt that offers the examples.

### What carries over from ADR 0012

- The brand mark and its brand tokens (`--color-brand-1`, `--color-brand-2`), with the contrast test in both themes.
- Tokens as the only place for raw color and size values, checked by `noRawValues.test.ts`.
- The 60/30/10 split as a role order: canvas dominant, panels secondary, accent least. `colorShare.spec.ts` keeps checking it.
- The trace palette rules: six colors, at least 0.06 apart in OKLab under normal vision and the three CVD simulations, and at least 3:1 against the plot background. Color never carries a signal alone.
- The signature move: a probed node's wires take that trace's color, matching the legend chip and the cursor row.
- The stale-result rules: stale results stay marked, only plots and value cells dim, and probed-wire colors drop while stale.
- The selection cues: a selected wire differs from a probed wire without color (heavier stroke with a canvas-colored halo), and parts and labels get a dashed outline.
- Motion: hover, press, focus and panel-state transitions only, at 150 ms or less, and 0 ms under `prefers-reduced-motion`. This raises the 120 ms cap in ADR 0012 to 150 ms.

### Distinctive pass

To be filled in Task 6.

## Consequences

Positive:

- The chrome reads as a current engineering tool, and the M8 findings C3, C5, C9, C11, C12 and C13 are addressed.
- Inter and JetBrains Mono render the same on every OS, so visual baselines depend less on the runner's system fonts.
- The token architecture and its tests carry over, so contrast, CVD separation and the role order keep being checked.

Negative:

- Two font files and an icon set are new dependencies to keep current, and the fonts add requests to the first screen. The Lighthouse limits on CI decide whether that cost is acceptable.
- A Linear-like baseline is common, so it is not a brand by itself. The distinctive pass exists to address that.
- ADR 0012's statements on palette, type and controls no longer describe the app.

## Alternatives considered

- Keep Solderless and only polish it: rejected, because the owner's feedback was about the overall look, and the breadboard theme was the source of the dated feel.
- Keep system font stacks and add only icons: rejected, because the type is the largest visible difference between a default and a modern tool.
- An icon font or a hand-drawn icon set for the UI: rejected, because per-icon imports from Lucide avoid shipping unused glyphs and a second drawing system.
- Default to light or dark regardless of the OS: rejected, because following `prefers-color-scheme` keeps the first paint right for both daylit rooms and dark setups.
