# M8: Web design overhaul and v1 release, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole web app one coherent visual design, "Solderless", in light and dark themes, with WCAG 2.2 AA, Lighthouse and token checks as tests, then tag `v1.0.0`.

**Architecture:** One token file `apps/web/src/theme/tokens.css` (CSS custom properties, OKLCH colors) is the only place raw colors and sizes live. Every component's CSS moves from template strings into a sibling `.css` file that uses `var(--…)` only. A small color library (`src/theme/color.ts`) lets unit tests check contrast and color-vision-deficiency (CVD) separation straight from the token file. Themes switch with a `data-theme` attribute on `<html>`; uPlot reads its colors from the computed tokens.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Zustand, uPlot 1.6.32, Vitest, Playwright, `@axe-core/playwright`, `lighthouse` (CI only).

**Spec:** `docs/ROADMAP.md` §M8. Product record: `apps/web/PRODUCT.md`. The chosen direction is written in Task 1's ADR 0012.

## Global Constraints

- Behaviour, copy and features stay as they are, except where ROADMAP M8 asks for something new (theme toggle, narrow-screen read-only view, stale marking).
- Colors in OKLCH, defined only in `tokens.css`. No hex, `rgb()`, `hsl()` or `oklch()` literal anywhere else in `apps/web/src` (tests and `src/theme/color.ts` excepted). No `px`, `rem` or `em` value in any `.css` file except `tokens.css`.
- 60/30/10: dominant neutral = canvas and page background (`--color-canvas`), secondary = panels, toolbars, inspector (`--color-panel`), accent (`--color-accent`) = primary actions, selection, focus. Semantic colors and the trace palette are exempt but are tokens.
- Two type families: UI `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`; mono `ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, monospace`. No web fonts. `font-variant-numeric: tabular-nums` on every numeric readout.
- Contrast in both themes: text ≥ 4.5:1 (≥ 3:1 at ≥ 18.66 px bold or ≥ 24 px), UI components, input borders, traces and focus rings ≥ 3:1 against their background.
- Motion ≤ 150 ms, only on hover/press/focus/panel state; durations become 0 under `prefers-reduced-motion: reduce`.
- Responsive: usable from 1280 px to 1024 px wide; below 1024 px the schematic is read-only (pan and zoom only) with the notice "Nodal's editor needs a window at least 1024 px wide. The schematic is shown read-only."
- Lighthouse lab, mobile and desktop, on https://tristanhottier.github.io/Nodal/: LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms. The M7 perf budget still holds.
- Repo rules (AGENTS.md, session doc): commits on `main` by `TristanHottier <185231225+TristanHottier@users.noreply.github.com>`, Conventional Commits, no co-author or "Generated with" lines; humanizer on prose; English; never `minimumReleaseAgeExclude`, pin versions old enough for pnpm's release-age gate; files under ~400 lines.

## Review Focus

1. **Theme switch while results are shown:** switching theme with a plot open must recolor the plot, traces and cursors without a rerun and without losing probes or cursors. Pinned by a test in Task 5.
2. **First paint in dark mode:** a stored "dark" choice or a dark OS setting must not flash light before React mounts (also a CLS risk). Pinned by a Task 3 e2e test that reads the background before hydration.
3. **More probes than trace colors:** the 7th probe reuses color 1; legend chip, cursor row and probed wire must still agree on the color. Pinned in Task 5.
4. **Resizing across 1024 px with a gesture or edit in progress:** shrinking below 1024 px mid-wire or mid-drag must cancel it, not leave a half wire. Pinned in Task 6.
5. **Probed net and selection on the same wire:** selection and error colors win over the probe color, so the user can always see what is selected. Pinned in Task 5.

---

### Task 1: Direction ADR, product record and tokens with contrast and CVD tests

**Files:**
- Create: `docs/adr/0012-solderless-visual-design.md`, `apps/web/src/theme/tokens.css`, `apps/web/src/theme/color.ts`, `apps/web/src/theme/color.test.ts`, `apps/web/src/theme/tokens.test.ts`, `apps/web/src/theme/parseTokens.ts`
- Add (already drafted in the session): `apps/web/PRODUCT.md`
- Modify: `.gitignore` (add `.impeccable/` under the AI-tools section), `docs/adr/README.md` (index line)

