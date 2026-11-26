---
name: Nodal
description: A schematic editor and SPICE simulator drawn as an instrument, with a paper-white canvas, quiet grey panels, one indigo accent and mono numbers.
colors:
  canvas: "oklch(0.99 0.004 95)"
  canvas-grid: "oklch(0.86 0.0064 95)"
  ink: "oklch(0.27 0.012 95)"
  panel: "oklch(0.965 0.006 95)"
  panel-raised: "oklch(1 0 0)"
  panel-hover: "oklch(0.94 0.0048 95)"
  border: "oklch(0.9 0.0048 95)"
  border-subtle: "oklch(0.935 0.004 95)"
  border-strong: "oklch(0.58 0.012 95)"
  text: "oklch(0.21 0.012 95)"
  text-muted: "oklch(0.47 0.012 95)"
  accent: "oklch(0.56 0.19 275)"
  accent-soft: "oklch(0.93 0.025 275)"
  on-accent: "oklch(0.99 0 0)"
  info: "oklch(0.47 0.06 235)"
  error: "oklch(0.52 0.2 27)"
  warning: "oklch(0.52 0.1 70)"
  success: "oklch(0.52 0.12 150)"
  brand-cyan: "oklch(0.6 0.1 200)"
  brand-mint: "oklch(0.6 0.12 165)"
  cursor: "oklch(0.53 0.24 320)"
  trace-cyan: "oklch(0.56 0.09 220)"
  trace-brown: "oklch(0.4 0.08 55)"
  trace-green: "oklch(0.5 0.11 150)"
  trace-violet: "oklch(0.4 0.2 305)"
  trace-red: "oklch(0.55 0.2 25)"
  trace-ochre: "oklch(0.65 0.11 90)"
  graphite-canvas: "oklch(0.17 0.008 235)"
  graphite-panel: "oklch(0.205 0.0096 235)"
  graphite-accent: "oklch(0.57 0.19 275)"
typography:
  label:
    fontFamily: "\"Inter Variable\", system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.06em"
  meta:
    fontFamily: "\"Inter Variable\", system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "\"Inter Variable\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  title:
    fontFamily: "\"Inter Variable\", system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "\"Inter Variable\", system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.25
  value:
    fontFamily: "\"JetBrains Mono Variable\", ui-monospace, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  "1": "5px"
  "2": "10px"
  "3": "15px"
  "4": "20px"
  "5": "30px"
  "6": "40px"
components:
  button:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "28px"
  button-hover:
    backgroundColor: "{colors.panel-hover}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "28px"
  input:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 5px"
    height: "28px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    padding: "10px"
  canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
  top-bar:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    height: "40px"
  tool-rail:
    backgroundColor: "{colors.panel}"
    width: "44px"
---

# Design System: Nodal

Source of truth: `apps/web/src/theme/tokens.css`. The frontmatter above restates its light theme; where the two differ, the CSS file wins. Rationale is in [ADR 0013](../../docs/adr/0013-modern-visual-design.md). ADR 0012 (Solderless) is superseded. Only its brand mark, token rules, trace rules and selection cues carried over.

## Overview

**Creative North Star: "The Instrument"**

Nodal is a measuring device with a drawing board attached. The canvas is warm paper in light and graphite in dark, and the panels around it are a step off the canvas in the same family. Numbers are set in their own face, colour carries meaning (one job per hue), the plot is treated as a scale with titled axes and cursors, and the status bar reports what the engine just did.

The app is an Operate surface: people work in it in short sessions on a laptop. Layout and controls stay conventional (top bar, tool rail, parts panel, canvas, inspector, results, status bar), so the schematic carries the screen and the chrome stays quiet. The reference for density and tone is Linear: compact controls, quiet borders, one accent.

The signature move carries over from v1.0: when a node voltage is probed, its net's wires take that trace's colour, matching the legend chip and the cursor row. The schematic and the plot read as one instrument.

**Key Characteristics:**
- Warm paper canvas in light, graphite in dark, panels one step off the canvas.
- One indigo accent for action, selection and focus. Information uses a quiet slate. Measurement uses one violet-magenta.
- Inter for labels and prose, JetBrains Mono with tabular figures for every number, unit and signal name.
- Flat with 1 px borders, except popovers, menus and tooltips.
- Lucide icons for controls. Schematic symbols stay hand-drawn IEC 60617.
- Light and dark from one token set. The default follows the OS, and the Theme select in the top bar overrides it per browser.

## Colors

Neutrals with a warm cast in light (hue 95) and a cool graphite in dark (hue 235), one saturated accent, and a trace palette built for the plot. Every value is an OKLCH custom property, and the dark theme redefines the same names in two blocks.

### Primary
- **Indigo** (`oklch(0.56 0.19 275)` light, `oklch(0.57 0.19 275)` dark, focus ring `oklch(0.7 0.13 275)` in dark): primary actions (Run), selection, focus rings and pressed toggles. It no longer marks the active cursor field.
- **Indigo Soft** (`oklch(0.93 0.025 275)` light, `oklch(0.32 0.08 275)` dark): pressed and selected fills.

