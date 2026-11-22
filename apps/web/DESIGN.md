---
name: Nodal
description: A schematic editor and SPICE simulator drawn like a lab bench, with a white board, grey plastic panels and one rail-blue accent.
colors:
  board: "oklch(0.985 0.003 250)"
  board-grid: "oklch(0.8 0.012 250)"
  ink: "oklch(0.27 0.02 255)"
  plastic: "oklch(0.955 0.006 250)"
  plastic-raised: "oklch(0.995 0.002 250)"
  hairline: "oklch(0.88 0.008 250)"
  hairline-strong: "oklch(0.58 0.015 255)"
  text: "oklch(0.23 0.02 255)"
  text-muted: "oklch(0.47 0.02 255)"
  rail-blue: "oklch(0.5 0.17 258)"
  rail-blue-soft: "oklch(0.92 0.035 258)"
  on-rail-blue: "oklch(0.99 0 0)"
  rail-red: "oklch(0.52 0.2 27)"
  warning-amber: "oklch(0.52 0.1 70)"
  success-green: "oklch(0.52 0.12 150)"
  op-tag-teal: "oklch(0.46 0.075 195)"
  brand-cyan: "oklch(0.6 0.1 200)"
  brand-mint: "oklch(0.6 0.12 165)"
  trace-blue: "oklch(0.55 0.2 258)"
  trace-brown: "oklch(0.4 0.08 55)"
  trace-green: "oklch(0.5 0.11 150)"
  trace-violet: "oklch(0.4 0.2 305)"
  trace-red: "oklch(0.55 0.2 25)"
  trace-ochre: "oklch(0.65 0.11 90)"
  carbon-board: "oklch(0.17 0.005 250)"
  carbon-panel: "oklch(0.215 0.008 250)"
  carbon-rail-blue: "oklch(0.68 0.15 258)"
typography:
  hint:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  title:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.25
  value:
    fontFamily: "ui-monospace, \"SF Mono\", \"Cascadia Mono\", \"Roboto Mono\", Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  sm: "3px"
  md: "5px"
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
    backgroundColor: "{colors.plastic-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "25px"
  button-hover:
    backgroundColor: "{colors.rail-blue-soft}"
  button-primary:
    backgroundColor: "{colors.rail-blue}"
    textColor: "{colors.on-rail-blue}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "25px"
  input:
    backgroundColor: "{colors.plastic-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 5px"
    height: "25px"
  panel:
    backgroundColor: "{colors.plastic}"
    textColor: "{colors.text}"
    padding: "10px"
  canvas:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
---

# Design System: Nodal

Source of truth: `apps/web/src/theme/tokens.css`. The frontmatter above restates its light theme; where the two differ, the CSS file wins. Rationale is in [ADR 0012](../../docs/adr/0012-solderless-visual-design.md).

## Overview

**Creative North Star: "Solderless"**

Nodal looks like the breadboard students build lab circuits on. The canvas is a white-ABS board, the palette column, inspector and run bar are grey plastic panels, and the one accent is the blue of a power rail. Red appears only for errors. The dark theme is the same board in black "carbon", with the rails lifted so contrast holds.

The app is an Operate surface: people work in it, often in short sessions. Layout, navigation and controls stay standard. The visual world supplies the palette, the density and one signature move, and nothing else. Chrome text is small and quiet so the schematic carries the screen.

The signature move: when a node voltage is probed, its net's wires on the schematic take that trace's color, matching the legend chip and the cursor row. The schematic and the plot read as one instrument, like a jumper wire from a board to a scope.

**Key Characteristics:**
- Neutral and cool, with one blue accent used sparingly.
- Flat, with outlines instead of shadows, except on popovers.
- System fonts only, so nothing loads before first paint.
- Dense but gridded: spacing comes in half-grid steps of the 10 px canvas grid.
- Light and dark from one token set; the choice is stored per browser and follows the OS by default.

## Colors

A cool neutral field with a single saturated accent. All values are OKLCH custom properties, and the dark theme redefines the same names.

### Primary
- **Rail Blue** (`oklch(0.5 0.17 258)` light, `oklch(0.68 0.15 258)` dark): primary actions, selection and focus rings. Nothing else is blue-accented.
- **Rail Blue Soft** (`oklch(0.92 0.035 258)`): hover and pressed fill of controls, selected-row tint.

### Secondary
- **Rail Red** (`oklch(0.52 0.2 27)`): errors and engine failures marked on the schematic. Used for nothing else.

### Tertiary
- **Brand Cyan and Mint** (`oklch(0.6 0.1 200)` and `oklch(0.6 0.12 165)`): the logo gradient only. Outside the 60/30/10 split. Both stops are darkened in the light theme so each meets 3:1 on the canvas and panel.

### Neutral
- **Board** (`oklch(0.985 0.003 250)`): canvas and page background, the 60.
- **Plastic** (`oklch(0.955 0.006 250)`): palette, inspector, run bar and status bar, the 30. **Plastic Raised** is the control fill on top of it.
- **Hairline** and **Hairline Strong**: panel dividers, and input and button borders (strong reaches 3:1).
- **Text** (`oklch(0.23 0.02 255)`) and **Text Muted** (`oklch(0.47 0.02 255)`): both at least 4.5:1 on board and plastic.
- **Board Grid**: the dot grid on the canvas.

### Semantic and data
- **Warning Amber**, **Success Green**, **Op Tag Teal**: tokens outside the 60/30/10 split.
- **Traces**: jumper-wire blue, brown, green, violet, red and ochre. Each pair stays at least 0.06 apart in OKLab under normal vision, protanopia, deuteranopia and tritanopia, and each reaches 3:1 on the plot background.

### Named Rules
**The Ten Percent Rule.** Rail blue covers about a tenth of any screen: primary actions, selection, focus. If a screen needs more blue, something else is carrying the wrong signal.