**Interfaces:**
- Produces: token names (below), `parseTokens(css: string): { light: Record<string,string>; dark: Record<string,string> }`, and in `color.ts`: `type Rgb = [number, number, number]` (sRGB 0..1), `parseOklch(s: string): [number, number, number]`, `oklchToSrgb(l, c, h): Rgb`, `inSrgbGamut(rgb: Rgb): boolean`, `contrastRatio(a: Rgb, b: Rgb): number`, `simulateCvd(rgb: Rgb, kind: "protan" | "deutan" | "tritan"): Rgb` (Machado 2009, severity 1.0, applied in linear RGB), `oklabDistance(a: Rgb, b: Rgb): number`.
- Token names: `--color-canvas`, `--color-canvas-grid`, `--color-ink`, `--color-panel`, `--color-panel-raised`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-on-accent`, `--color-accent-soft`, `--color-focus`, `--color-error`, `--color-warning`, `--color-success`, `--color-op-tag`, `--color-plot-bg`, `--color-plot-grid`, `--color-cursor-a`, `--color-cursor-b`, `--color-trace-1` … `--color-trace-6`; `--font-ui`, `--font-mono`, `--text-xs` (11px), `--text-sm` (12px), `--text-md` (13px), `--text-lg` (15px), `--leading-tight`, `--leading-normal`; `--grid` (10px, the canvas grid at zoom 1), `--space-1` … `--space-6` (5, 10, 15, 20, 30, 40 px: multiples of half a grid unit); `--radius-sm`, `--radius-md`; `--border-width` (1px), `--focus-width` (2px); `--elevation-1`, `--elevation-2` (box-shadows; canvas is ply 0, panels ply 1, popovers ply 2); `--duration-fast` (120ms), `--ease-standard`; `--palette-width` (18 grid units), `--inspector-width` (26), `--waveform-side-width` (32); `--opacity-stale` (0.5).

- [x] **Step 1: Write the ADR.** `0012-solderless-visual-design.md`, status Accepted (Tristan chose Solderless on 2026-11-22). Record: Operate surface, code-led; the world lends type, palette, density and one signature move; palette roles (light: cool white-ABS canvas, pale grey plastic panels, rail blue accent, rail red errors only; dark: black "carbon" board, rails lifted); trace palette from jumper-wire colours; the two font stacks and the type scale; the spacing-on-half-grid rule; the elevation ladder; the signature move (a probed net's wires take its trace colour, matching the legend chip and the cursor row); the raises (stale results marked until rerun, grid-unit spacing, nothing labelled twice, one elevation ladder, quiet chrome type); alternatives considered (Datasheet, Graphite console, category standard). Run the humanizer on the prose.
- [x] **Step 2: Write `color.test.ts`.** Cases: `contrastRatio` of white and black is 21 (±0.01); `oklchToSrgb(1, 0, 0)` ≈ [1,1,1] and `(0,0,0)` ≈ [0,0,0] (±1e-4); `parseOklch("oklch(0.62 0.19 259)")` → [0.62, 0.19, 259]; `parseOklch("oklch(62% 0.19 259deg)")` → same; `simulateCvd` leaves greys unchanged (±1e-3) for all three kinds; `simulateCvd([1,0,0], "deutan")` and `simulateCvd([0,1,0], "deutan")` are closer in OKLab than the originals.
- [x] **Step 3: Run it.** `pnpm --filter @nodal/web exec vitest run src/theme/color.test.ts`: FAIL, module not found.
- [x] **Step 4: Implement `color.ts`** (OKLCH → OKLab → linear sRGB with Björn Ottosson's matrices; WCAG relative luminance; Machado 2009 matrices). Run Step 3's command: PASS.
- [x] **Step 5: Write `tokens.test.ts`.** Reads `tokens.css` with `fs` (node env via `// @vitest-environment node`), parses with `parseTokens`. Light values sit in `:root, [data-theme="light"]`; dark values in `[data-theme="dark"]` and, for the system choice, `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`; the test asserts the two dark blocks are identical. For each theme assert: every `--color-*` parses and is in sRGB gamut; text pairs ≥ 4.5 (`text`/`text-muted`/`error`/`op-tag` on `canvas`, `panel`, `panel-raised`; `on-accent` on `accent`; `text` on `accent-soft`); 3:1 pairs (`accent`, `focus`, `border-strong`, `ink` on `canvas` and `panel`; `focus` on `accent`; each trace and each cursor on `plot-bg`; `warning` and `success` on `panel`); traces: minimum pairwise `oklabDistance` ≥ 0.06 as seen normally and under each of the three CVD simulations.
- [x] **Step 6: Run it.** FAIL (no tokens file).
- [x] **Step 7: Write `tokens.css` and `parseTokens.ts`** with the names above. Starting hues to tune from: rail blue around `oklch(0.52 0.17 258)`, rail red around `oklch(0.55 0.2 27)`, canvas `oklch(0.985 0.003 250)`, panel `oklch(0.955 0.006 250)`; jumper-wire traces (blue, orange, green, violet, red, ochre-yellow) adjusted until Step 5 passes. Re-run: PASS.
- [x] **Step 8: Commit** `docs: ADR 0012 Solderless design, product record` and `feat(web): design tokens with contrast and color-vision tests` (two commits; add `.gitignore`, PRODUCT.md, ADR index with the first).

### Task 2: Base stylesheet, CSS out of components, shell restyle, raw-value guard

