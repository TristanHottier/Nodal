# Impeccable audit of the M9 distinctive design

Date: 2026-11-23. Target: the production build of `apps/web` under `/Nodal/` after the distinctive pass (commit `aaa10c4`), built with `NODAL_WASM_NO_OPT=1` and served by `vite preview`. Evidence: Playwright screenshots in both themes at 1440x900 and 1024x768, DOM measurements (bounding boxes, computed font sizes, scroll widths), contrast and colour-vision distances computed from the token values in `tokens.css`, the full e2e suite (axe included) and `impeccable detect --json src`. Findings carry the labels must-fix, should-fix and nice-to-have, with the P-level in brackets. IDs use the prefix M9-A so they stay apart from the M8 audit (`audit.md`) and the critique (`m9-critique.md`).

Views captured: empty project, CE amplifier with nothing selected, a part selected, the analysis editor with Options open, AC waveform with no cursors, with cursors 6 px, 14 px and far apart, a stale AC result, a transient run, a DC sweep (CMOS inverter), and the read-only view at 900 px with the first-run prompt and with a loaded example. Not exercised: error banners, wire drawing by hand, touch input, Lighthouse (the CI job covers it).

## Audit health

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Axe is clean under WCAG 2.2 AA in both themes. The cursor table clips its last column, and stale canvas text falls to 2.2:1 by design. |
| 2 | Performance | 3 | One 536.52 kB JS chunk (164.84 kB gzip), up from 515 kB at M8. Not measured further here. |
| 3 | Theming | 4 | Every colour comes from tokens in both themes. The new info colour and the cursor colour pass contrast with room. |
| 4 | Responsive | 2 | The cursor table overflows its panel by 4 px. The CE amplifier opens cropped at 1024 px. Schematic text drops to 9.1 px after a refit. |
| 5 | Implementation integrity | 3 | The detector reports only warnings, all explained. No test covers table overflow, cursor-tag collision or cursor-versus-trace distance. |
| **Total** | | **15/20** | Good: fix the two must-fix items. |

## Implementation integrity verdict

Pass with gaps. The token file remains the single source of raw values and the two themes share one set of roles. `impeccable detect --json src` exits 0 with 10 warnings and no errors. Two are `overused-font` hits on Inter in `src/theme/fonts.css`, which ADR 0013 records as a decision to keep. Six are `design-system-font` hits and one is a `design-system-color` hit against a `DESIGN.md` that still describes ADR 0012 (M9-C10, scheduled for regeneration after this audit). One more `overused-font` hit sits in `fonts.test.ts`. None points to a design defect. The gaps are three behaviours that no test exercises (M9-A1, M9-A2, M9-A3).

## Accessibility run

The whole e2e suite ran with `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web e2e`, which includes `a11y.spec.ts`: 96 passed, 0 failed, in Chromium and Firefox. Axe (tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) found no violation in the waveform viewer, the analysis editor and the inspector in light and dark, nor in the stale operating-point and stale AC states. Axe does not read text drawn on the plot canvas, so the contrast of canvas text is computed below instead.

## Summary

- Counts: 2 must-fix, 4 should-fix, 4 nice-to-have.
- Must-fix: M9-A1 (cursor tags collide when the cursors are close), M9-A2 (cursor table clipped by 4 px).
- Carried items: tag overlap confirmed (M9-A1). Colour-vision distance measured and below the trace threshold in four pairs (M9-A3). Schematic text confirmed small at 1024 px (M9-A4). Summary affordance confirmed as weak but usable (M9-A7). Contrast of the info colour and the inactive tag verified as passing (see "Contrast checks").

## Findings

### Must-fix

**M9-A1. The A and B cursor tags collide when the cursors are close.** [P1] Surfaces: AC, transient and DC plots, both themes, both sizes. Measured in screenshots `audit-06b-cursors-6px-*` and `audit-06b-cursors-14px-*`. A tag is about 15 px wide and both tags sit at the top of the plot, on the right of their line when there is room. With the cursors 6 px apart, B's tag covers A's tag and the letter A is gone. At 14 px the two tags touch and A's tag crosses B's line. In the "close" captures at 1440 px, about 16 px apart, the tags sit side by side and A's tag touches B's line. Placing two cursors near each other is the normal way to read a corner frequency or a slope, so this is the case the tags exist for, and it is the defect M9-C3 reported for the old handles. The dash and dot patterns still separate the lines, but the letter is the stated cue. Fix: when the second tag would overlap the first, move it down by one tag height, or put the tags on opposite sides of their lines. Add a unit test on the placement function with cursors 0, 6 and 14 px apart. Files: `apps/web/src/waveform/Plot.tsx` (the cursor draw hook, around the tag placement), `apps/web/src/waveform/cursors.test.ts` or a new test beside it. Suggested command: `layout`.

