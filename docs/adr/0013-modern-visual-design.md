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
- With nothing selected, the inspector shows Analyses first, with Options and Models collapsed below it.
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

The critique in `docs/design/m9-critique.md` scored the baseline 26/36 and called it clean but generic: Inter at one size, one indigo accent for every job, identical bordered cards, a flat parts list and a plot viewer with library defaults. It chose four commands, run in this order: `typeset`, `colorize`, `layout` and `delight`. `bolder` and `quieter` were not needed, because the findings asked for specific changes to type, colour, layout and readouts. The direction is an instrument: numbers get their own typography, colour carries meaning, the plot is treated as a measuring device, and the chrome reports what the engine did.

Type (M9-C1, and the label part of M9-C3):

- Section heads are small caps with tracking (`--tracking-label`, 11 px, semibold, muted). Panel titles are one step up, 14 px semibold with slightly tight tracking (`--tracking-title`). Body text stays 13 px and notes 12 px. Headings use balanced line breaks.
- JetBrains Mono with tabular figures sets every number, unit and signal name: numeric inputs, the unit column, signal chips, the first column of the cursor and operating-point tables, and the status readout. Placeholders in numeric fields stay in Inter.
- Plot axes carry titles with units. The transient and DC y axis names the signal ("V(b) (V)"). Several probes of one kind give "Voltage (V)" or "Current (A)", and a mix lists both. The DC x axis carries the source unit. Magnitude ticks fall every 20 dB and phase ticks every 45 degrees. Axis titles are Inter medium and ticks are mono.

Colour (M9-C2, and the cursor and trace part of M9-C3):

- The accent (indigo, hue 275) keeps its job: the primary action, selection, focus and pressed toggles. It no longer marks the active cursor field.
- A quiet slate `--color-info` marks informational states, such as the run-bar status icon and the operating-point tag.
- The instrument traces follow the plot. Trace 1 moved from blue, which shared the accent family, to the brand cyan, and the probed wire, legend chip and cursor-row swatch follow it. Traces are drawn at 1.75 px.
- One violet-magenta measurement colour (hue 320 in light, 310 in dark; retuned in M9 so it stays apart from every trace under colour-vision simulation) serves both cursors. Cursor A is a dashed line and B is dotted. A tag beside the line shows the letter, filled with the letter knocked out for the active cursor and outlined for the other. Colour alone never separates A from B.
- The neutrals were retinted. Light is a warm paper and dark is a graphite so the canvas reads as a drawing surface. Contrast, the six-trace separation and the 60/30/10 role order are still checked by the token tests and `colorShare.spec.ts`.

Layout (M9-C4, C5, C7, C8, C9):

- The schematic refits once whenever a new result resizes the canvas, so the circuit stays whole when the results panel opens. If the whole circuit is already visible the view is left alone, and the refit never zooms in. A rerun of the same analysis keeps the user's zoom. The parts palette spans the rows beside the results, so it keeps its height.
- The parts palette is grouped into Sources, Passives, Semiconductors and Other.
- Each tool-rail icon shows its shortcut underneath.
- The inspector is compact. Options and Models are collapsed by default with a chevron, and analysis cards use one row per field. When several analyses exist, the one the run bar will run is marked with a stronger border and the line "Runs when you press Run".
- The top bar shows a short project title, the part of the name before the first ": ". The full name is the tooltip, and the description appears as a hint under Project name in the inspector. The bar has a left group (brand, name) and a right group (file actions, theme).

Status (M9-C6):

- After a run the status bar shows a mono readout, for example `tran · 450 points · 54 ms`. An operating-point run reads `op · N signals`. When the results are stale it dims to the muted colour and ends with `· stale`. The analysis type and point count come from the decoded result. The engine reports no timing, so the time is wall-clock, measured around the runner call, and includes the worker round trip and result decoding. The engine returns no iteration or convergence data, so none is shown.

Kept despite the critique:

- Inter stays as the UI face. The critique asked for a decision on it and the owner decided to keep it, even though `impeccable detect` flags it as an overused font. The other changes carry the distinction.
- The grey-panel structure and the Linear-style controls stay. Only the type, colour roles, layout and readouts changed.
- Cursors A and B share one colour, and the dash, the letter and the tag fill tell them apart.
- `apps/web/DESIGN.md` is regenerated after this pass (M9-C10), not before.

## Consequences

Positive:

- The chrome reads as a current engineering tool, and the M8 findings C3, C5, C9, C11, C12 and C13 are addressed.
- Inter and JetBrains Mono render the same on every OS, so visual baselines depend less on the runner's system fonts.
- The token architecture and its tests carry over, so contrast, CVD separation and the role order keep being checked.

Negative:

- Two font files and an icon set are new dependencies to keep current, and the fonts add requests to the first screen. The Lighthouse limits on CI decide whether that cost is acceptable.
- A Linear-like baseline is common, so it is not a brand by itself. The distinctive pass addresses that through type, colour roles, layout and the run readout, but Inter stays, so the UI face is still the common one and the detector keeps flagging it.
- The run readout time is wall-clock and includes worker and decoding overhead, so it is not a solver timing.
- ADR 0012's statements on palette, type and controls no longer describe the app.

## Alternatives considered

- Keep Solderless and only polish it: rejected, because the owner's feedback was about the overall look, and the breadboard theme was the source of the dated feel.
- Keep system font stacks and add only icons: rejected, because the type is the largest visible difference between a default and a modern tool.
- An icon font or a hand-drawn icon set for the UI: rejected, because per-icon imports from Lucide avoid shipping unused glyphs and a second drawing system.
- Default to light or dark regardless of the OS: rejected, because following `prefers-color-scheme` keeps the first paint right for both daylit rooms and dark setups.