**Files:**
- Create: `apps/web/src/theme/base.css`, `apps/web/src/theme/noRawValues.test.ts`, one `.css` file beside each component that has CSS today (`editor/Editor.css`, `editor/Diagnostics.css`, `editor/inspector/Inspector.css`, `simulation/RunBar.css`, `waveform/WaveformPanel.css`, `editor/canvas/Canvas.css`, `symbols/symbols.css`, `bench/BenchPage.css`)
- Modify: `main.tsx` and `bench` entry (import `theme/tokens.css` and `theme/base.css`), every component that defines `*_CSS` or inline color/size styles (list from `grep -rn "_CSS\|style={{" apps/web/src`), `Palette.tsx` (icon color via `currentColor`), `tools/wire.tsx` (preview stroke via class)

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: no `*_CSS` exports remain; `Editor` no longer renders a `<style>`. The `vector-effect` symbol rule lives in `symbols/symbols.css`, imported by `symbols/index.ts`, so symbols drawn outside `<Editor>` keep thin strokes.

- [x] **Step 1: Write `noRawValues.test.ts`** (node env). Walk `apps/web/src`; skip `theme/tokens.css`, `theme/color.ts`, `*.test.ts(x)`. Fail with file:line for: `/#[0-9a-fA-F]{3,8}\b/` (outside `url(#…)`), `/\b(rgba?|hsla?|oklch|oklab)\(/`, and in `.css` files `/\b\d*\.?\d+(px|rem|em)\b/`. A second case asserts no `.tsx`/`.ts` file exports a name matching `/_CSS$/`.
- [x] **Step 2: Run it.** FAIL, listing the current offenders.
- [x] **Step 3: Write `base.css`:** box-sizing, body font `var(--font-ui)` at `--text-md`, `color: var(--color-text)`, `background: var(--color-canvas)`; standard control styling for `button`, `select`, `input`, `textarea` (panel-raised fill, `--color-border-strong` border, `--radius-sm`); `.nodal-button-primary` (filled accent, `--color-on-accent` text); global `:focus-visible { outline: var(--focus-width) solid var(--color-focus); outline-offset: 2px }` with the offset as a token; `[aria-pressed="true"]` uses `--color-accent-soft` and an accent border; `.nodal-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums }`; a `prefers-reduced-motion: reduce` block setting `--duration-fast: 0ms`.
- [x] **Step 4: Move every CSS string into its `.css` file,** replace literals with tokens, and restyle the shell in the Solderless direction: palette column and inspector on `--color-panel` with `--elevation-1` seams, canvas pane on `--color-canvas`, status bar quiet (`--text-sm`, `--color-text-muted`). Run is the only `.nodal-button-primary` in the run bar. Apply `.nodal-num` to every numeric readout (op table values, OpValues, CursorTable cells, run progress, status engine version). No copy changes.
- [x] **Step 5: Run** `pnpm --filter @nodal/web test` and `pnpm lint && pnpm typecheck`. Expected: all pass, including `noRawValues` (except files Task 4/5 own: if canvas or waveform literals are still there, list them in `noRawValues.test.ts` as a temporary `PENDING` set with a comment naming Tasks 4 and 5, which must empty it).
- [x] **Step 6: Look at it.** `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web build && pnpm --filter @nodal/web preview`, Playwright screenshot at 1440×900 with the CE amplifier loaded; check thin symbol strokes and no layout shift from M7.
- [x] **Step 7: Commit** `feat(web): base stylesheet and tokenized shell`.

### Task 3: Light and dark themes with a stored choice

**Files:**
- Create: `apps/web/src/theme/theme.ts`, `apps/web/src/theme/theme.test.ts`, `apps/web/src/theme/ThemeSelect.tsx`, `apps/web/e2e/theme.spec.ts`
- Modify: `apps/web/index.html` (inline pre-paint script; `<meta name="color-scheme" content="light dark">`), `apps/web/src/editor/Editor.tsx` (status bar holds `ThemeSelect`)

**Interfaces:**
- Produces: `THEME_STORAGE_KEY = "nodal-theme"`; `type ThemeChoice = "system" | "light" | "dark"`; `readThemeChoice(storage?: Pick<Storage,"getItem">): ThemeChoice` (invalid or missing → `"system"`, storage errors → `"system"`); `applyThemeChoice(choice: ThemeChoice, root?: HTMLElement, storage?): void` (sets `data-theme="light"|"dark"`, or removes it for system; writes storage, ignoring errors); `useResolvedTheme(): "light" | "dark"` (follows `data-theme` via a MutationObserver and `matchMedia("(prefers-color-scheme: dark)")` changes). `ThemeSelect` is a labelled `<select>` "Theme" with options System, Light, Dark.

