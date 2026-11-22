# Impeccable critique of the M8 design

Date: 2026-11-22. Target: the production build of `apps/web` (Vite preview under `/Nodal/`), design from ADR 0012 and `apps/web/PRODUCT.md`.

Method: degraded, single context. The impeccable critique reference asks for two isolated sub-agents (design review, detector evidence). This run had no sub-agent tool, so one pass did both: the review first, then the detector. The impeccable launcher ran (`context` printed PRODUCT.md and found no DESIGN.md). Impeccable reported that v4.10.0 is available and v4.8.0 was used.

Views inspected with Playwright screenshots, 1440x900 and 1024x768, light and dark: the editor with the CE amplifier example, the inspector with the VCC source selected, the analysis editor, the waveform viewer after an AC run, plus the empty editor and the read-only view at 900 px. Interaction states (error banners, wire drawing, stale results, probing from the schematic) were not exercised in this pass.

Severity: **must-fix** breaks a stated constraint or hides content in a supported window; should-fix is a clear usability or consistency flaw; nice-to-have is polish or a decision for the owner.

## Design health

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Run status, progress and a stale marker exist. An idle empty progress bar adds nothing. |
| 2 | Match between system and real world | 3 | SPICE terms (reltol, uic, tmax) are bare field labels with a short hint or none. |
| 3 | User control and freedom | 3 | Examples and Open confirm before replacing work. |
| 4 | Consistency and standards | 3 | Tool buttons (Select, Wire, Probe) and parts share one column but look different. |
| 5 | Error prevention | 3 | Field hints show valid ranges. |
| 6 | Recognition rather than recall | 3 | Tool modes carry no shortcut hints. |
| 7 | Flexibility and efficiency | 3 | Keyboard shortcuts exist. |
| 8 | Aesthetic and minimalist design | 2 | Project bar and inspector defaults compete with the schematic. See C3, C4. |
| 9 | Error recovery | n/a | Not exercised in this pass. |
| 10 | Help and documentation | 2 | No in-app pointer to the user guide. |
| **Total** | | **25/36** | Good, with layout defects at 1024 px. |

Heuristic 9 is scored n/a, so the maximum is 36.

## Design specificity

The tokens are specific: OKLCH palette with measured contrast, jumper-wire traces and the probed-wire signature move. The chrome is not. Buttons and selects are near-default controls in a cool grey, so the "Solderless" idea shows only in the dot grid on the canvas and in colored wires after a probe. A different product could reuse the panels unchanged. This is acceptable for an Operate surface (ADR 0012 says so), and is listed as a nice-to-have only.

Deterministic scan: `impeccable detect --json apps/web/src` returned `[]` (exit 0). No false positives to discard. The detector does not measure layout, so it did not catch C1 or C2.

## What works

- Contrast is solid. Measured in both themes, text is at least 14:1, muted text at least 5.9:1, control borders at least 3.4:1, focus ring at least 5.4:1, and all six traces at least 3.1:1 against the plot background.
- The schematic carries the screen. Symbols are dark thin lines on a quiet grid and nothing in the chrome competes with them in the editor view.
- Probing a net colors its wires with the trace color, and the plot legend chip carries the same color plus a name. Plot and schematic read as one instrument.

## Findings

### Must-fix

**C1. The Examples select overflows the palette column.** View: editor, both themes, 1440 px (select spans x 30 to 234, column ends at 180, 54 px clipped) and 1024 px (column ends at 160, 74 px clipped). The "Examples…" control is cut off by the column, and its focus ring is cut off too. Cause: `.nodal-projectbar-examples` is a flex item with `flex: 1 0 100%` and the default `min-width: auto`, so the select's intrinsic width sets the container to 229 px inside a 170 px bar. Files: `apps/web/src/editor/Editor.css`, `apps/web/src/editor/ProjectBar.tsx`.