**M9-A2. The cursor table is wider than its panel and clips the delta column.** [P1] Surfaces: AC, transient and DC, both themes, 1440 and 1024 px. Measured: `.nodal-waveform-side` has `clientWidth` 320 and `scrollWidth` 324, and the table and its rows end 4 px past the panel edge. On the AC result the delta cell shows "-0.0005205 d" with the unit cut, and at 1024 px the delta values sit on the panel edge. The delta is the number the cursors exist to produce, so a cut unit is a measurement defect. The M8 responsive test checks buttons, selects and inputs against their panel, not tables, which is why it passes. Fix: let the table shrink (`table-layout`, narrower cell padding, or a smaller gap between the A, B and delta columns) and extend the responsive spec to include `td` and `th` in `.nodal-waveform-side`. Files: `apps/web/src/waveform/WaveformPanel.css` (`.nodal-cursors table`), `apps/web/src/waveform/CursorTable.tsx`, `apps/web/e2e/responsive.spec.ts`. Suggested command: `adapt`.

### Should-fix

**M9-A3. No test measures the distance between the cursor colour and the traces, and four pairs fall under the trace threshold.** [P2] Theming and accessibility. Surfaces: every plot. The six traces are held at least 0.06 apart in OKLab under normal vision and the three simulations, but the cursor colour is outside that test. Computed with Machado full-severity matrices on linear sRGB, then OKLab distance (this is my own implementation, so treat the third decimal as approximate):

| Theme | Pair | Normal | Protan | Deutan | Tritan |
|-------|------|--------|--------|--------|--------|
| Light | cursor and trace 1 | 0.286 | 0.141 | **0.045** | 0.320 |
| Light | cursor and trace 5 | 0.128 | 0.142 | 0.119 | **0.049** |
| Dark | cursor and trace 1 | 0.283 | 0.114 | **0.054** | 0.306 |
| Dark | cursor and trace 2 | 0.189 | 0.198 | 0.164 | **0.039** |

All other pairs are at least 0.089. The cursor is a dashed or dotted line and a trace is solid at 1.75 px, so the two stay apart by pattern, which limits the harm. The ADR says colour never carries a signal alone, and the test suite should show that for the cursor as well. Fix: add the cursor colour to the separation test with a documented threshold, then retune the cursor lightness or hue (or trace 5 in light, trace 2 in dark) until it passes, or record the dash as the accepted separator. Files: `apps/web/src/theme/tokens.css`, `apps/web/src/theme/tokens.test.ts`, `apps/web/src/waveform/traceColors.test.ts`. Suggested command: `colorize`.

**M9-A4. Schematic text drops to 9.1 px after the refit at 1024 px.** [P2] Responsive. Surface: any run at 1024x768 with the waveform panel open. The net labels use `--text-xs` (1.2 px in schematic units, 12 px at fit scale 1). After a result opens at 1024x768 the canvas is 600x381 px, the refit scales the view by about 0.76, and the labels measure 9.1 px on screen. At 1440 px the labels stay at 12 px. The circuit is whole, which was the goal of M9-C4, but the labels are now smaller than any other text in the app (the smallest UI text is 11 px). Fix options: stop the refit at a minimum scale and let the user pan, give the results panel a smaller default height at 1024 px, or compensate label size for the view scale. Files: `apps/web/src/editor/` (the refit logic), `apps/web/src/symbols/` or the label component. Suggested command: `layout`.

**M9-A5. The CE amplifier opens cropped at 1024 px.** [P2] Responsive. Surface: editor, any example that is wider than the canvas, 1024x768, both themes. With nothing run the canvas is 600x661 px and the `c` to `out` branch is cut at the right edge (screenshots `audit-02-ce-nothing-*-1024.png` and `audit-04-options-open-light-1024.png`). The refit runs when results open, not when a project loads, so a student sees a cropped circuit until the first run. This is the load-time half of M8 C6. Fix: run the same fit once when a project is loaded or an example is opened, without ever zooming in. Files: `apps/web/src/editor/` (view and refit logic), `apps/web/e2e/layout.spec.ts`. Suggested command: `layout`.