- [x] **Step 1: Write `theme.test.ts`:** missing/garbage stored value → `"system"`; throwing storage → `"system"`; `applyThemeChoice("dark")` sets the attribute and stores `"dark"`; `applyThemeChoice("system")` removes the attribute; `useResolvedTheme` (renderHook) flips when the attribute changes and when a mocked `matchMedia` fires.
- [x] **Step 2: Run:** FAIL. **Step 3: Implement** `theme.ts` and `ThemeSelect`. The inline script in `index.html` repeats `readThemeChoice` + attribute set in ~6 lines of plain JS before the module script (comment says it mirrors `theme.ts`). **Run:** PASS.
- [x] **Step 4: Write `e2e/theme.spec.ts`:** (a) with `localStorage["nodal-theme"]="dark"` set by `addInitScript`, the `<html>` `data-theme` is `"dark"` and `body` background equals the computed `--color-canvas` at `DOMContentLoaded`, before React mounts (Review Focus 2); (b) `colorScheme: "dark"` emulation with no stored choice gives the dark canvas; (c) choosing Light in the Theme select persists across reload.
- [x] **Step 5: Run** `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web e2e -- theme.spec.ts`: PASS on Chromium and Firefox.
- [x] **Step 6: Commit** `feat(web): light and dark themes with a stored choice`.

### Task 4: Schematic canvas in tokens, focusable canvas, op tags clear of net labels

**Files:**
- Modify: `editor/canvas/Canvas.tsx` + `Canvas.css`, `OpOverlay.tsx`, `simulation/opTags.ts` (+ its test), `editor/tools/wire.tsx`, `GridBackground.tsx`, `SelectionBox.tsx`
- Test: `editor/canvas/Canvas.test.tsx`, `simulation/opTags.test.ts`

**Interfaces:**
- Consumes: tokens `--color-ink`, `--color-canvas-grid`, `--color-accent`, `--color-accent-soft`, `--color-error`, `--color-op-tag`, `--color-canvas`, `--opacity-stale`.
- Produces: the canvas `<svg>` has `tabIndex={0}`, `role="application"` and `aria-label="Schematic canvas"`; op tags get class `nodal-op-tag` with fill/stroke from CSS and `data-stale` on the group instead of inline opacity.

- [x] **Step 1: Failing tests.** `Canvas.test.tsx`: the canvas is focusable and labelled; pressing `R` with focus on the canvas rotates the selected part (shortcuts already exist; this pins that canvas focus reaches them). `opTags.test.ts`: for the divider reference schematic, every tag's text box (width = 0.42 × fontSize × chars, height = fontSize, from its `at` and the 0.3 offsets) does not intersect any net-label flag box from `LABEL_SYMBOL.bounds` placed at that label (M7 deferred minor).
- [x] **Step 2: Run:** FAIL. **Step 3: Implement.** In `opTags`, when a net's anchor is a net-label anchor, move the tag below the flag (`y = flag y1 + 1`) instead of at the anchor. Move all canvas colors into `Canvas.css` (wire preview via `.nodal-wire-preview`, grid dots, selection box, `.selected`, `.sim-error`, op tags with `paint-order: stroke` and a `--color-canvas` halo).
- [x] **Step 4: Run** `pnpm --filter @nodal/web test`: PASS; `noRawValues` PENDING set no longer lists canvas files.
- [x] **Step 5: Commit** `feat(web): schematic canvas in tokens; op tags clear of net labels`.

### Task 5: Waveform viewer in tokens, probed nets in trace colors, stale marking

**Files:**
- Create: `apps/web/src/waveform/traceColors.ts`, `apps/web/src/waveform/traceColors.test.ts`, `apps/web/src/theme/cssVar.ts`
- Modify: `waveform/Plot.tsx`, `waveform/WaveformPanel.tsx` + `.css`, `waveform/CursorTable.tsx`, `simulation/OpTable` (wherever the op result table lives), `editor/canvas/WireView.tsx`, `editor/canvas/Canvas.tsx` (pass probe index into `Scene`), `editor/inspector/OpValues.tsx`
- Test: `waveform/WaveformPanel.test.tsx`, `editor/canvas/Canvas.test.tsx`

