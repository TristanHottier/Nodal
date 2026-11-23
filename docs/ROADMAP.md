# Roadmap

Status legend: **done** · **in progress** · **not started**

A milestone is done only when every exit criterion is met and CI is green. Status changes in the same commit that meets the last criterion.

The engine comes first: the editor is only useful once the numbers it shows can be trusted. M5a and M5b (the editor) have no engine dependency and may run in parallel with the engine milestones.

## v1 milestones

### M0 — Repository bootstrap · done
- Cargo workspace with the three crates; pnpm workspace with `packages/schema` and `apps/web`.
- CI (GitHub Actions): `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`, `wasm-pack build`, `pnpm lint`, `pnpm test`, `pnpm build`.
- GitHub Pages deploy of the empty app shell from `main`, via GitHub Actions, served under `/Nodal/` ([ADR 0010](adr/0010-github-pages-hosting.md)).

**Exit:** CI green on `main`; `https://tristanhottier.github.io/Nodal/` serves the shell, including a WASM module loaded from a worker; `AGENTS.md` command table filled in.
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/43087709851 (rust, web, deploy green); https://tristanhottier.github.io/Nodal/ returns 200 and shows `Engine 0.1.0`.

### M1 — Linear DC engine · done
- Netlist IR types (Rust serde + TS Zod) with schema tests in both languages.
- Devices: R, L (short), C (open), V, I, VCVS, VCCS, CCVS, CCCS.
- MNA assembly, dense LU behind the `LinearSolver` trait, DC operating point.
- Topology checks from ARCHITECTURE §4.5.
- `nodal-cli run <ir.json>` and `nodal-cli export-spice <ir.json>`.
- Validation harness: golden regeneration script, comparator, first reference circuits.

