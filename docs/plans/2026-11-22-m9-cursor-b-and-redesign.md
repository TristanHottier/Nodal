# M9: Cursor B fix and modern redesign (v1.1.0), implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make waveform cursor B placeable by click, drag and keyboard without reading the guide, and give the web app a modern look: first a conventional baseline modelled on Linear, then impeccable passes that make it distinctive. Ship as `v1.1.0`.

**Architecture:** Cursor placement becomes a pure function (`waveform/cursorInput.ts`) that the uPlot wrapper calls on click, drag and key events; the active cursor lives in the simulation store next to the positions, so it survives the 1024 px breakpoint and theme switches. The redesign keeps M8's token architecture (`theme/tokens.css` is the only source of raw values) and changes token values, adds self-hosted fonts and Lucide icons, and restructures the shell into a top bar, an icon tool rail, a parts panel, the canvas, the inspector and the results panel.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Zustand, uPlot 1.6.32, Vitest, Playwright, `@axe-core/playwright`, `lighthouse` (CI only). New: `lucide-react` 1.73.0 (ISC), `@fontsource-variable/inter` 5.3.0 and `@fontsource-variable/jetbrains-mono` 5.3.0 (OFL 1.1). All three are older than 7 days on 2026-11-22.

**Spec:** `docs/ROADMAP.md` §M9.

## Decisions (Tristan, 2026-11-22)

1. **Cursor interaction: click order.** The first plain click places A, the second places B, and every later plain click moves whichever cursor is nearer on screen. Both cursors can also be dragged. Shift+click always places or moves B.
   - Keyboard (plan's choice, inside Tristan's decision): the plot is focusable. `A` and `B` pick the active cursor; ←/→ move it one sample (Shift: ten samples), Home/End jump to the ends, Delete or Backspace removes it. A missing active cursor appears at the middle sample on the first arrow press.
   - A one-line hint under the plot says how it works. The cursor table gets a "Clear cursors" button.
