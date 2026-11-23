# Impeccable critique of the M9 baseline

DEGRADED: single-context (this run may not dispatch sub-agents, so the design review and the detector evidence were produced in one pass, review first, detector second).

Date: 2026-11-23. Target: the production build of `apps/web` after the baseline redesign (ADR 0013, commit `69a7631`), served with `vite preview` under `/Nodal/`. Product context from `apps/web/PRODUCT.md`. Mode: Operate (a schematic editor and SPICE tool for EE students on laptops).

Views inspected with Playwright screenshots, light and dark, at 1440x900 and 1024x768: the empty project (first-run prompt), the CE amplifier with nothing selected, a part selected (the signal source VS), the analysis editor, the AC waveform with cursors A and B placed by clicking the plot twice, and a transient run. The read-only view was captured at 900 px, light and dark. Not exercised: error banners, wire drawing, stale results, probing from the schematic by hand, the operating-point values on the schematic, and tooltips. The impeccable launcher reported `apps/web/DESIGN.md` as the design system; that file still describes ADR 0012 (Solderless), see M9-C10.

Severity: P1 is a clear gap against the goal of the distinctive pass, P2 is a real usability or consistency flaw, P3 is polish.

## Design health

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Run state, "Done" and the stale marker exist. The run bar and status bar report no run time, point count or convergence detail (M9-C6). |
| 2 | Match between system and real world | 3 | The transient plot's y axis is titled "Value" with no signal name or unit, while the AC plots say "Magnitude (dB)" (M9-C3). |
| 3 | User control and freedom | 3 | Examples and Open confirm before replacing work. Cursors drag, clear and re-place. |
| 4 | Consistency and standards | 3 | Controls, radii and borders are consistent. The consistency is also what makes every panel look alike (M9-C5). |
| 5 | Error prevention | 3 | Field hints show defaults and units. |
| 6 | Recognition rather than recall | 3 | The tool rail is icon-only. Parts carry a symbol and a name. |
| 7 | Flexibility and efficiency | 3 | Shortcuts for tools and cursors exist and the cursor hint line lists them. |
| 8 | Aesthetic and minimalist design | 3 | The chrome stays out of the schematic's way. The inspector shows empty option fields at all times (M9-C5). |
| 9 | Error recovery | n/a | Not exercised in this pass. |
| 10 | Help and documentation | 2 | One hint line under the plot and the first-run prompt. No in-app pointer to the guide. |
| **Total** | | **26/36** | Good. Up from 25/36 in M8. The M8 findings C1, C2, C4 and C5 no longer show in the screenshots, and C6 is still open (M9-C4). |

Heuristic 9 is scored n/a, so the maximum is 36.

## Design specificity verdict

The baseline is clean, but it could belong to any developer tool. It was modelled on Linear on purpose, and it reads that way: Inter at one small size, cool grey panels, one indigo accent, 8 px rounded controls, ghost buttons with a thin border, and a single bold section heading style. Put a kanban board in the canvas and nothing in the chrome would object. The product's own character shows in only three places: the IEC symbols on the canvas, the probed-wire colour that matches the plot legend chip, and the logo. The rest of the screen looks like a generic app.

Deterministic scan: `impeccable detect --json src` exited 0 with warnings only. It flagged Inter (`overused-font`, `src/theme/fonts.css` lines 9 and 33, and the font test), which agrees with the review. It also flagged `design-system-font` and `design-system-color` hits in `fonts.css`, `fonts.test.ts` and `Plot.test.ts`. Those are against the stale `DESIGN.md` and are not design defects, so they count as false positives for this critique. The detector does not measure layout, so it said nothing about M9-C4. No browser overlay was injected, since this run did not need a user-visible tab.

## What works

- The schematic carries the screen in both themes. Thin symbol strokes on a quiet dot grid, and nothing in the chrome competes with them. Principle 4 of PRODUCT.md holds.
- The probed wire, the legend chip and the trace share one colour, and a selected part gets a dashed outline plus accent colour. Plot and schematic read as one instrument.
- The first-run prompt is direct. It offers the eight examples as buttons and works in the read-only view at 900 px too, so a narrow window is never an empty canvas.
- Numbers are handled seriously where they appear: tabular figures, mono for readouts, a unit column in the inspector, and the cursor table with A, B and delta rows.

## Findings

### P1

