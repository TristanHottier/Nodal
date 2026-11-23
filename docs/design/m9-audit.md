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

## Re-audit (after fixes)

Date: 2026-11-23. Target: the production build at HEAD `a788b76` (fixes `f9888a8`, cleanups `d7a98d5`, polish `aa52324`, review fix `3cf2578`, CI baselines), built with `NODAL_WASM_NO_OPT=1` and served by `vite preview`. Method as in the first audit: Playwright screenshots in both themes at 1024x768 and 1440x900 (`reaudit-*.png` in the shots folder), DOM measurements, the full e2e suite and `impeccable detect --json src`. Views: empty project, CE amplifier freshly loaded, AC with cursors at 0, 6 and 15 px and far apart, a stale AC result, DC sweep, transient with close cursors, Options open at 1024 px, the 1024 px crossing after a zoom, and the read-only view at 900 px with the prompt and a loaded example.

Result: no must-fix remains. The audit is clean.

### Before and after

| ID | Was | Now | Status |
|----|-----|-----|--------|
| M9-A1 | Cursor tags collide when the cursors are close (must-fix) | `placeCursorTags` sends the tags to the outer sides on collision. At 6 px and 15 px, in both themes and sizes, A and B are both readable and neither tag covers the other's line. A and B at the same pixel can only be placed by the keyboard or the inputs, so the 0 px case rests on the unit test, which sweeps separations 0 to 40 px. | Fixed |
| M9-A2 | Cursor table 4 px wider than its panel (must-fix) | `.nodal-waveform-side` has `scrollWidth` 320 and `clientWidth` 320 on AC, transient and DC, in both themes at 1024 and 1440 px. No `th` or `td` lies past the panel edge. Layout specs now cover the table. | Fixed |
| M9-A3 | Cursor colour within 0.06 of two traces under colour-vision simulation (should-fix) | Cursor retuned and the distance added to `tokens.test.ts` (threshold 0.06, minimum now about 0.087). The suite passes. | Fixed |
| M9-A4 | Schematic text about 9.1 px after the refit at 1024 px (should-fix) | Unchanged. The label box measures 11 px high at 1024 px with results open and 15 px at 1440 px, a ratio of 0.73, so the scale effect is still there. | Decision, see below |
| M9-A5 | CE amplifier opens cropped at 1024 px (should-fix) | The fresh CE amplifier at 1024x768 sits fully inside the canvas in both themes, with 0 items outside. | Fixed |
| M9-A6 | DC readout has no unit on Δx (should-fix) | Δx shows "1.317 V" and the cursor inputs show V. The 1/Δx row is omitted for DC, because a reciprocal volt has no meaning for a sweep. | Fixed, with a decision on the row |
| M9-A7 | Weak disclosure affordance (nice-to-have) | Chevron raised to the `--chevron-size` token with a 2 px stroke, and the label darkens on hover. | Fixed |
| M9-A8 | Stale canvas text at about 2.2:1 and 2.8:1 (nice-to-have) | Unchanged. The stale 1440 dark capture shows the intended dimmed state, and the status bar reads `· stale`. | By design |
| M9-A9 | DC default probe is V(in) (nice-to-have) | Unchanged. The DC capture still opens on V(in). | Not fixed |
| M9-A10 | Main chunk 536.52 kB (nice-to-have) | 537.73 kB (163.53 kB gzip), up 1.21 kB with the fixes. The Vite size warning still shows. | Not fixed |

### Decisions

- **M9-A4.** A minimum fit zoom would crop the circuit, and showing the whole circuit on load is what the fit exists for (M9-C4, M9-A5). The labels stay at the scale the fit gives. A student who needs larger labels can zoom, and a refit happens only when a new result resizes the canvas, so a rerun of the same analysis keeps the zoom. Re-audit evidence: after a zoom, resizing the window through 1000 and 1100 px left the view transform unchanged, so crossing 1024 px never refits.
- **M9-A6, 1/Δx for DC.** Period and frequency read from Δx make sense for time and frequency axes. For a swept source the reciprocal has no use and no honest unit, so the row is not shown.

### Other checks in this pass

- Crossing 1024 px after zooming: the transform stayed identical at 1280, 1000 and 1100 px wide.
- Read-only view at 900 px: no horizontal overflow and no schematic item outside the canvas, light and dark, with the prompt and with a loaded example.
- Page overflow: 0 px at 1024 and 1440 in every captured view.
- Stale state: plots and value cells dim, the status bar shows `· stale`, and the cursor table stays inside its panel.

### Axe and e2e

`NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web e2e`: 110 passed, 0 failed, in Chromium and Firefox. This includes `a11y.spec.ts` (axe with wcag2a, wcag2aa, wcag21a, wcag21aa and wcag22aa, in both themes, including the stale states) and the new layout specs for the cursor table and fit-on-load. Axe reports no violation. The first audit ran 96 tests, and the 14 added tests are the layout, cursor-tag and fit specs. The `visual` project was not run locally, since its baselines are CI renders.

### Detector

`impeccable detect --json src` exits 2 (warnings only) with 10 findings, 0 errors, the same set as the first audit: 3 `overused-font` (Inter in `fonts.css` twice and `fonts.test.ts`), 6 `design-system-font` (`fonts.css` four times, `fonts.test.ts` twice) and 1 `design-system-color` (`Plot.test.ts`).

### Audit health (after fixes)

| # | Dimension | Before | After | Key finding |
|---|-----------|--------|-------|-------------|
| 1 | Accessibility | 3 | 3 | Axe is clean. Stale canvas text stays at low contrast by design (M9-A8). |
| 2 | Performance | 3 | 3 | Chunk grew 1.21 kB to 537.73 kB. Nothing slower observed (M9-A10). |
| 3 | Theming | 4 | 4 | Cursor colour now covered by the colour-vision test. |
| 4 | Responsive | 2 | 3 | Table fits, CE amplifier loads whole. Labels still small after a 1024 px refit (M9-A4). |
| 5 | Implementation integrity | 3 | 3 | The three untested behaviours now have tests. Detector warnings remain, all explained, and DESIGN.md drift is open until Task 8. |
| **Total** | | **15/20** | **16/20** | Good. No must-fix. |

### Findings not fixed

- **M9-A4.** Decision above. Label size after a 1024 px refit is the price of a whole circuit on load.
- **M9-A8.** By design. Stale plots dim to `--opacity-stale`, which is the M8 rule. Canvas text is outside axe.
- **M9-A9.** The default DC probe is a product choice outside the scope of the redesign.
- **M9-A10.** Informational. The M7 budget and the CI Lighthouse limits cover load and runtime.
- **Inter detector warnings (3 `overused-font`).** Kept by owner ruling, recorded in ADR 0013.
- **DESIGN.md detector warnings (6 `design-system-font`, 1 `design-system-color`).** They compare the code to a `DESIGN.md` that still describes ADR 0012. Task 8 regenerates it, and they should clear then.
- **New in this pass.** Nothing new found.
