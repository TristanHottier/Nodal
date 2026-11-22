# 0012. Visual design: Solderless

- Status: Accepted
- Date: 2026-11-22

## Context
Through M7 each milestone added its own CSS, mostly browser defaults with a few slate and blue values typed into components. ROADMAP M8 asks for one coherent design with light and dark themes, a 60/30/10 color split, WCAG 2.2 AA contrast, CVD-safe traces and a token file as the only source of raw values. The product record is `apps/web/PRODUCT.md`: the main users are EE students checking lab circuits on a laptop.

The app is an Operate surface: an editor people work in. Layout, navigation and controls stay standard. The visual world may supply type, palette, density and one signature move, and nothing else.

Four directions were compared, and Tristan chose the first on 2026-11-22:

1. Solderless: the breadboard students build lab circuits on.
2. Datasheet: a manufacturer datasheet with parameter tables and "typical characteristics" plots. It was the most familiar, and the closest to a grey screen with one accent.
3. Graphite console: a dark-first developer tool. It reads clearly as a tool, but it's generic, and a dark default doesn't suit daylit lab rooms.
4. Category standard: neutral greys and one blue, like most schematic editors.

## Decision
### Palette

Colors are OKLCH custom properties in `apps/web/src/theme/tokens.css`.
- Light theme: a cool white-ABS board for the canvas and page (the 60 %), pale grey plastic panels for the palette column, inspector, run bar and status bar (the 30 %), and rail blue as the only accent (the 10 %: primary actions, selection, focus). Rail red is used only for errors.
- Dark theme: a black "carbon" board with the same roles, the rails lifted for contrast. The theme follows `prefers-color-scheme`, with a manual choice stored per browser.
- Semantic colors (error, warning, success, op tags) and the waveform palette are tokens but sit outside the 60/30/10 split.

### Traces

Six trace colors taken from jumper wire: blue, brown or orange, green, violet, red, ochre or yellow. Each pair stays at least 0.06 apart in OKLab with normal vision and under simulated protanopia, deuteranopia and tritanopia, and contrasts at least 3:1 with the plot background. A unit test checks both. Color never carries a signal alone: the legend chip and the cursor row name every trace.

### Type

Two families, both system stacks, so no font files load: a UI sans and a monospace for values. Sizes are 11, 12, 13 and 15 px. Every numeric readout uses tabular numerals. Chrome text stays small and quiet so the schematic carries the screen.

### Space and shape

The canvas grid is 10 px at zoom 1. Spacing comes in multiples of half a grid unit (5 to 40 px), and panel widths are whole grid units. There is one elevation ladder: the canvas is ply 0, panels ply 1, popovers ply 2.

### Motion

Only hover, press, focus and panel-state transitions, at 120 ms or less. All of them stop under `prefers-reduced-motion`.

### Signature move

When a node voltage is probed, its net's wires on the schematic take that trace's color, matching the legend chip and the cursor row. The schematic and the plot read as one instrument, the way a jumper wire connects a board to a scope. Selection and error colors take precedence on a wire.

### Further rules


- Stale results stay visibly marked until the next run.
- Nothing is labelled twice.

## Consequences
Positive:
- One file holds every color and size, and tests check its contrast and CVD separation directly.
- No web fonts, so first paint does not wait for a font request.
- The signature move links the schematic to the plot without adding any control.

Negative:
- System font stacks render a little differently on each OS, so visual-regression baselines are tied to the CI runner.
- Two blues on screen (the accent and trace 1) can meet on a probed wire. Selection wins on a selected wire, so the user always sees what is selected.
- The dark block is written twice in `tokens.css`, once for the stored choice and once for the system choice. A test checks that the two copies match.

## Alternatives considered
- Datasheet, Graphite console and the category standard, described above.
- A self-hosted UI font for identical rendering everywhere: rejected, because it adds a font request on the first screen, a layout shift risk, and a third asset to keep current.