**Exit:** reference circuits L1–L4 ([VALIDATION.md](VALIDATION.md)) pass against analytic values, and L1–L3 also against ngspice goldens; topology errors name the offending elements.
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/43115456912 (all jobs green). Its [rust job](https://github.com/TristanHottier/Nodal/actions/runs/43115456912/job/130842158355) runs the L1–L4 analytic tests, the topology-error CLI test `run_reports_topology_error` and `nodal-cli validate`; the `validation-report` [artifact](https://github.com/TristanHottier/Nodal/actions/runs/43115456912/artifacts/13898615913) shows L1–L3 passing against ngspice.

### M2 — Nonlinear DC · done
- Diode, BJT (NPN/PNP), MOSFET Level 1 (N/P), voltage-controlled switch (DC behaviour).
- Newton–Raphson with junction limiting; gmin stepping and source stepping fallbacks.
- DC sweep.

**Exit:** finite-difference Jacobian tests pass for every nonlinear device in every operating region; circuits N1–N5 pass.
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/43156593522 at bb53ca6 (rust, web, deploy green). Its [rust job](https://github.com/TristanHottier/Nodal/actions/runs/43156593522/job/130977856325) runs the Jacobian tests for the diode, BJT, MOSFET and switch, and `nodal-cli validate`; the `validation-report` [artifact](https://github.com/TristanHottier/Nodal/actions/runs/43156593522/artifacts/13916217141) shows N1, N2, N3-vgs1..3, N4, N5 and N6 passing against ngspice-42.

### M3 — AC analysis · done
- Complex MNA assembly; small-signal models of all devices, including junction and overlap capacitances.
- Linear, decade and octave sweeps.

**Exit:** circuits A1–A4 pass (magnitude and phase).
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/44826285994 at 0c6e64e (rust, web, deploy green). Its [rust job](https://github.com/TristanHottier/Nodal/actions/runs/44826285994/job/136599600321) runs the AC closed-form tests for A1 and A2, the capacitance finite-difference tests for the diode and BJT, and `nodal-cli validate`; the `validation-report` [artifact](https://github.com/TristanHottier/Nodal/actions/runs/44826285994/artifacts/14673776614) shows A1–A6 passing against ngspice-42 in magnitude and phase.

### M4 — Transient analysis · done
- C, L and junction charges integrated with trapezoidal and BDF2.
- Source waveforms: pulse, sine, PWL, with breakpoints.
- LTE-based step control (ported from ngspice `cktterr.c`); `uic`; switch hysteresis, with step rejection and crossing location at each threshold crossing.
- MOSFET bulk junction diodes with saturation current (IS) and forward-biased bulk, as in ngspice `mos1load.c`. The DC, AC and transient loading is done (devices.md §3); bulk junction capacitances are not supported.

**Exit:** circuits T1–T6 pass with both `trap` and `gear`.
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/44867024382 at 9ddee70 (rust job green). Its [rust job](https://github.com/TristanHottier/Nodal/actions/runs/44867024382/job/136732857420) runs the transient closed-form tests and `nodal-cli validate`; the `validation-report` [artifact](https://github.com/TristanHottier/Nodal/actions/runs/44867024382/artifacts/14692261605) shows T1–T6 passing against ngspice-42 with `trap` and `gear`. The T4 and T6 circuits differ from their first drafts (a gate resistor, `tmax`, `RON`); the reasons are in [VALIDATION.md](VALIDATION.md) §4.

M5 is split in two. M5a draws schematics; M5b turns them into circuits that can be saved and netlisted.

### M5a — Schematic canvas · done
- SVG canvas: grid, zoom, pan, selection, move, rotate, mirror, delete, copy/paste.
- IEC symbols for every v1 device, plus ground and net label.
- Orthogonal wire drawing with junction dots, following the drawing rules of ARCHITECTURE §6.1 (a dot at every T-junction, none at a plain crossing).
- Undo/redo for every edit.

**Exit:** every v1 device, ground and net label can be placed, moved, rotated, mirrored, copied and deleted, and wired on the grid; component tests cover each edit and its undo/redo; junction-dot tests cover T-junctions and crossings; the Pages build shows the editor.
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/44952617696 at 87a385a (rust, web, deploy green). Its [web job](https://github.com/TristanHottier/Nodal/actions/runs/44952617696/job/136993656345) runs the component tests (`Editor.test.tsx` places, moves, rotates, mirrors, copies, pastes and deletes each of the 18 palette entries and checks undo and redo after every step; `wireTool.test.tsx` draws wires; `junctions.test.ts` covers T-junctions, crossings and corners) and the Playwright tests on Chromium and Firefox, which draw a resistor wired to ground, add a T-junction and undo it. The [deploy job](https://github.com/TristanHottier/Nodal/actions/runs/44952617696/job/136994098107) published the editor to https://tristanhottier.github.io/Nodal/, which shows the palette and canvas.

### M5b — Schematic data and netlister · done
- Parameter inspector with value-notation parsing ([ADR 0009](adr/0009-value-notation.md)).
- Netlister with diagnostics, using the connectivity rules of ARCHITECTURE §6.1.
- IndexedDB autosave; `.nodal.json` import/export.
- Reference circuits as generated `.nodal.json` schematics with layout, in `validation/schematics/`.

**Exit:** every reference circuit in `validation/circuits/` has a schematic in `validation/schematics/` that loads in the editor, and its netlist is equivalent (same topology and values) to the reference IR; netlister tests cover T-junctions, crossings without dots, and labels joining separate wires; a project survives export, import and a page reload.
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/44972529504 at 531aa35 (rust, web, deploy green). Its [web job](https://github.com/TristanHottier/Nodal/actions/runs/44972529504/job/137055209655) runs `reference.test.ts` (31 schematics in `validation/schematics/`, zero diagnostics, netlist equivalent to the reference IR with exact title and node names, plus a test that the schematic and reference id sets match), `reference.editor.test.tsx` (each schematic loads in the editor with every part rendered and "No problems"), the netlister tests (`nets.test.ts` covers T-junctions, crossings without dots and labels joining separate wires) and the Playwright round trip on Chromium and Firefox (open A1, edit R1, reload, export). The [deploy job](https://github.com/TristanHottier/Nodal/actions/runs/44972529504/job/137055688336) published the editor to https://tristanhottier.github.io/Nodal/.

### M6 — Simulation in the browser · done
- `nodal-wasm` in a Web Worker: run, progress, cancel.
- Analysis setup panel; operating-point values overlaid on the schematic.
- Waveform viewer: probes, multiple traces, cursors, Bode view.
- Engine errors shown on the schematic (highlight the element or node).
- Playwright smoke test.

**Exit:** draw → simulate → plot works end to end for all four analyses; the browser results for circuits T1 and A1 match the CLI output to a relative difference ≤ 1e-12 (native and wasm32 builds may differ in the last bits of `exp` and `ln`).
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/44990835762 at 27d142b (rust, web, deploy green). Its [web job](https://github.com/TristanHottier/Nodal/actions/runs/44990835762/job/137111306571) runs `parity.test.ts`, which calls the wasm `run` entry point directly with the same IR as the CLI and finds a largest relative difference of 0 for T1-trap, T1-gear and A1 (the limit is 1e-12). The same job runs `simulate.spec.ts` on Chromium and Firefox: it draws a divider and reads its operating-point tags, runs T1-trap and reads `V(out)` at a cursor, runs A1 and reads the Bode magnitude at 159.155 Hz, plots the N1 DC sweep, cancels a long transient and reruns it, and highlights both sources of a source loop. The optimized WASM is 216.45 kB gzipped (faer linked). The [deploy job](https://github.com/TristanHottier/Nodal/actions/runs/44990835762/job/137111971790) published the app to https://tristanhottier.github.io/Nodal/, where A1 opens, runs and shows the Bode pair.

### M7 — v1 content and performance · done
- Performance budget met (below); if dense LU misses it, add the sparse backend ([ADR 0003](adr/0003-linear-solver.md)).
- Example projects: divider, RC/RLC filters, half- and full-wave rectifiers, common-emitter amplifier, CMOS inverter, op-amp inverting amplifier.
- User guide in `docs/`; README status updated with what v1 does, backed by the validation results.

**Exit:** budget met; examples load and simulate. The `v1.0.0` tag moves to M8, so v1 ships with the final design.
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/45001613473 at 9fb3ac1 (rust, web, deploy green). Its [web job](https://github.com/TristanHottier/Nodal/actions/runs/45001613473/job/137144178009) runs `pnpm --filter @nodal/web e2e:perf`, which opens `bench.html` in headless Chromium on GitHub Actions `ubuntu-latest` with optimized WASM: the 50-node transient (`validation/perf/tran50.json`, at least 10,000 accepted points) takes a median of 409.0 ms of 5 runs against 1,000 ms, the AC sweep (1,001 frequencies) 47.4 ms against 200 ms, and editor pan and zoom with 500 parts runs at 60.0 fps with 0 slow frames of 240. The optimized WASM is 246,484 bytes gzipped. The same job runs `examples.test.ts`, which netlists the eight examples, runs every analysis of each in the wasm engine and checks one expected value per example. On Tristan's laptop in desktop Chrome (2026-11-22, https://tristanhottier.github.io/Nodal/bench.html at 93c38f1, all rows pass): transient median 599.6 ms (samples 586.3, 599.6, 572.6, 662.5, 860.3), AC median 82.1 ms (samples 83.9, 68.1, 82.1, 78.4, 93.4), editor pan and zoom 60.3 fps (pan 59.8, zoom 60.8) with 7 slow frames of 240 (limit 12).

### Performance budget (checked in M7, desktop Chrome on a mid-range laptop)

| Case | Target |
|---|---|
| Transient, 50-node mixed linear/nonlinear circuit, 10,000 accepted points | < 1 s |
| AC sweep, 50 nodes, 1,000 frequencies | < 200 ms |
| Editor pan/zoom with 500 parts | 60 fps |
| WASM module, gzipped | < 1 MB |

### M8 — Web design overhaul and v1 release · done

The whole web app gets one coherent visual design, replacing the per-milestone styling from M0–M7. The app is an Operate surface in impeccable terms: an editor and a tool, where scanability and precision come before expression. Behaviour, copy and features stay as they are; this milestone changes only how the app looks and feels.

- **Product and design context:** run impeccable `init` to write `PRODUCT.md`, then `shape` the visual direction. Record the chosen direction, palette and type scale in an ADR before any restyling.
- **Design tokens:** one token file (CSS custom properties, colors in OKLCH) for color, type scale, spacing, radius, elevation and motion. Components use tokens only; no raw color or size values in component code. Impeccable `document` writes `DESIGN.md` from the result.
- **60/30/10 color rule:** dominant neutral (canvas and page background), then secondary (panels, toolbars, inspector), then accent (primary actions, selection, focus), checked on screenshots of the editor and of the waveform viewer. Applied as a role order rather than fixed shares (Tristan's ruling, 2026-11-22): measured shares are 75–79 % canvas, 21–25 % panels and about 0.1 % accent. Exempt from the rule, but still defined as tokens: semantic colors (error, warning, success) and the waveform trace palette.
- **Light and dark themes** from the same tokens, following `prefers-color-scheme`, with a manual toggle stored per browser.
- **Trace and schematic colors:** waveform traces, net highlights and operating-point tags stay distinguishable under the three common color-vision deficiencies (simulated protanopia, deuteranopia, tritanopia), and never rely on color alone: each trace also has a label in the legend and at the cursor readout.
- **Typography:** a type scale with at most two families (UI and monospace for values and code); tabular numerals in every numeric readout.
- **Motion:** short, purposeful transitions only; everything respects `prefers-reduced-motion`.
- **Responsive:** usable from 1280 px wide down to 1024 px wide. Below that, the app shows the schematic read-only and says the editor needs a wider screen.
- **Impeccable passes,** in this order, on the whole app: `critique`, then `audit`, then fixes, then `polish`. Every finding marked must-fix is fixed or written down with a reason in the M8 plan.

**Exit:**
- Accessibility: zero WCAG 2.2 AA violations from axe-core in the Playwright run, on the editor, the inspector, the analysis panel and the waveform viewer, in both themes. Every action reachable by keyboard, with a visible focus ring. WCAG 2.2 AA is the target because WCAG 3 is still a W3C Working Draft.
- Contrast: text at least 4.5:1 (3:1 for large text), UI components and focus rings at least 3:1, in both themes, checked from the token values by a unit test.
- Performance on the Pages URL, Lighthouse mobile and desktop lab runs: LCP ≤ 2.5 s, CLS ≤ 0.1, Total Blocking Time ≤ 200 ms (the lab proxy for INP ≤ 200 ms). The M7 performance budget still holds.
- Impeccable `audit` reports no must-fix findings; `critique` and `audit` reports are committed under `docs/design/`.
- No raw color or spacing values outside the token file (lint rule or test).
- All existing unit and Playwright tests pass. Visual regression screenshots of the main views in both themes are committed.
- `v1.0.0` tag.

**Evidence:** CI run [45119585775](https://github.com/TristanHottier/Nodal/actions/runs/45119585775) at `dea33b6`: Rust, web (unit, e2e on Chromium and Firefox including axe in both themes and the stale state, keyboard reach and keyboard selection, responsive, visual regression, colour shares), deploy and Lighthouse all green. Lighthouse medians: mobile LCP 807 ms, CLS 0.000, TBT 71 ms; desktop LCP 259 ms, CLS 0.000, TBT 0 ms. Editor pan/zoom with 500 parts: 60 fps, 0 of 240 slow frames. Impeccable re-audit: no must-fix (`docs/design/audit.md`). Plan: `docs/plans/2026-11-22-m8-design-overhaul.md`.

## v1.1 milestones

### M9 — Cursor B fix and modern redesign (v1.1.0) · done

Two problems Tristan found using v1.0.0 (2026-11-22): there is no discoverable way to place waveform cursor B, and the app looks dated. This milestone fixes both and ships as `v1.1.0`. The plan is [`docs/plans/2026-11-22-m9-cursor-b-and-redesign.md`](plans/2026-11-22-m9-cursor-b-and-redesign.md), approved by Tristan on 2026-11-22.

- **Cursor B:** a user who has never read the guide can place, move and remove both cursors with the mouse or the keyboard. Shift+click keeps working.
- **Modern look, in two passes:**
  - First, a conventional modern web-app baseline (a "generic SaaS" look).
  - Then impeccable runs to turn the baseline into a distinctive design: `critique`, then `bolder`/`quieter`/`colorize` as the critique calls for, then `audit` and `polish`.
  - The new direction goes in an ADR that supersedes the visual parts of ADR 0012.
- **Kept from M8:** design tokens as the only raw values, light and dark themes, the brand mark, the 1024 px read-only rule, the accessibility, contrast, visual-regression, colour-share and Lighthouse checks.
- **Layout and controls may change** (icons, toolbars, panel structure, control styling). Features and the circuit and file formats don't change. Copy changes only where the new layout needs them.

**Exit:**
- Cursor B: an e2e test places A and B by the new interaction, moves each, and reads the delta row. A keyboard path does the same. The user guide documents both.
- Design: a new ADR records the direction, and `apps/web/DESIGN.md` is regenerated from it. Impeccable `critique` and `audit` reports for M9 are committed under `docs/design/`, and `audit` reports no must-fix.
- All M8 exit checks still pass in both themes: axe WCAG 2.2 AA (editor, inspector, analysis editor, waveform, stale state), keyboard reach and canvas keyboard selection, the token contrast tests, the colour-share role order, the Lighthouse limits on the Pages URL, and the M7 performance budget.
- Visual baselines are re-rendered on CI, and the user-guide screenshots are regenerated.
- Version `1.1.0` in every pinned place, and the `v1.1.0` tag.

**Evidence:** CI run [45284350475](https://github.com/TristanHottier/Nodal/actions/runs/45284350475) at `2e82370`: Rust, web (unit, e2e on Chromium and Firefox including `cursors.spec.ts` for the mouse and keyboard paths, axe in both themes and the stale state, keyboard reach, responsive, layout, visual regression on CI baselines, colour shares, perf), deploy and Lighthouse all green. Lighthouse medians on the job re-run: mobile LCP 772 ms, CLS 0.000, TBT 61 ms; desktop LCP 230 ms, CLS 0.000, TBT 0 ms (the first attempt measured mobile TBT 235 ms). Perf in CI run [45278492943](https://github.com/TristanHottier/Nodal/actions/runs/45278492943) at `951bdb6`: editor pan/zoom with 500 parts 59.5 fps, 2 of 240 slow frames; transient 732.0 ms; AC 78.9 ms; WASM 246,485 bytes gzipped. Design: ADR 0013, `docs/design/m9-critique.md`, `docs/design/m9-audit.md` (re-audit: no must-fix), regenerated `apps/web/DESIGN.md` and user-guide screenshots. The `v1.1.0` tag is created by Tristan (the sandbox can't push tags).

## After v1 (not designed yet)

Listed to bound v1 scope. None of these is a commitment. Order is not fixed.

- **Public polish:** onboarding, example gallery, browser support matrix. (The accessibility pass is part of M8.)
- ANSI symbol style toggle.
- KiCad symbol import.
- Subcircuits and hierarchical schematics.
- Model library with real part numbers (vendor SPICE models).
- More device models: BJT parasitic resistances and high-injection, MOSFET Level 2/3 or BSIM, JFET, transmission line, behavioural sources.
- Temperature dependence; parameter sweep; Monte Carlo; noise analysis.
- Sparse LU; performance work for large circuits.
- Digital logic and mixed-signal.
- Microcontroller emulation (AVR first).
- Accounts and share links (would need a backend; revisit [ADR 0004](adr/0004-local-first-no-backend.md)).