**M9-A6. The DC sweep cursor readout has no unit on the x delta.** [P2] Clarity. Surface: DC sweep, both themes. The readout shows "Δx 658.4 m" and "1/Δx 1.519" for a sweep in volts, while AC shows "1.566 kHz" and "638.6 us". A bare "m" reads as metres as easily as millivolts, and the reciprocal has no unit at all. The x axis already carries "VIN (V)", so the unit is known. Fix: take the unit from the x axis for Δx and use its reciprocal for 1/Δx (for example "1/V"). Files: `apps/web/src/waveform/CursorTable.tsx`, `apps/web/src/waveform/axisLabels.ts`. Suggested command: `clarify`.

### Nice-to-have

- **M9-A7.** [P3] Disclosure affordance. The Options and Models summaries are native `details` elements, so keyboard and screen readers work, and each row is 28 px high and 200 to 240 px wide, which is a comfortable target. The visual cue is weak: the chevron is about 7 px, it sits 2 px left of the content column, and the label is 11 px muted small caps, so the row reads as a section head and not as a control. Verified as weak, not as a failure. Files: `apps/web/src/editor/inspector/Inspector.css`.
- **M9-A8.** [P3] Contrast in the stale state. Stale plots drop to `--opacity-stale` 0.5, which puts muted axis text at about 2.2:1 in light and 2.8:1 in dark (computed against the plot background). This is the M8 rule (stale dims plots) and the intent is a visible dimmed state. The text is drawn on canvas, so axe does not see it. Keep, and decide whether axis titles should stay readable. Files: `apps/web/src/waveform/WaveformPanel.css`.
- **M9-A9.** [P3] Theming. The default probe in the CMOS inverter DC sweep is V(in), so the first plot is a straight ramp and the transfer curve needs V(out) from the picker. This is a default-probe choice, which is outside the scope of the redesign, so it is recorded here only.
- **M9-A10.** [P3] Performance. The main chunk is 536.52 kB (164.84 kB gzip) and the Vite size warning shows. The M7 budget concerns runtime and the CI Lighthouse limits cover load, so this is informational. File: `apps/web/vite.config.ts`.

## Contrast checks

Computed from the token values in `tokens.css` (OKLCH to sRGB, WCAG relative luminance).

| Pair | Light | Dark | Requirement |
|------|-------|------|-------------|
| `--color-info` text on `--color-panel` | 6.09:1 | 8.47:1 | 4.5:1 |
| `--color-info` text on `--color-canvas` | 6.55:1 | 9.04:1 | 4.5:1 |
| Cursor colour on `--color-plot-bg` (inactive tag letter and outline, lines) | 5.34:1 | 7.60:1 | 3:1 for the outline and lines, 4.5:1 for the letter |
| `--color-plot-bg` letter on cursor fill (active tag) | 5.34:1 | 7.60:1 | 4.5:1 |
| Trace 6 on `--color-plot-bg` | 3.15:1 | 10.91:1 | 3:1 |

The carried items about the quiet info colour and the inactive outline tag are verified: both pass in both themes. The tightest value is light trace 6 at 3.15:1, still above the limit. The tag letter is 11 px bold mono, so the 4.5:1 line applies and holds.

## Systemic patterns

- Layout tests cover controls but not tables or canvas content (M9-A2, M9-A5). Extending them to every element inside the side panels closes that class.
- The new cursor design has no test of its own: placement (M9-A1) and colour distance (M9-A3) are both unmeasured, while the trace palette it sits beside is measured carefully.
- Fit and scale logic lives on the results path only (M9-A4, M9-A5), so a project that loads without results never gets it.

## Positive findings

- Axe reports nothing under the WCAG 2.2 AA tags in both themes for the waveform viewer, the analysis editor, the inspector, and the stale states, and the full suite passes in Chromium and Firefox (96 of 96).
- Token contrast holds in both themes, including the new info colour and the cursor colour (table above).
- The refit keeps the circuit whole when results open at 1024 px, and the cursor tags are readable apart from the collision case.
- Axis titles carry units, numbers are mono with tabular figures, and the status bar readout (`ac · 121 points · 41 ms`, `· stale` when out of date) works in every view captured.
- The read-only view at 900 px shows the notice, the example prompt and the whole schematic in both themes.
- Deterministic scan: no error, no raw value, no hard-coded colour found.

## Recommended actions

| Priority | Command | Targets |
|----------|---------|---------|
| 1 | `layout` | M9-A1 tag placement |
| 2 | `adapt` | M9-A2 table overflow, plus the spec extension |
| 3 | `colorize` | M9-A3 cursor distance test and retune |
| 4 | `layout` | M9-A4 and M9-A5 fit and scale |
| 5 | `clarify` | M9-A6 DC units |
| 6 | `polish` | M9-A7 and M9-A8 as time allows |