2. **Baseline reference look:** Linear (dense, tool-like, neutral greys, one accent, rounded controls, quiet borders).
3. **Fonts:** Inter (UI) and JetBrains Mono (numbers, values, code), self-hosted variable woff2 from Fontsource, Latin subset only, `font-display: swap`.
4. **Icons:** Lucide, imported per icon. Schematic symbols stay hand-drawn IEC (ADR 0007).
5. **Default theme:** follow the OS. The status-bar Theme select still overrides it.
6. **ADR:** new ADR 0013 supersedes ADR 0012's visual sections (palette, type, controls). The brand mark, token architecture and the 60/30/10 role-order ruling carry over.
7. **M8 findings taken in:** C3 (logo in the header), C5 (tool rail with icons, labels that don't wrap), C9 (run bar: labelled analysis select, progress only while running), C11 (aligned unit column), C12 (first-run prompt), C13 (modern controls). C6, C8, C10 and A7–A10 stay out unless the M9 critique or audit raises them as must-fix.
8. **Inspector (C4):** with nothing selected, Analyses comes first and Models is collapsed below it.

## Global Constraints

- Scope: cursor B and the redesign only. No engine, file-format, analysis or device change. Copy changes only where the new layout needs a label, tooltip, hint or the first-run prompt.
- Colors in OKLCH and sizes only in `apps/web/src/theme/tokens.css`; `noRawValues.test.ts` stays green. Dark values go in both dark blocks.
- Contrast from tokens in both themes: text ≥ 4.5:1, UI components, borders, focus rings, traces and cursors ≥ 3:1 (`tokens.test.ts`). Trace CVD separation stays as in M8.
- 60/30/10 as a role order (`colorShare.spec.ts`): canvas dominant, panels secondary, accent least.
- Every M8 exit check stays green after every task: unit tests, `a11y.spec.ts` (axe WCAG 2.2 AA, keyboard reach, canvas keyboard selection), `responsive.spec.ts` (1024 and 1280 px, read-only view below 1024 px with the notice, pan and zoom), `theme.spec.ts` (no flash), `colorShare.spec.ts`, the `visual` project, Lighthouse on CI (mobile and desktop: LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms), and the M7 perf budget (editor 60 fps with 500 parts).
- M8 guarantees kept: a selected wire stays distinguishable from a probed wire without colour (stroke weight, halo); stale results dim only plots and value cells; probed-wire colours drop while stale.
- Visual baselines come from CI renders (copy `*-actual.png` from the `playwright-report` artifact), never local ones. Say in the commit when baselines change on purpose.
- Motion ≤ 150 ms, only on hover/press/focus/panel state; 0 ms under `prefers-reduced-motion: reduce`.
- Repo rules (AGENTS.md, session doc): commits on `main` by `TristanHottier <185231225+TristanHottier@users.noreply.github.com>`, Conventional Commits, no co-author or "Generated with" lines; humanizer on prose; English; files under about 400 lines; never `minimumReleaseAgeExclude`; credit font licences.
- Sandbox: build with `NODAL_WASM_NO_OPT=1`. Tags can't be pushed from the sandbox; Tristan creates `v1.1.0`.

## Review Focus

1. **Click order with both cursors set:** a plain click moves the nearer cursor in screen pixels (log x on AC), Shift+click moves B, and a drag never also fires a click. Pinned by `cursorInput.test.ts` and `cursors.spec.ts` (Task 1).
2. **Cursors across a theme switch and the 1024 px breakpoint:** positions and the active cursor survive both (the chart is rebuilt on theme change). Pinned in Task 1.
3. **Fonts on mobile Lighthouse:** two variable fonts must not push LCP or CLS over the limits (M8 mobile TBT was 71 to 153 ms). Only the Inter Latin file is preloaded; CI `lighthouse` is the evidence (Task 3).
4. **Selected versus probed wire** without relying on colour, in the new palette and both themes (Tasks 3, 6, 7).
5. **"Generic" is not the final state:** `docs/design/m9-critique.md` names what is generic, and Task 6's commits change it. The audit report records the before and after.
6. **Read-only view below 1024 px** still shows the notice, the running simulation with Cancel, and pan/zoom inside the new chrome (Task 4).

---

### Task 1: Cursor B by click order, drag and keyboard (TDD)

**Files:**
- Create: `apps/web/src/waveform/cursorInput.ts`, `apps/web/src/waveform/cursorInput.test.ts`, `apps/web/e2e/cursors.spec.ts`
- Modify: `apps/web/src/waveform/Plot.tsx` (pointer and key handling, focusable host, hint), `apps/web/src/waveform/WaveformPanel.tsx`, `apps/web/src/waveform/CursorTable.tsx` ("Clear cursors" button, active-cursor marker), `apps/web/src/simulation/store.ts` (`activeCursor`), their tests, `docs/user-guide.md` (cursor section)

**Interfaces:**
- `type CursorId = "a" | "b"`.
- `cursorForClick(c: CursorState, xPx: number, toPx: (x: number) => number, shift: boolean): CursorId`: Shift → `"b"`; A unset → `"a"`; B unset → `"b"`; else the cursor whose `toPx` is nearer `xPx` (tie → A).
- `cursorUnderPointer(c: CursorState, xPx: number, toPx, radiusPx = 6): CursorId | null`: the nearest set cursor within the radius, for drag start and the hover `ew-resize` cursor.
- `stepCursor(axis: Float64Array, x: number | null, steps: number): number`: snaps to the nearest sample (either axis direction), moves `steps` samples, clamps to the ends; `null` → the middle sample.
- Store: `activeCursor: CursorId` (default `"a"`, reset with the cursors), `setActiveCursor(id)`. Every placement sets the active cursor to the one placed.

- [ ] **Step 1: Write `cursorInput.test.ts`.** Cases: empty → A; A only → B; both set, click near A → A, near B → B, in log pixels on a log axis; Shift with none, A only and both → B; tie → A; `cursorUnderPointer` inside, outside and with both within the radius (nearest wins); `stepCursor` ascending and descending axes, clamping at both ends, `null` → middle, snapping a between-samples x.
- [ ] **Step 2: Run** `pnpm --filter @nodal/web exec vitest run src/waveform/cursorInput.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `cursorInput.ts`.** Re-run: PASS.
- [ ] **Step 4: Write `e2e/cursors.spec.ts`** (chromium and firefox): open the RC low-pass transient example, run, probe the output. Click the plot at 30 % width → the Cursor A field fills; click at 70 % → Cursor B fills (fails today); drag B to 50 % → B changes and A doesn't; click near A → A moves; the Δ row shows a value. Keyboard: Tab to the plot, press `B`, press → three times → B moves by three samples; Delete clears B. Shift+click still sets B. Switch theme and cross 1024 px wide and back → both positions kept.
- [ ] **Step 5: Run** `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web e2e -- cursors.spec.ts`. Expected: FAIL at the second click.
- [ ] **Step 6: Implement.** In `Plot.tsx` replace the click listener with pointer events on `u.over`: pointerdown on a cursor (`cursorUnderPointer`) starts a drag with pointer capture, pointermove updates it, pointerup ends it and swallows the following click; a plain click uses `cursorForClick`. Hover over a cursor shows `cursor: ew-resize` (a class, not an inline style). Make the host `tabIndex={0}` with an `aria-label` naming the plot and the keys, and handle `a`, `b`, arrows, Home, End, Delete and Backspace (prevent default only for keys it uses; never Tab). Draw the active cursor's label with a filled tag so the active one is visible without relying on colour. Below the plot, one hint line: "Click to place cursor A, click again for B. Drag a cursor to move it. Keys: A/B, ←/→, Delete." In `CursorTable` add "Clear cursors". Wire `activeCursor` through the store. Update the M6 mocked-Plot tests to the new mapping.
- [ ] **Step 7: Run** unit tests, `cursors.spec.ts`, `a11y.spec.ts` and `simulate.spec.ts` on both browsers. Expected: PASS.
- [ ] **Step 8: Docs.** Rewrite the cursor paragraph in `docs/user-guide.md` (mouse and keyboard). Humanizer on the prose.
- [ ] **Step 9: Commit** `feat(web): place cursor B by click order, drag and keyboard`. Push; CI green.

### Task 2: ADR 0013 and product record

**Files:**
- Create: `docs/adr/0013-modern-visual-design.md`
- Modify: `docs/adr/0012-solderless-visual-design.md` (status: visual sections superseded by 0013), `docs/adr/README.md`, `apps/web/PRODUCT.md` (tone line: modern engineering tool; audience unchanged)

- [ ] **Step 1: Write ADR 0013**, status Accepted (decisions above, 2026-11-22). Record: why (owner feedback on v1.0.0, critique C13); the two-pass method; the baseline reference (Linear) and what that means in tokens (cool neutral scale, one accent, radius, elevation, density); fonts with licences and the loading rule (self-hosted, Latin subset, swap, preload Inter only); Lucide for UI icons, IEC symbols unchanged; theme follows the OS; layout (top bar with the mark, icon tool rail with tooltips and shortcut hints, parts panel, canvas, inspector with Analyses first, results); what carries over from 0012 (brand mark, tokens as the only raw values, 60/30/10 role order, trace palette rules and CVD test, signature probed-net colour, stale rules, selection cues); a "Distinctive pass" section left as "to be filled in Task 6". Humanizer.
- [ ] **Step 2: Commit** `docs: ADR 0013 modern visual design`.

### Task 3: Baseline tokens, fonts and icons

**Files:**
- Modify: `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/theme/tokens.css`, `apps/web/src/theme/base.css`, `apps/web/src/main.tsx` (font imports), `apps/web/index.html` (preload of the Inter Latin woff2, resolved by Vite), `apps/web/src/theme/tokens.test.ts` (new pairs), `README.md` and `docs/brand/` credits (Inter, JetBrains Mono, Lucide licences)
- Create: `apps/web/src/theme/fonts.test.ts`

**Interfaces:**
- Keeps every existing token name. Adds `--radius-lg`, `--elevation-3`, `--text-xl`, `--weight-regular`/`--weight-medium`/`--weight-semibold`, `--icon-sm` (14px), `--icon-md` (16px), `--control-height` (28px), `--topbar-height`, `--rail-width`, `--color-panel-hover`, `--color-border-subtle`, `--color-tooltip-bg`, `--color-tooltip-text`.
- `--font-ui: "Inter Variable", system-ui, …`; `--font-mono: "JetBrains Mono Variable", ui-monospace, …`.

- [ ] **Step 1: Add the dependencies** at the pinned versions; check `pnpm install` passes the release-age gate.
- [ ] **Step 2: Write `fonts.test.ts`** (node env): `--font-ui` starts with Inter and `--font-mono` with JetBrains Mono; the built `index.html` preloads exactly one woff2 (checked in `e2e/shell.spec.ts` instead if the test needs the build). Extend `tokens.test.ts` with the new colour pairs (tooltip text on tooltip bg ≥ 4.5; border-subtle is decorative and exempt; panel-hover text ≥ 4.5).
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: New token values,** Linear-like, both themes: cool neutral scale (light canvas near white, panels a step darker; dark canvas near `oklch(0.17 0.01 270)`, panels a step lighter), one indigo accent near `oklch(0.56 0.19 275)` tuned until contrast passes, radius 6/8/12 px, soft two-layer shadows, type scale 12/13/14/16/20 px. Keep the trace palette unless contrast on the new `--color-plot-bg` fails; then tune lightness only. Base controls in `base.css`: control height, 1 px subtle border, hover fill, pressed accent-soft, focus ring.
- [ ] **Step 5: Run** unit tests, then `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web e2e` and the a11y, colour-share and theme specs. Expected: PASS. Screenshot both themes at 1440×900 and look at them.
- [ ] **Step 6: Commit** `feat(web): baseline tokens, Inter and JetBrains Mono, Lucide`. Push; check the CI `lighthouse` job (mobile LCP, CLS, TBT within limits) before Task 4.

### Task 4: Baseline shell: top bar, tool rail, parts panel, status bar (C3, C5, C13)

**Files:**
- Create: `apps/web/src/editor/TopBar.tsx` + `.css`, `apps/web/src/editor/ToolRail.tsx` + `.css`, `apps/web/src/editor/Tooltip.tsx` (CSS-only, shown on hover and focus, `aria-describedby`), tests beside them
- Modify: `Editor.tsx` + `Editor.css` (grid: top bar / rail, parts, canvas, inspector / results / status), `Palette.tsx` (parts only, icon grid with one-line labels), `ProjectBar.tsx` (moves into the top bar: mark, project name, Examples, New, Open, Save, Export), read-only view (top bar without editing actions), `e2e/visual.spec.ts-snapshots/*` (CI renders)

- [ ] **Step 1: Tests first.** `ToolRail.test.tsx`: Select, Wire and Probe are buttons with accessible names equal to their visible tooltip text, `aria-pressed` follows the tool, and the shortcut shows in the tooltip. `TopBar.test.tsx`: the mark is a separate landmark item from the Examples select, and every M8 project action is still reachable by role and name. Extend `responsive.spec.ts`: at 1024 px no palette label wraps (each label's height equals one line height).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with Lucide icons (`MousePointer2`, `Spline` or `Cable` for wire, `Crosshair` for probe, `FilePlus`, `FolderOpen`, `Save`, `Download`, `Play`, `Square`, `Sun`/`Moon`/`Monitor` in the theme select). The tool rail is a `role="toolbar"` with roving focus. Keep every existing accessible name the e2e tests use, or update the tests in the same commit.
- [ ] **Step 4: Run** the whole unit and e2e suite plus a11y, responsive and colour share. Push, copy the CI `-actual.png` baselines, push them.
- [ ] **Step 5: Commit** `feat(web): top bar, icon tool rail and parts panel` and `test(web): CI visual baselines for the baseline shell`.

### Task 5: Baseline panels: run bar, inspector, fields, empty state (C4, C9, C11, C12)

**Files:**
- Modify: `simulation/RunBar.tsx` + `.css` (visible "Analysis" label, Run with `Play` icon, progress bar only while running, status text with an icon), `editor/inspector/Inspector.tsx` (nothing selected: AnalysisEditor first, then ProjectFields, then ModelEditor in a closed `<details>`), `editor/inspector/Field.tsx` + `Inspector.css` (label / input / unit as a three-column grid so units align), `waveform/WaveformPanel.tsx` + `CursorTable.tsx` styling
- Create: `editor/canvas/EmptyState.tsx` (shown when the document has no parts: "Start from an example" with the Examples choices as buttons, and "or pick a part from the left"; hidden once a part exists; not shown in read-only, where it offers the examples instead), tests

- [ ] **Step 1: Tests first.** `RunBar.test.tsx`: the analysis select has a visible label; no progress bar when idle. `Inspector.test.tsx`: with nothing selected the first heading is "Analyses". `Field.test.tsx`: unit cells share one column (same `grid-column`). `EmptyState.test.tsx`: shown for an empty project, gone after placing a part, loading an example from it fills the canvas. Update the e2e tests that assumed the old order.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Copy added: "Analysis", the empty-state lines, the hint from Task 1. Nothing else.
- [ ] **Step 4: Run** everything as in Task 4; CI baselines.
- [ ] **Step 5: Commit** `feat(web): run bar, inspector order, aligned fields and first-run prompt` and the baseline commit.

### Task 6: Impeccable critique, then the distinctive pass

**Files:**
- Create: `docs/design/m9-critique.md`
- Modify: any UI file the chosen commands touch, `tokens.css`, ADR 0013 ("Distinctive pass" section), baselines

- [ ] **Step 1: `critique`** (impeccable skill) on the running baseline: both themes, 1440 and 1024 px, editor, inspector, analysis editor, waveform with cursors, empty state, read-only view. The report must say plainly what still reads as generic. Commit it (`docs: M9 critique of the baseline`).
- [ ] **Step 2: Choose the commands** from `bolder`, `quieter`, `colorize`, `typeset`, `layout`, `delight` that the critique calls for, and write the list with one line of reason each into this plan's Rulings.
- [ ] **Step 3: Run each command**, one commit per command (`feat(web): <command> pass, …`), each with every Global Constraints check green. Token changes go through `tokens.css` and keep contrast.
- [ ] **Step 4: Update ADR 0013** with the final direction and what changed from the baseline. Humanizer. CI baselines. Commit.

### Task 7: Audit, fixes and polish

**Files:**
- Create: `docs/design/m9-audit.md`
- Modify: files the findings touch

- [ ] **Step 1: `audit`** on the same surfaces as Task 6. Commit the report.
- [ ] **Step 2: Fix every must-fix finding,** or record it under "Findings not fixed" with a reason. Each fix keeps every check green.
- [ ] **Step 3: `polish`,** then `impeccable detect --json` on `apps/web/src` once.
- [ ] **Step 4: Re-run `audit`:** no must-fix. Update `m9-audit.md` with before and after. CI baselines. Commit.

### Task 8: Documentation, version and close

**Files:**
- Modify: `apps/web/DESIGN.md` (regenerated with impeccable `document`), `AGENTS.md` (link ADR 0013), `docs/ARCHITECTURE.md` (shell layout, fonts, icons), `docs/user-guide.md` and `docs/user-guide/*.png` (`guide:screenshots`), `README.md` (status, Lighthouse numbers from CI, credits), `docs/ROADMAP.md` (M9 done with evidence), version `1.0.0` → `1.1.0` in `Cargo.toml`, `apps/web/package.json`, `packages/schema/package.json`, `crates/nodal-engine/src/lib.rs` test, `crates/nodal-cli/tests/cli.rs`, `crates/nodal-wasm/tests/node.rs`, `apps/web/src/App.test.tsx`, `apps/web/src/engine/client.test.ts`, `apps/web/e2e/shell.spec.ts`, and `Cargo.lock`

- [ ] **Step 1:** Docs; humanizer on all prose. Run `pnpm --filter @nodal/web e2e:perf`; the editor row must pass.
- [ ] **Step 2:** `chore: v1.1.0`; push; CI green including `lighthouse` is the exit evidence (record the run id and numbers).
- [ ] **Step 3:** Opus review of the whole milestone; fix wave; CI green.
- [ ] **Step 4:** `docs: close M9` in a separate commit after CI shows green. Tristan creates the tag: `git tag -a v1.1.0 <close commit> -m "Nodal 1.1.0" && git push origin v1.1.0`.

## Rulings (filled in during execution)

- Task 1: the rc-lowpass example's first analysis is AC, so the cursor e2e uses its transient (index 1). A `--waveform-hint-height` token keeps the hint inside the 280 px panel.
- Task 3: Fontsource ships no per-subset CSS, so `theme/fonts.css` declares Latin and Greek faces. U+2192 (→) is in no Fontsource subset and uses the system fallback. A small Vite plugin injects the one Inter Latin preload.
- Task 4: the parts panel is a single-column list with short labels (VCVS, VCCS, CCVS, CCCS, Op amp); a grid could not fit the full catalog names. Tooltips close on Esc (WCAG 1.4.13). The rail keeps a `nav` landmark because a11y.spec requires every control inside a region.
- Task 5: the Tab-reach check in a11y.spec skips controls inside a closed `<details>`; the summary itself stays reachable. `editor/projectActions.ts` is shared by the top bar and the first-run prompt.
- Task 6: the critique chose typeset, colorize, layout and delight; bolder and quieter were not needed. Inter stays despite the detector's flag (owner's decision). The layout pass refits the schematic once each time a new result resizes the canvas; a rerun of the same analysis keeps the user's zoom.
- Subagents: implementers and reviewers on Sonnet, per-task reviews, Opus for the final review.

## Findings not fixed (filled in during Task 7)

The full list, with before and after, is in `docs/design/m9-audit.md`.

- M9-A4 (schematic text about 9.1 px after the refit at 1024 px): a minimum fit zoom would crop the circuit, and showing it whole is what the fit is for. Owner-level decision; a user who needs larger labels can zoom.
- M9-A8 (stale canvas text at about 2.2:1 and 2.8:1): by design. Stale results are meant to look dimmed, and the status bar says "stale".
- M9-A9 (the DC sweep opens on V(in) as its default probe): not fixed, nice-to-have, and a default-probe change belongs to a later milestone.
- M9-A10 (main chunk 537.73 kB, Vite size warning): not fixed, nice-to-have. Code splitting is outside the scope of this milestone.
- Detector warnings on Inter (3 `overused-font`, 6 `design-system-font`): kept by the owner's ruling to use Inter. Both are advisories, not errors.
- Remaining detector advisory (1 `design-system-color` in `Plot.test.ts`): a test fixture colour, not shipped UI.