**The Not-Color-Alone Rule.** A trace color never carries a signal alone. The legend chip and the cursor row name every trace.

**The Token Rule.** No color literal exists outside `tokens.css`. The `noRawValues` test fails the build if one appears.

## Typography

**UI Font:** system-ui stack (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`)
**Value Font:** monospace stack (`ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, monospace`)

**Character:** Plain and small. The sans does the labelling, the mono carries every number, and neither calls attention to itself.

### Hierarchy
- **Title** (600, 15px, 1.25): panel and section headings.
- **Body** (400, 13px, 1.45): controls, inspector fields, problems list.
- **Label** (400, 12px, 1.45): field labels, status bar, legend chips.
- **Hint** (400, 11px, 1.45): placeholders and engine-default hints in empty fields.
- **Value** (mono, 13px): operating-point tags, cursor readouts, parameter values. `font-variant-numeric: tabular-nums` on every numeric readout (`.nodal-num`).

### Named Rules
**The Two Families Rule.** Exactly two families. No web fonts, no third face.

## Layout

The canvas takes the middle and everything else is a fixed-width column or strip: palette on the left (180 px, 160 px at 1024 to 1280 px), inspector on the right (260 px, 220 px narrow), run bar and results under the canvas, status bar at the bottom. Panel widths are whole grid units.

Spacing is `--space-1` to `--space-6` (5, 10, 15, 20, 30, 40 px). The canvas grid is 10 px at zoom 1, and all pins sit on it. Controls are 25 px tall.

The app is usable from 1280 px down to 1024 px. Below 1024 px the schematic is shown read-only, with pan and zoom only, under the notice "Nodal's editor needs a window at least 1024 px wide. The schematic is shown read-only."

Stale results (after an edit that follows a run) are dimmed to `--opacity-stale` (0.5) and the run bar says "Out of date, run again".

## Elevation & Depth

Flat by default, with tonal layering. The canvas is ply 0, panels ply 1 and popovers ply 2. Ply 1 is a 1 px outline (`--elevation-1`) with no blur. Ply 2 (`--elevation-2`) adds a soft shadow and is used for menus and popovers only.

### Shadow Vocabulary
- **Panel outline** (`box-shadow: 0 0 0 1px <hairline>`): every panel.
- **Popover** (`box-shadow: 0 4px 12px oklch(0.3 0.02 255 / 0.16), 0 0 0 1px <hairline>`): menus and popovers. Dark theme uses `0 4px 12px oklch(0 0 0 / 0.5)`.

### Named Rules
**The Flat-At-Rest Rule.** Surfaces carry no shadow at rest. Only things that float above the page get one.

## Shapes

Small, square-ish corners: 3 px on controls (`--radius-sm`), 5 px on larger containers (`--radius-md`), a pill (`--radius-pill`) for legend chips. Borders are 1 px (`--border-width`). Schematic symbols are IEC 60617 line drawings on the grid, not rounded or filled.

## Components

### Buttons
- **Shape:** 3 px radius, 25 px high, 10 px side padding.
- **Default:** Plastic Raised fill, Hairline Strong border, Text color.
- **Primary** (`.nodal-button-primary`): Rail Blue fill and border, on-accent text. Used for Run.
- **Hover:** Rail Blue Soft fill, 120 ms ease.
- **Pressed or selected** (`aria-pressed="true"`): Rail Blue Soft fill with a Rail Blue border. Tool buttons use this.
- **Disabled:** muted text. Contrast passes, but disabled and muted read the same (audit A7, not fixed).
- **Focus:** a 2 px Rail Blue outline offset 2 px, on every focusable element.

### Inputs and selects
- **Style:** Plastic Raised fill, Hairline Strong border, 3 px radius, 25 px high, 5 px padding. Numbers use the mono face.
- **Focus:** the same 2 px outline as buttons.
- **Empty fields** show the engine default as an 11 px hint.

### Panels
- **Background:** Plastic, with a 1 px outline. Padding 10 px.
- **Inspector:** shows the selected part's fields, or the Models and Analyses sections when nothing is selected.

### Waveform viewer
- uPlot on the plot background, 1 px traces in the six jumper colors, cursors A and B in ink tones, a legend of pill chips. A signal chip and the matching net on the schematic share one color.

### Theme select
- A plain select in the status bar with System, Light and Dark. The choice is stored per browser.

### Brand mark
- An "N" of two strokes and a diagonal with a node ring at each end, filled with the cyan-to-mint gradient. Wordmark paths are outlined, so no font loads.

## Do's and Don'ts

### Do:
- **Do** take every color, size, radius and duration from a token in `tokens.css`, and add a token there first when none fits.
- **Do** keep the accent to primary actions, selection and focus.
- **Do** put `.nodal-num` (mono, tabular numerals) on every number the user reads.
- **Do** keep motion at 120 ms or less, on hover, press, focus and panel state only. It becomes 0 ms under `prefers-reduced-motion`.
- **Do** check new colors against the contrast tests in `tokens.test.ts` in both themes, and add the dark value to both dark blocks.
- **Do** keep a visible 2 px focus ring on anything a keyboard can reach.

### Don't:
- **Don't** write `#hex`, `rgb()`, `hsl()`, `oklch()`, `px`, `rem` or `em` in any CSS or component file other than `tokens.css`. `noRawValues.test.ts` fails on it.
- **Don't** add a web font or a third type family.
- **Don't** use color alone to identify a trace, an error or a selection.
- **Don't** add shadows to flat surfaces, gradients to the UI chrome, or a second accent hue.
- **Don't** let a probed wire's trace color hide selection or an error: those colors take precedence on a wire.
- **Don't** add behaviour, copy or features in the name of styling.