### Secondary
- **Slate Info** (`oklch(0.47 0.06 235)` light, `oklch(0.76 0.06 225)` dark): informational states such as the run-bar status icon and the operating-point tag.
- **Error Red** (`oklch(0.52 0.2 27)`): engine failures and invalid fields. Warning amber and success green sit beside it as semantic tokens.

### Tertiary
- **Measurement Magenta** (`oklch(0.53 0.24 320)` light, `oklch(0.71 0.2 310)` dark): both cursors. Cursor A is a dashed line and B is dotted, each with a lettered tag.
- **Brand Cyan and Mint** (`oklch(0.6 0.1 200)` and `oklch(0.6 0.12 165)`): the logo gradient only, outside the 60/30/10 split.

### Neutral
- **Canvas** (`oklch(0.99 0.004 95)` light, `oklch(0.17 0.008 235)` dark): canvas and page background, the 60. **Canvas Grid** is the dot grid.
- **Panel** (`oklch(0.965 0.006 95)` light, `oklch(0.205 0.0096 235)` dark): top bar, rail, parts panel, inspector, results and status bar, the 30. **Panel Raised** is the control fill on top, **Panel Hover** the hover fill.
- **Border**, **Border Subtle** and **Border Strong**: dividers and card edges, and the 3:1 boundary of inputs and buttons.
- **Text** and **Text Muted**: at least 4.5:1 on canvas and panel in both themes.

### Data
- **Traces**: cyan, brown, green, violet, red and ochre. Trace 1 is cyan, away from the accent family. Traces are drawn at 1.75 px. Plot drawing sizes (tag size, line widths, dash patterns, axis sizes) are constants in `waveform/Plot.tsx`, the documented exception to the tokens rule because uPlot draws on a canvas; colors and fonts still come from tokens. Each pair stays at least 0.06 apart in OKLab under normal vision and the three colour-vision simulations, and each reaches 3:1 on the plot background.

### Named Rules
**The One Job Rule.** Indigo means act or select, slate means information, magenta means measurement, and the traces mean signals. If a screen needs more indigo, something else is carrying the wrong signal.

**The Role Order Rule.** Canvas dominates, panels come second, the accent covers the least. `colorShare.spec.ts` reads 60/30/10 as this order.

**The Not-Colour-Alone Rule.** A trace colour never carries a signal alone: the legend chip and the cursor row name every trace, and cursors A and B differ by dash and letter.

**The Token Rule.** No colour literal and no `px`, `rem` or `em` exists outside `tokens.css`. `noRawValues.test.ts` fails the build if one appears.

## Typography

**UI Font:** Inter Variable (self-hosted, Latin and Greek faces, `font-display: swap`, system-ui fallback; one Latin preload)
**Number Font:** JetBrains Mono Variable (self-hosted, same setup)

**Character:** Inter labels and explains, and the mono face holds every figure. Hierarchy comes from size, case and weight alone.

### Hierarchy
- **Label** (600, 11px, 0.06em tracking, uppercase, muted): section heads.
- **Meta** (400, 12px, 1.45): field labels, notes, status text.
- **Body** (400, 13px, 1.45): controls, inspector fields, problems list.
- **Title** (600, 14px, 1.25, -0.01em tracking): panel titles.
- **Headline** (600, 16px, 1.25): the largest heading in chrome.
- **Value** (mono, 12 or 13px, tabular figures): numeric inputs, the unit column, signal chips, the first column of the cursor and operating-point tables, and the status readout. Placeholders in numeric fields stay in Inter.

Plot axes carry titles with units, such as "V(b) (V)", in Inter medium, with ticks in mono. Headings use balanced line breaks.

### Named Rules
**The Mono Numbers Rule.** Every number the user reads is mono with tabular figures (`.nodal-num`).

**The Two Families Rule.** Inter and JetBrains Mono only. No third face. The arrow glyph U+2192 is in no Fontsource subset and uses the system fallback.

## Layout

The window is a column: top bar, a main row, and the status bar. The main row is the tool rail (44 px), the parts panel (180 px at every width, each row ending in a small "About" button that opens the codex), the canvas, and the inspector (260 px, 220 px narrow). The results panel sits under the canvas with the run bar on top, and the parts panel spans the rows beside the results so it keeps its height. Panel widths are whole grid units.

The top bar (40 px) has a left group (brand mark, short project title) and a right group (file actions, theme). The title is the part of the name before the first ": ", and the full name is the tooltip. The rail icons carry their shortcut underneath. The parts panel is grouped into Sources, Passives, Semiconductors and Other. With nothing selected, the inspector shows Analyses first, with Options and Models collapsed under chevrons.

Spacing is `--space-1` to `--space-6` (5 to 40 px). The canvas grid is 10 px at zoom 1 and every pin sits on it. Controls are 28 px tall.