**Interfaces:**
- Consumes: `useResolvedTheme()` (Task 3); `CircuitMap.netOfWire`; `signalKey`.
- Produces: `TRACE_COUNT = 6`; `traceSlot(index: number): number` (1-based, cycles); `traceVar(index: number): string` → `"var(--color-trace-N)"`; `wireProbeSlots(map: CircuitMap | null, probes: readonly string[]): ReadonlyMap<string /*wireId*/, number /*slot*/>` (wire's net `n` → probe `V(n)`; ground has no probe); `readCssVar(name: string, el?: Element): string` in `cssVar.ts`. `WireView` gains `probeSlot?: number` → class `probed trace-N`; color precedence in CSS: `.selected` > `.sim-error` > `.probed`.

- [x] **Step 1: Failing tests.** `traceColors.test.ts`: `traceSlot(0)=1`, `traceSlot(6)=1` (Review Focus 3); `wireProbeSlots` maps both wires of net `out` to the slot of `V(out)` and ignores ground and current probes. `Canvas.test.tsx`: with a result whose probes are `["V(in)","V(out)"]`, wires on `out` carry `trace-2`; a selected wire on `out` has class `selected` and its computed color rule order puts `.selected` last in `WireView.css`/`Canvas.css` (Review Focus 5: assert the stylesheet text order). `WaveformPanel.test.tsx`: each chip has a swatch with `traceVar(i)`, and each CursorTable row for a probe shows the same swatch plus the signal label; after editing the document the waveform panel and op table carry `data-stale="true"` (raise from the gate board; M6 deferred minor); switching `data-theme` re-creates the plot with the new `--color-plot-grid` read through `readCssVar` without clearing probes or cursors (Review Focus 1, mock uPlot as the existing Plot tests do).
- [x] **Step 2: Run:** FAIL. **Step 3: Implement.** `Plot` resolves trace, grid, axis-text and cursor colors with `readCssVar` and lists `useResolvedTheme()` in the effect that builds the chart. Axis font from `--font-mono` at `--text-xs`. Remove `TRACE_COLORS` and the `#2563eb` fallbacks. Stale dimming uses `opacity: var(--opacity-stale)` via `[data-stale="true"]` in CSS (OpOverlay, OpValues, waveform panel, op table).
- [x] **Step 4: Run** `pnpm --filter @nodal/web test`: PASS, `noRawValues` PENDING set is empty and removed. Run `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web e2e -- simulate.spec.ts`: PASS.
- [x] **Step 5: Look at it** in both themes (CE amplifier, AC sweep, two probes): traces readable, probed wires match chips.
- [x] **Step 6: Commit** `feat(web): waveform in tokens; probed nets wear their trace color`.

### Task 6: Responsive layout, 1024 to 1280 px, read-only below

**Files:**
- Create: `apps/web/src/editor/useMinWidth.ts`, `apps/web/src/editor/NarrowNotice.tsx`, `apps/web/e2e/responsive.spec.ts`
- Modify: `editor/Editor.tsx` + `Editor.css`, `editor/canvas/useCanvasPointer.ts`, `editor/canvas/Canvas.tsx`, `editor/useShortcuts.ts`
- Test: `editor/Editor.test.tsx` (or the closest existing editor test file)

**Interfaces:**
- Produces: `EDITOR_MIN_WIDTH = 1024`; `useMinWidth(px: number): boolean` (matchMedia `(min-width: …px)`; `true` when `matchMedia` is missing, so jsdom tests keep the editor); `Canvas` prop `readOnly?: boolean` (pointer handlers do pan and zoom only; no tool); in read-only mode `Editor` renders `NarrowNotice` (`role="status"`, the exact Global Constraints sentence) and the canvas, and hides palette, inspector, results and shortcuts (only pan/zoom remain).

- [x] **Step 1: Failing tests.** Editor test with mocked `matchMedia` returning false: notice text present, no element with `aria-label="Parts"` (or the palette's existing accessible name), no Run button, drag on the canvas does not move a part, wheel still zooms. Switching the mock from true to false while the wire tool has a wire in progress leaves no wire in the document and the tool back at Select (Review Focus 4). `e2e/responsive.spec.ts`: at 1024×768 and 1280×800 there is no horizontal scrollbar on `document.documentElement`, the palette, canvas, inspector and Run button are all in the viewport; at 900×700 the notice shows and the schematic SVG is visible.
- [x] **Step 2: Run:** FAIL. **Step 3: Implement.** The grid uses `--palette-width` and `--inspector-width`; between 1024 and 1280 px both shrink to 16 and 22 grid units through a media query in `Editor.css` (breakpoint values in `px` are allowed only in `@media` queries, so extend `noRawValues` to ignore `@media` lines and assert that in its test). Palette labels may wrap.
- [x] **Step 4: Run** unit tests and `responsive.spec.ts`: PASS.
- [x] **Step 5: Commit** `feat(web): responsive layout and read-only narrow view`.

### Task 7: Accessibility: axe-core clean in both themes, keyboard reach

**Files:**
- Create: `apps/web/e2e/a11y.spec.ts`
- Modify: `apps/web/package.json` (devDependency `@axe-core/playwright`, a version at least 7 days old), components the scan flags

**Interfaces:**
- Consumes: `ThemeSelect` (Task 3); examples select; analysis editor; waveform panel.

- [x] **Step 1: Write `a11y.spec.ts`.** For each theme (set via the Theme select): load "Common-emitter amplifier", run the AC sweep, open the analysis editor, select a part (inspector open), then `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze()` and expect `violations` to equal `[]`, once per view: editor with inspector, analysis editor, waveform viewer. A keyboard test: from page load, pressing Tab repeatedly (≤ 200 presses) focuses every `button`, `select`, `input` and the canvas at least once, and on each focused element `getComputedStyle(el).outlineStyle !== "none"`.
- [x] **Step 2: Run** `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web e2e -- a11y.spec.ts`. Expected: failures listing real violations.
- [x] **Step 3: Fix each violation** at its source (labels, names, roles, contrast via tokens). Canvas drawing stays pointer-based: WCAG 2.1.1 exempts path-dependent input; every other action has a control or shortcut. Record this ruling in the plan's Rulings list at close.
- [x] **Step 4: Run:** PASS on Chromium and Firefox. **Step 5: Commit** `test(web): axe-core WCAG 2.2 AA scan and keyboard reach`.

### Task 8: Visual regression and 60/30/10 shares

**Files:**
- Create: `apps/web/e2e/visual.spec.ts`, `apps/web/e2e/colorShare.ts`, `apps/web/e2e/colorShare.spec.ts`, snapshots under `apps/web/e2e/visual.spec.ts-snapshots/`
- Modify: `apps/web/playwright.config.ts` (project `visual`, Chromium, `testMatch: /(visual|colorShare)\.spec\.ts/`, excluded from the chromium/firefox projects, `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" }`), `apps/web/package.json` (script `e2e:visual`), `.github/workflows/ci.yml` (run `e2e:visual` after `e2e`)

**Interfaces:**
- Produces: `colorShares(pixels: Uint8ClampedArray, refs: { dominant: Rgb8; secondary: Rgb8; accent: Rgb8 }, tolerance = 6): { dominant: number; secondary: number; accent: number; classified: number }`, where a pixel counts for a ref when each channel is within `tolerance`, shares are fractions of `classified`. It must be self-contained (no imports) because it runs through `page.evaluate`.

- [x] **Step 1: Write `visual.spec.ts`:** at 1440×900, both themes: editor with the CE amplifier; the same after an AC run (waveform viewer); the analysis editor; the 900 px read-only view. 8 snapshots.
- [x] **Step 2: Write `colorShare.spec.ts`:** for editor and waveform views in both themes, screenshot, decode in the page via `createImageBitmap` + canvas, resolve the three refs from computed tokens, assert `dominant` in [0.50, 0.80], `secondary` in [0.15, 0.45], `accent` in (0, 0.12].
- [x] **Step 3: Run** `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web e2e:visual -- --update-snapshots`, then without the flag: PASS. Fonts on GitHub's runner differ from the sandbox, so after the first CI run download the `playwright-report` artifact's actual images, commit them as the baselines and confirm the next run is green.
- [x] **Step 4: Commit** `test(web): visual regression and 60/30/10 color shares`.

### Task 9: Lighthouse lab check on the Pages URL

**Files:**
- Create: `scripts/lighthouse.mjs`
- Modify: root `package.json` (devDependencies `lighthouse` and `chrome-launcher`, versions at least 7 days old), `.github/workflows/ci.yml` (job `lighthouse`, `needs: deploy`, on pushes to `main`)

**Interfaces:**
- Produces: `node scripts/lighthouse.mjs <url> [--runs 3]`: runs Lighthouse performance-only, mobile (default config) and desktop (`lighthouse/core/config/desktop-config.js`), takes the median of each metric per form factor, prints a markdown table (also appended to `$GITHUB_STEP_SUMMARY` when set), exits 1 if LCP > 2500 ms, CLS > 0.1 or TBT > 200 ms. Chrome path from `CHROME_PATH` or `chrome-launcher`'s default.

- [x] **Step 1: Write the script** and run it from the sandbox against the live URL with `CHROME_PATH` set to Playwright's Chromium. It measures the M7 design at first; note the numbers.
- [x] **Step 2: If a metric fails,** fix the cause before going on (likely candidates: render-blocking module size, engine `version()` call at startup, uPlot import on the first screen; lazy-load `WaveformPanel`/uPlot with `React.lazy` if TBT needs it, keeping `simulate.spec.ts` green).
- [x] **Step 3: Add the CI job.** **Step 4: Commit** `ci: Lighthouse lab check on the Pages URL`.

### Task 9b: Brand mark: logo, favicon, app header, README

Added 2026-11-22 at Tristan's request. He supplied the logo as a raster, `docs/brand/logo-source.png` (768×512, grey background, glow). It shows an "N" made of two vertical strokes and a diagonal, with a node circle at each of the four ends, in a cyan-to-mint gradient (about `#13dbe3` → `#27fab8`, OKLCH hue 200 → 165), and the wordmark "Nodal" in a heavy geometric sans. Tristan's ruling: **the logo stays separate from the UI palette.** Rail blue remains the only accent (ADR 0012), and the logo colors are brand tokens outside the 60/30/10 split, like the semantic colors.

**Files:**
- Create: `apps/web/src/brand/LogoMark.tsx` (the "N" mark as inline SVG), `apps/web/src/brand/Logo.tsx` (mark plus wordmark), `apps/web/src/brand/Logo.test.tsx`, `apps/web/public/favicon.svg`, `apps/web/public/favicon-32.png`, `apps/web/public/apple-touch-icon.png` (180×180), `docs/brand/logo-light.svg`, `docs/brand/logo-dark.svg`, `scripts/render-favicons.mjs`
- Modify: `apps/web/src/theme/tokens.css` (`--color-brand-1`, `--color-brand-2`, light and dark), `apps/web/src/theme/tokens.test.ts`, `apps/web/index.html` (icon links), `apps/web/src/editor/ProjectBar.tsx` (mark at the left end), `README.md` (logo at the top), ADR 0012 (one paragraph under Palette: "Brand mark")

**Interfaces:**
- Produces: `<LogoMark size?: number />` and `<Logo size?: number />`. Both render `<svg role="img" aria-label="Nodal">` with the gradient stops from `var(--color-brand-1)` and `var(--color-brand-2)`. The wordmark is SVG paths, not live text, so it doesn't depend on the system font stacks.

- [x] **Step 1: Redraw the mark as SVG** on a 32×32 grid: two vertical strokes and the diagonal, a stroke width that survives 16 px, four node circles (hollow ring with a dark core, as in the source), gradient from top-left cyan to bottom-right mint. No glow, no background. Draw the wordmark "Nodal" as outlined paths, matched by eye to the source letterforms. Compare the source and the redraw side by side in a Playwright screenshot before going on.
- [x] **Step 2: Brand tokens.** Light theme: darken the logo hues until each stop reaches ≥ 3:1 against `--color-panel` (for example around `oklch(0.6 0.12 200)` → `oklch(0.62 0.14 165)`; the raw logo colors reach only 1.4:1 (mint) and 1.7:1 (cyan) on white). Dark theme: close to the source colors. Add both pairs to the 3:1 checks in `tokens.test.ts`. The token test runs first: FAIL, then add the tokens: PASS.
- [x] **Step 3: Write `Logo.test.tsx`:** the mark has role `img` and name "Nodal"; its gradient stops reference the two brand tokens; no raw color literal in either component (`noRawValues` already guards this).
- [x] **Step 4: Favicon set.** `favicon.svg` uses the dark-theme stops on a transparent background, with an inline `@media (prefers-color-scheme: light)` style switching to the light stops. `scripts/render-favicons.mjs` rasterizes it with Playwright Chromium to `favicon-32.png` and `apple-touch-icon.png` (the touch icon on a `--color-canvas` square, since iOS ignores transparency). In `index.html`, replace `<link rel="icon" href="data:," />` with the SVG icon, the PNG fallback and the apple-touch icon, all under the `/Nodal/` base. `check-base-path.mjs` must still pass.
- [x] **Step 5: App header.** `<LogoMark size={20} />` at the left end of the project bar, before the project name, with `aria-hidden` there because the page title already says Nodal. It adds no new control and changes no copy.
- [x] **Step 6: README.** `docs/brand/logo-light.svg` and `logo-dark.svg` (mark plus wordmark), shown with a `<picture>` element using `prefers-color-scheme`, above the title. Keep `docs/brand/logo-source.png` as the source of record.
- [x] **Step 7: Look at it.** Screenshots at 1440×900 in both themes, plus the favicon in a browser tab: the mark reads at 16, 20 and 180 px. Run the unit, e2e and token tests; visual baselines from Task 8 change only in the project bar (say so in the commit).
- [x] **Step 8: Commit** `feat(web): brand mark, favicon and header logo` (humanizer on the ADR paragraph and README text).

### Task 10: Impeccable critique, audit, fixes, polish

Run in the main session with the impeccable skill (subagents only where its references direct).

**Files:**
- Create: `docs/design/critique.md`, `docs/design/audit.md`
- Modify: any UI file the findings touch

- [x] **Step 1:** `critique` on the running app (both themes, 1440 and 1024 px, editor, inspector, analysis editor, waveform). Commit the report.
- [x] **Step 2:** `audit` on the same. Commit the report.
- [x] **Step 3:** Fix every must-fix finding, or add it to this plan's "Findings not fixed" list with a reason. Each fix keeps unit, e2e, a11y and visual tests green (update visual baselines only for intended changes, and say so in the commit).
- [x] **Step 4:** `polish`. Then run `impeccable detect --json` on `apps/web/src` once.
- [x] **Step 5:** Re-run `audit`; it must report no must-fix findings. Update `docs/design/audit.md`. Commit.

### Task 11: Documentation and close

**Files:**
- Create: `apps/web/DESIGN.md` (impeccable `document`, through its shipped documenter)
- Modify: `AGENTS.md` (frontend rule: tokens only, `tokens.css` is the single source, run `noRawValues`), `docs/ARCHITECTURE.md` (theme and token section), `docs/user-guide.md` (Theme select, narrow-window read-only view, probed wires in color) and `docs/user-guide/*.png` (`pnpm --filter @nodal/web guide:screenshots`), `README.md` (status, Lighthouse numbers from CI), `docs/ROADMAP.md` (M8 done with evidence), version `0.1.0` → `1.0.0` everywhere it is pinned (the four tests plus package and crate manifests)

- [x] **Step 1:** Write the docs; humanizer on all prose. Run `pnpm --filter @nodal/web e2e:perf` and the editor row must still pass (re-check the 7-of-240 slow-frame margin from Tristan's laptop; report the CI numbers).
- [x] **Step 2:** Version bump commit `chore: v1.0.0`; push; CI green (including `lighthouse`) is the exit evidence.
- [x] **Step 3:** Separate `docs: close M8` commit after CI shows green; then `git tag -a v1.0.0 -m "Nodal 1.0.0"` and push the tag.

## Rulings (filled in during execution)

- Tasks 3–11 ran subagent-driven on Sonnet, with a Sonnet review per task and an Opus review of the whole milestone (Tristan's standing preference for Sonnet on delegated work).
- Task 9b ran after Task 9 and before Task 10, so the critique and audit saw the header mark.
- Task 9b: the logo source outranks this plan's wording on the gradient. It runs left to right as in `docs/brand/logo-source.png`, not top-left to bottom-right, and the diagonal is a hollow band as in the source.
- Task 7: drawing on the canvas stays pointer-based (WCAG 2.1.1 exempts path-dependent input). Disabled controls are left out of the keyboard-reach check. The "NET" text was dropped from the palette's net-label icon only (WCAG 2.5.3 label in name); placed labels are unchanged.
- Task 10: run through Sonnet subagents using the impeccable skill instead of the controller session. A visually hidden "Project" h2 was added to the empty inspector for heading order; it adds no visible copy.
- Task 5: selection now wins over the error colour on parts and labels as well as wires, following this plan's precedence (selected > error > probed).
- Visual baselines are rendered on CI. The controller replaced local renders with the CI run's `-actual.png` images after each change to the editor or analysis views.
- 60/30/10: applied as a role order, not fixed shares (Tristan's ruling, 2026-11-22). The accent covers about 0.1 % of the screen; ROADMAP, ADR 0012 and DESIGN.md say so.
- Final review fixes: stale results dim only plots and values, never live controls; selection has a heavier stroke, a halo and an outline besides colour; arrow keys on the focused canvas cycle the selection through parts, wires and labels (Esc clears, Tab always leaves); probed-wire colours drop while results are stale; the run bar choice and cursors survive the 1024 px breakpoint, and the read-only view shows a running simulation with Cancel; the pre-paint script also sets `color-scheme`.
- Deferred minors (not blocking v1.0.0): a keyboard-selected item off screen is not panned into view; op tags still dim with opacity; a selected wire's halo can paint over a wire that crosses it; the raw-value guard and token tests have small blind spots (final review M5, M6); the light editor's dominant share (0.787) sits close to the 0.80 cap.

## Findings not fixed (filled in during Task 10)

Fixed in Task 10: C1/A1, C2/A2, C7/A3 (uic row), A4, A5, A6. Not fixed:

- C3 (logo reads as part of the Examples row): moving the mark needs a header layout decision, not a small change.
- C4 (inspector default is Models, Analyses below the fold): reordering the empty-state inspector changes behaviour, so it needs the owner's call.
- C5 (palette labels wrap to three lines at 1024 px; tool modes look like plain text): icons and shortcut hints add visible content and copy.
- C6 (schematic cut off when the waveform panel opens at 1024x768): a refit on panel open is new canvas behaviour.
- C8 (probed wire and selection hues are close in light): ADR 0012 already records it; a dash or weight change is a design decision.
- C9 (empty progress bar, unlabelled analysis select): changes the run bar's content.
- C10 (1 px traces, two axis ticks): the uPlot setup is covered by the M7 perf budget and was not re-measured.
- C11 (ragged unit column): a shared Field layout change that moves every inspector input; needs fresh baselines for little gain.
- C12 (no first-run prompt, no way to load an example below 1024 px): needs new copy, which M8 excludes.
- C13 (chrome is near-default controls): needs a decision from the owner.
- A7 (disabled and muted look the same): passes contrast; a distinct disabled style is a design choice.
- A8 (one 515 kB chunk): informational; the CI Lighthouse job covers load.
- A9 (120 ms theme-change transition shows mid-blend greys in a manual screenshot): within the 150 ms limit and 0 ms under reduced motion.
- A10 (11 px hints): set by ADR 0012's type scale.