**C2. Inspector fieldsets overflow by 10 px at 1024 to 1100 px.** View: nothing selected (Models, Analyses, Options cards) at 1024 and 1100 px, both themes. In the 220 px inspector the `fieldset.nodal-model` cards grow to their content width (a fieldset's default `min-inline-size` is min-content), so inputs, selects and unit labels run past the panel edge. 34 controls are clipped at 1024 px; at 1280 px none are. The existing responsive spec checks page overflow and the panel boxes, not their contents. Files: `apps/web/src/editor/inspector/Inspector.css` (`.nodal-model`), `ModelEditor.tsx`, `apps/web/src/simulation/AnalysisEditor.tsx`, `OptionsFields.tsx`.

### Should-fix

**C3. The brand mark reads as an icon of the Examples select.** View: editor, all. The 20 px "N" sits on the row with the select, inside the palette column. There is no wordmark in the editor, so the name appears only in the status bar text "Nodal Engine 0.1.0". Files: `ProjectBar.tsx`, `apps/web/src/brand/Logo.tsx`.

**C4. With nothing selected, the inspector opens on Project name and Models, and Analyses sit below the fold.** View: editor, 1440x900, light and dark. With the CE amplifier loaded, the model editor shows 15 fields before the first analysis card. The analysis editor needs scrolling at both widths. Files: `apps/web/src/editor/inspector/Inspector.tsx`, `ProjectFields.tsx`, `ModelEditor.tsx`.

**C5. Palette labels wrap to three lines at 1024 px, and the tool modes look like plain text.** View: editor, 1024x768, both themes. "Voltage-controlled voltage source" takes three lines, so about 12 of 20 parts show without scrolling. Select, Wire and Probe have no icon, no shortcut hint and a transparent border, so only Select (pressed) looks like a button. Files: `apps/web/src/editor/Palette.tsx`, `Editor.css`.

**C6. The schematic is cut off when the waveform panel is open at 1024x768.** View: waveform after an AC run, 1024x768, both themes. The 280 px panel leaves about 415 px of canvas, and the emitter and ground parts of the CE amplifier fall below the visible area. No refit happens. Files: `apps/web/src/waveform/WaveformPanel.tsx`, `apps/web/src/editor/Editor.css`, canvas viewport code in `apps/web/src/editor/canvas/`.

**C7. In the transient analysis card, the "uic" checkbox and the Remove button share a row with no gap.** View: analysis editor, 1440 px, light (also dark). The checkbox is 13x13 px and its label touches the button. Files: `apps/web/src/simulation/AnalysisEditor.tsx`, `AnalysisFields.tsx`.

### Nice-to-have

- **C8.** A probed wire (trace 1, oklch 0.55 0.2 258) and the selection accent (0.5 0.17 258) are close in hue and lightness in the light theme. ADR 0012 already records this and selection wins on a selected wire. Consider a 2 px weight or a dash for selection. Files: `tokens.css`, canvas wire styles.
- **C9.** The run bar shows an empty progress bar when idle, then a full bar plus the word "Done". ADR 0012 says nothing is labelled twice. The analysis select has no visible label. Files: `apps/web/src/simulation/RunBar.tsx`, `RunBar.css`.
- **C10.** Plot traces are uPlot's default 1 px width, and the magnitude axis shows two ticks (0, -20) at 1440x900. Files: `apps/web/src/waveform/Plot.tsx`.
- **C11.** Unit labels make the right edges of inputs ragged: DC value ends at x 1416, AC phase at x 1420 (the degree sign is wider). Reserve one unit column. Files: `Inspector.css`, `Field.tsx`.
- **C12.** The empty editor (first load) gives no prompt to open an example, and the read-only view below 1024 px shows an empty canvas with no way to load one. Copy must not change in M8, so this needs a decision. Files: `Editor.tsx`, `NarrowNotice.tsx`.
- **C13.** Chrome is near-default controls. A single stronger detail (for example the breadboard hole pitch in the canvas grid, or a rail-style divider between the panels) would tie the chrome to ADR 0012 without adding color. Needs an owner decision.

## Persona red flags

**Power user (EE student mid-lab).** The first look at the CE amplifier shows an inspector of model parameters instead of the analyses (C4). At 1024 px the palette needs scrolling for the BJT and MOSFET entries (C5), and the waveform hides part of the circuit (C6).

**First-timer.** The empty editor shows no hint (C12). The "Examples…" control is the only way in and its right edge is cut off (C1).

**Keyboard user.** Tab order reaches every control and focus rings show, but the Examples focus ring is clipped (C1).

## Questions

- Should the logo have a header position of its own, above the palette, so it stops reading as part of the Examples row?
- Is "analyses first" the better default for the inspector when nothing is selected?
- Should the canvas refit when the waveform panel opens?