**M9-C1. The type is the Linear default and has no engineering voice.** Views: all. Inter is used for labels, headings, buttons and most inputs, at nearly one size (about 12 to 13 px) with weight as the only hierarchy step. "Analyses", "Options" and "Problems" look like the values under them. Numeric inputs in the inspector are set in Inter, so a value such as `10Meg` or `10u` does not line up with the mono readouts in the cursor table and the status bar. Mono appears as decoration (the "Engine 1.0.0" text) more than as the language of numbers. The detector flags Inter. Fix: a clearer size and case ladder (small caps or tracked labels for section heads, one step up for panel titles), mono with tabular figures for every field that holds a number, and a decision on whether the UI face stays Inter. Any new font file is a dependency and must pass the CI Lighthouse limits. Command: `typeset`.

**M9-C2. One indigo accent, used for everything, and it is the colour every other developer tool uses.** Views: all. Hue 275 marks Run, selection, focus, the active tool and the active cursor field. The first trace colour (hue 258) and the probed wire share that family, so "this is selected", "this is probed" and "this is the primary action" sit in one hue and differ by lightness. The only other colour in the chrome is the teal and mint of the logo, which appears once. Chrome is a cool grey that tints the dark theme toward blue-black. Fix: give the accent one job (primary action and focus) and let signal colours and a measurement colour do the rest, keep the neutral scale but warm or sharpen it so the dark canvas reads as a drawing surface and not as an app background, and carry the brand colours into one working element (for example the active-trace or probe state) instead of the logo alone. Contrast, the six-trace separation and the 60/30/10 role order must keep passing. Command: `colorize`.

**M9-C3. The waveform viewer is the product's most important surface and it looks like a library default.** Views: AC and transient, both themes, both sizes. The transient y axis says "Value". The AC magnitude plot shows ticks at 0 and -20 only, so a 3 dB corner cannot be read off the axis. Traces are 1 px lines. The cursor handles are grey blocks, and the block on cursor B covers the letter "B" in both themes. The readout sits in a separate table to the right, so the eye travels from a vertical line to a number two panels away. Fix: name the axis after the signal and its unit (for example "V(b) (V)"), tighter and more regular ticks in engineering notation, heavier traces, cursor handles in the measurement colour with a legible A and B, and the cursor values anchored near the cursors. This keeps the existing cursor behaviour and tests. Commands: `typeset` for labels and ticks, `colorize` for the cursor and trace treatment.

**M9-C4. The waveform panel still crops the schematic at 1024x768.** Views: AC waveform, 1024x768, both themes (the same defect as M8 C6, still open). With the panel open the canvas keeps about 380 px of height and 600 px of width: the `c` to `out` branch is cut at the right edge and the emitter network is below the fold. The palette is cut after Diode in the same view. Nothing refits when the panel opens, so the student has to pan to see the part of the circuit they are probing. Fix: refit the view when the panel opens or resizes, or let the panel dock at the bottom with a draggable height, and let the inspector narrow while a plot is open. Command: `layout`.

### P2

**M9-C5. Every panel is built from the same bordered card, and the inspector shows too much at once.** Views: empty project and CE amplifier, nothing selected, both sizes. Analyses are cards inside a section with a Remove button on each card. With an empty project the inspector shows Analyses, an Options block with six empty inputs each followed by an "Engine default" hint, and Project name below the fold at 1440x900. That is more than eight fields visible at a decision point that needs one (pick an analysis). Label-above-input stacking makes the column long, and the three analysis cards are tall and nearly identical. Fix: collapse Options by default, put label and input on one row where the label is short, and make the active analysis visibly the one that runs. Commands: `layout`, with `quieter` ideas folded in (fewer borders, one fewer nesting level).

**M9-C6. The chrome does not report what the engine is doing.** Views: run bar and status bar, all. The status bar shows "Engine 1.0.0" and nothing else. After a run the bar says "Done". A student who wants to trust the numbers (PRODUCT.md, purpose) gets no point count, no solve time, no iteration or convergence note, and no sweep range in the status. The engine result may already carry some of these facts, which the `delight` step must check before building on them. This is also the best place to give Nodal a character of its own, an instrument readout in mono, without adding decoration. Operating-point values on the schematic were not exercised in this pass. Fix: a compact mono readout in the status bar after a run (analysis, points, time) and a stronger stale state, using only data the engine returns. Command: `delight`, kept to this readout and not extended to animation.

**M9-C7. The project title is the example's full description.** Views: CE amplifier, both themes. The top bar reads "Nodal / Common-emitter amplifier: NPN, divider bias, bypassed emitter, AC gain between 26 and 46 dB at 10 kHz". At 1440 px it fills half of the bar and at 1024 px it truncates mid-phrase. A name is being used as a description. Fix: show a short name, with the description as a tooltip or a line in the inspector, and give the bar a clear left group (brand, name) and right group (file actions, theme). This needs a copy decision, so it only moves where the description is shown. Command: `layout`.

