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

### M6 — Simulation in the browser · in progress
- `nodal-wasm` in a Web Worker: run, progress, cancel.
- Analysis setup panel; operating-point values overlaid on the schematic.
- Waveform viewer: probes, multiple traces, cursors, Bode view.
- Engine errors shown on the schematic (highlight the element or node).
- Playwright smoke test.

**Exit:** draw → simulate → plot works end to end for all four analyses; the browser results for circuits T1 and A1 match the CLI output to a relative difference ≤ 1e-12 (native and wasm32 builds may differ in the last bits of `exp` and `ln`).
Built so far, tested locally and not yet by CI: the worker engine with progress and cancel (terminate and respawn), the analysis setup panel and run bar, operating-point tags and per-part values, engine errors on the schematic, the waveform viewer (probes, derived resistor currents, two cursors, Bode pair, operating-point table), `parity.test.ts` (T1-trap, T1-gear and A1 results through the worker protocol equal the CLI output with maximum relative difference 0) and `simulate.spec.ts` (operating point, transient with cursor, Bode, DC sweep, cancel, error highlight on Chromium and Firefox).
Evidence: pending. To fill after the push: the CI run with the web job running `parity.test.ts` and `simulate.spec.ts`, the gzipped WASM size, the deploy job, and A1 run on the published site.

### M7 — v1 release · not started
- Performance budget met (below); if dense LU misses it, add the sparse backend ([ADR 0003](adr/0003-linear-solver.md)).
- Example projects: divider, RC/RLC filters, half- and full-wave rectifiers, common-emitter amplifier, CMOS inverter, op-amp inverting amplifier.
- User guide in `docs/`; README status updated with what v1 does, backed by the validation results.

**Exit:** budget met; examples load and simulate; `v1.0.0` tag.

### Performance budget (checked in M7, desktop Chrome on a mid-range laptop)

| Case | Target |
|---|---|
| Transient, 50-node mixed linear/nonlinear circuit, 10,000 accepted points | < 1 s |
| AC sweep, 50 nodes, 1,000 frequencies | < 200 ms |
| Editor pan/zoom with 500 parts | 60 fps |
| WASM module, gzipped | < 1 MB |

## After v1 (not designed yet)

Listed to bound v1 scope. None of these is a commitment. Order is not fixed.

- **Public polish:** onboarding, example gallery, accessibility pass, browser support matrix.
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
