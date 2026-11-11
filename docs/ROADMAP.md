# Roadmap

Status legend: **done** · **in progress** · **not started**

A milestone is done only when every exit criterion is met and CI is green. Status changes in the same commit that meets the last criterion.

The engine comes first: the editor is only useful once the numbers it shows can be trusted. M5 (editor) has no engine dependency and may start in parallel with M3 or M4.

## v1 milestones

### M0 — Repository bootstrap · done
- Cargo workspace with the three crates; pnpm workspace with `packages/schema` and `apps/web`.
- CI (GitHub Actions): `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`, `wasm-pack build`, `pnpm lint`, `pnpm test`, `pnpm build`.
- GitHub Pages deploy of the empty app shell from `main`, via GitHub Actions, served under `/Nodal/` ([ADR 0010](adr/0010-github-pages-hosting.md)).

**Exit:** CI green on `main`; `https://tristanhottier.github.io/Nodal/` serves the shell, including a WASM module loaded from a worker; `AGENTS.md` command table filled in.
Evidence: CI run https://github.com/TristanHottier/Nodal/actions/runs/43087709851 (rust, web, deploy green); https://tristanhottier.github.io/Nodal/ returns 200 and shows `Engine 0.1.0`.

### M1 — Linear DC engine · not started
- Netlist IR types (Rust serde + TS Zod) with schema tests in both languages.
- Devices: R, L (short), C (open), V, I, VCVS, VCCS, CCVS, CCCS.
- MNA assembly, dense LU behind the `LinearSolver` trait, DC operating point.
- Topology checks from ARCHITECTURE §4.5.
- `nodal-cli run <ir.json>` and `nodal-cli export-spice <ir.json>`.
- Validation harness: golden regeneration script, comparator, first reference circuits.

**Exit:** reference circuits L1–L4 ([VALIDATION.md](VALIDATION.md)) pass against analytic values, and L1–L3 also against ngspice goldens; topology errors name the offending elements.

### M2 — Nonlinear DC · not started
- Diode, BJT (NPN/PNP), MOSFET Level 1 (N/P), voltage-controlled switch (DC behaviour).
- Newton–Raphson with junction limiting; gmin stepping and source stepping fallbacks.
- DC sweep.

**Exit:** finite-difference Jacobian tests pass for every nonlinear device in every operating region; circuits N1–N5 pass.

### M3 — AC analysis · not started
- Complex MNA assembly; small-signal models of all devices, including junction and overlap capacitances.
- Linear, decade and octave sweeps.

**Exit:** circuits A1–A4 pass (magnitude and phase).

### M4 — Transient analysis · not started
- C, L and junction charges integrated with trapezoidal and BDF2.
- Source waveforms: pulse, sine, PWL, with breakpoints.
- LTE-based step control (ported from ngspice `cktterr.c`); `uic`; switch hysteresis, with step rejection and crossing location at each threshold crossing.

**Exit:** circuits T1–T6 pass with both `trap` and `gear`.

### M5 — Schematic editor · not started
- SVG canvas: grid, zoom, pan, selection, move, rotate, mirror, delete, copy/paste.
- IEC symbols for every v1 device, plus ground and net label.
- Orthogonal wire drawing; junction dots; connectivity rules from ARCHITECTURE §6.1.
- Parameter inspector with value-notation parsing ([ADR 0009](adr/0009-value-notation.md)).
- Undo/redo; IndexedDB autosave; `.nodal.json` import/export.
- Netlister with diagnostics.

**Exit:** every reference circuit in `validation/circuits/` can be drawn in the editor, and its netlist is equivalent (same topology and values) to the reference IR; netlister tests cover T-junctions, crossings without dots, and labels joining separate wires.

### M6 — Simulation in the browser · not started
- `nodal-wasm` in a Web Worker: run, progress, cancel.
- Analysis setup panel; operating-point values overlaid on the schematic.
- Waveform viewer: probes, multiple traces, cursors, Bode view.
- Engine errors shown on the schematic (highlight the element or node).
- Playwright smoke test.

**Exit:** draw → simulate → plot works end to end for all four analyses; the browser results for circuits T1 and A1 match the CLI output to a relative difference ≤ 1e-12 (native and wasm32 builds may differ in the last bits of `exp` and `ln`).

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