### P3

**M9-C8. The parts palette is a flat list of 20 equal rows.** Views: editor, both sizes. There is no grouping of sources, passives, semiconductors and ICs, so finding a part is a linear scan, and at 1024 px the list scrolls under the waveform panel. Group headers or a two-column icon grid would shorten it. Command: `layout`.

**M9-C9. The tool rail is icon-only and sits apart from the palette.** Views: editor. Select, Wire and Probe are three unlabelled icons in a 28 px strip left of the palette. Tooltips exist but were not exercised. Fine for a trained user, but a first-timer has to hover to learn them. Keep, and consider a visible shortcut letter. Command: `layout`.

**M9-C10. `apps/web/DESIGN.md` still documents Solderless.** It lists rail-blue, plastic panels, system fonts and 3 px and 5 px radii. The baseline uses Inter, JetBrains Mono, hue 275 and 6, 8 and 12 px radii. The detector's `design-system-*` warnings come from this drift. It should be regenerated after the distinctive pass (`document`), not before, so it describes the final design once.

## Persona red flags

**EE student in a lab-prep session (power user).** Runs an AC sweep on the CE amplifier and wants the corner frequency. The magnitude axis has two ticks, cursor B's label is covered by its own handle, and the schematic below the plot is cut off at 1024 px (M9-C3, M9-C4). The readout needs a second look at a table to the right of the plot.

**First-timer from a course handout.** Sees an inspector full of empty option fields after loading Nodal with nothing selected (M9-C5), and three icons they must hover to understand (M9-C9). The first-run prompt does help here.

**Hobbyist checking a circuit before building.** Wants to know the answer can be trusted. Gets "Done" and nothing else (M9-C6).

## Minor observations

- Examples is a wide select with a white fill next to ghost buttons, so it is the heaviest object in the top bar. The primary action in the header is not obvious (Open and Save as look alike).
- "Active: B" on the cursor panel reads as a button state label. It is a toggle. Its meaning needs the hint line.
- The transient plot shows one trace, so the right-hand panel (signal picker, chip, cursor fields, table) is taller than the data it serves.
- Dark theme dot grid and wire strokes are legible and show no banding in the screenshots.

## Questions to consider

- If the schematic is the center, should the plot be a second center, with the same drawing quality as the symbols?
- What is the one colour that means "measured value" across the wires, the legend, the cursors and the readout?
- What would the screen look like if numbers were the loudest thing on it?

## What still reads as generic, and what would make it fit an engineering tool

Generic: the type (Inter at one size), the indigo accent, the grey-card panels, the ghost buttons, the list palette, and a viewer that uses library defaults. These are the Linear choices, and they are correct for a competent baseline.

What would fit an engineering tool, and stays inside the Operate mode and the token rules:

- Numbers get their own typography: mono and tabular for every value field and readout, SI prefixes in plot axes, units in every label.
- Colour carries meaning: one measurement colour from wire to legend to cursor, one accent for action, and a drawing-surface canvas.
- The plot is treated as an instrument: named axes, readable ticks, legible cursors, readouts next to the cursors.
- The chrome shows engine facts (run time, points, convergence) in a plain mono line.
- Layout follows the work: the circuit stays whole when results open.

## Distinctive pass: commands

In run order. Each command keeps the global constraints in `common.md` (tokens only, contrast, 60/30/10, M8 guarantees, motion limits).

1. `typeset`: addresses M9-C1 and the label and tick part of M9-C3. Fixes the single-size Inter hierarchy, gives numbers mono with tabular figures, and names plot axes after the signal and unit.
2. `colorize`: addresses M9-C2 and the cursor and trace part of M9-C3. Splits the one indigo accent into an action accent and a measurement colour, and reworks the neutral scale and the cursor handle colour. Runs after `typeset` so the final contrast is checked against the new sizes.
3. `layout`: addresses M9-C4, M9-C5, M9-C7, M9-C8 and M9-C9. Refits the canvas with the panel open, simplifies the inspector, shortens the title and groups the palette.
4. `delight`: addresses M9-C6. Adds the post-run mono readout in the status bar, limited to facts the engine already returns.

`bolder` and `quieter` are not chosen. The findings ask for specific changes to type, colour, layout and readouts, and a general amplify or tone-down step would repeat them. M9-C10 is handled in Step 4 by regenerating `DESIGN.md`.