The schematic fits the view on load once per document and refits whenever a new result resizes the canvas. It never zooms in, and a rerun of the same analysis keeps the user's zoom. Below 1024 px the schematic is read-only, with pan and zoom and the notice "Nodal's editor needs a window at least 1024 px wide. The schematic is shown read-only."

An empty editor shows a first-run prompt that offers the examples. Stale results dim only plots and value cells to `--opacity-stale` (0.5), and the status readout ends with "stale".

## Elevation & Depth

Flat by default with tonal layering. The canvas is ply 0, panels ply 1 and popovers ply 2. Panels use a 1 px border with no blur. Menus, popovers and tooltips float above with a soft shadow.

### Shadow Vocabulary
- **Panel outline** (`box-shadow: 0 0 0 1px oklch(0.9 0.006 95)`): panels.
- **Popover** (`0 1px 2px oklch(0.2 0.012 95 / 0.06), 0 4px 12px oklch(0.2 0.012 95 / 0.1), 0 0 0 1px oklch(0.88 0.006 95)`): menus and popovers. Dark uses black shadows at 0.3 and 0.5 alpha.

### Named Rules
**The Flat-At-Rest Rule.** Surfaces carry no shadow at rest. Only things that float get one.

## Shapes

Rounded but tight: 6 px on controls (`--radius-sm`), 8 px on cards and panels (`--radius-md`), 12 px on large containers (`--radius-lg`), a pill for legend chips. Cursor tags on the plot are small rectangles. Borders are 1 px. Schematic symbols are IEC 60617 line drawings on the grid, not rounded or filled. Icons are 16 px Lucide strokes.

## Components

### Buttons
- **Shape:** 6 px radius, 28 px high, 10 px side padding, medium weight.
- **Default:** Panel Raised fill, Border Strong outline for text fields and Border for buttons, Text colour.
- **Primary:** Indigo fill, on-accent text. Used for Run.
- **Hover:** Panel Hover fill, 100 ms.
- **Pressed or selected** (`aria-pressed="true"`): Indigo Soft fill with an Indigo border.
- **Focus:** a 2 px Focus outline offset 2 px on everything the keyboard reaches.

### Inputs and selects
- **Style:** Panel Raised fill, Border Strong outline, 6 px radius, 28 px high. Numbers are mono.
- **Rows:** field labels sit in a fixed 50 px column so values align.
- **Invalid:** a red border and a short message.

### Top bar and tool rail
- **Top bar:** brand mark, short title, file actions and the theme control on a panel strip.
- **Tool rail:** icon buttons with a shortcut hint underneath and a tooltip. Tooltips close on Esc and are dark chips in both themes. The rail is a `nav` landmark.

### Parts panel
- A single-column list with a 24 px symbol icon and a short label (VCVS, VCCS, CCVS, CCCS, Op amp), in four groups.

### Inspector
- Compact cards with one row per field. When several analyses exist, the one the run bar will run has a stronger border and the line "Runs when you press Run".

### Waveform viewer
- uPlot on the plot background, 1.75 px traces, titled axes with units, a legend of pill chips, and cursors A (dashed) and B (dotted) in one magenta with filled or outlined letter tags. Clicking sets cursors by click order, and they can be dragged or moved with keys.

### Status bar
- Engine version and status messages, and a mono run readout such as `tran · 450 points · 54 ms` (wall-clock, includes the worker round trip).

### Brand mark
- An "N" of two strokes and a diagonal with a node ring at each end, filled with the cyan-to-mint gradient. Wordmark paths are outlined.

## Do's and Don'ts

### Do:
- **Do** take every colour, size, radius and duration from a token in `tokens.css`, and add the token there first, with dark values in both dark blocks.
- **Do** keep indigo for primary actions, selection and focus.
- **Do** put `.nodal-num` on every number the user reads.
- **Do** keep motion at 150 ms or less, on hover, press, focus and panel state only, and 0 ms under `prefers-reduced-motion`.
- **Do** check new colours against `tokens.test.ts` in both themes: text 4.5:1, UI parts, borders, focus rings, traces and cursors 3:1.
- **Do** mark selection with a shape cue as well as colour: a selected wire is heavier with a canvas-coloured halo, and a selected part or label gets a dashed outline.
- **Do** keep canvas selection reachable by keyboard: arrows step through items, `Esc` clears, `Tab` leaves the canvas.
- **Do** dim only plots and value cells when results are stale. Controls and labels stay at full contrast.
- **Do** import Lucide icons one by one.

### Don't:
- **Don't** write `#hex`, `rgb()`, `hsl()`, `oklch()`, `px`, `rem` or `em` outside `tokens.css`.
- **Don't** add a third font family or load fonts beyond the self-hosted Inter and JetBrains Mono.
- **Don't** use colour alone to identify a trace, a cursor, an error or a selection.
- **Don't** add shadows to surfaces at rest, gradients to chrome, or a second accent hue.
- **Don't** let a probed wire's trace colour hide selection or an error. Those take precedence on a wire.
- **Don't** add behaviour, copy or features in the name of styling.
