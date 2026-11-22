# Nodal

Browser-based schematic editor and analog circuit simulator. The simulation engine is written in Rust and runs in the browser as WebAssembly.

> **Status: pre-alpha. M7 done: the web app is a schematic editor with the four analyses, eight example projects and a user guide. The `v1.0.0` tag comes with the final design in M8.**
> Live editor: https://tristanhottier.github.io/Nodal/

What works today:

- Draw a schematic (place parts, wires, net labels), edit values, check problems, save and load `.nodal.json` files. Work is autosaved in the browser.
- Run DC operating point, DC sweep, AC small-signal (linear, decade and octave sweeps) and transient analysis (trapezoidal and Gear integration, pulse, sine and PWL sources, `uic`, switch hysteresis) in the browser. The engine is Rust compiled to WebAssembly and runs in a worker. Runs can be cancelled.
- See operating-point values on the schematic. Plot results with probes, cursors and a Bode view. Engine errors are marked on the schematic.
- Open one of eight examples from the "Open example" select in the project bar: divider, RC low-pass, RLC band-pass, half-wave rectifier, full-wave bridge rectifier, common-emitter amplifier, CMOS inverter and inverting op-amp. The [user guide](docs/user-guide.md) walks through drawing and simulating.
- Devices: R, L, C, V, I, E, G, H and F elements plus diode, BJT, MOSFET Level 1 and voltage-controlled switch, with junction and overlap capacitances in AC and transient.
- `nodal-cli` has three commands: `run` simulates a netlist, `export-spice` prints an ngspice deck, and `validate` compares results with the ngspice goldens in `validation/`.

Nothing else described below exists unless [`docs/ROADMAP.md`](docs/ROADMAP.md) marks it as done.

### Validation results

CI compares 30 golden results with ngspice-42 and all pass (CI run [45001613473](https://github.com/TristanHottier/Nodal/actions/runs/45001613473) at 9fb3ac1). "Worst err/tol" is the largest ratio of error to tolerance over the suite, so a value below 1 passes. Tolerances are in [`docs/VALIDATION.md`](docs/VALIDATION.md).

| Analysis | Circuits | Worst err/tol |
|---|---|---|
| Operating point | L1, L2, L3, L5, N2, N5 | 5.4e-9 (N2) |
| DC sweep | N1, N3 (3 sweeps), N4, N6 | 0.099 (N6) |
| AC | A1 to A6 | 1.4e-3 (A3) |
| Transient | T1 to T6, each with trapezoidal and Gear | 0.818 (T4, trapezoidal) |

L4 is checked against an analytic solution in the Rust tests. The examples are tested in `apps/web/src/examples/examples.test.ts`: each netlists cleanly, every analysis runs in the wasm engine, and one expected value each is checked. Each of those values was compared once with ngspice-42 (worst relative difference 3e-6). The common-emitter example uses tight solver options; at default tolerances its AC gain differs from ngspice by 2.6 %, which is an open item.

### Performance budget

Measured by `pnpm --filter @nodal/web e2e:perf`, which opens `bench.html` in headless Chromium on GitHub Actions `ubuntu-latest` with optimized WASM (run 45001613473).

| Case | Budget | Measured |
|---|---|---|
| Transient, 50 nodes, at least 10,000 accepted points | < 1 s | 409.0 ms (median of 5) |
| AC sweep, 50 nodes, 1,001 frequencies | < 200 ms | 47.4 ms (median) |
| Editor pan and zoom, 500 parts | 60 fps | 60.0 fps, 0 slow frames (> 25 ms) of 240 |
| WASM module, gzipped | < 1 MB | 246,484 bytes |

The test passes with a mean of at least 58 fps and at most 5 % slow frames, to allow for timer jitter. The measurement on a laptop in desktop Chrome is still pending; anyone can run it at https://tristanhottier.github.io/Nodal/bench.html.

## What v1 will do

- Draw a schematic on a grid: place parts, rotate and mirror them, draw orthogonal wires, label nets.
- Simulate it entirely in the browser, with no server:
  - DC operating point
  - DC sweep
  - AC small-signal (Bode plots)
  - Transient
- Plot node voltages and branch currents in a waveform viewer.
- Save projects in the browser and import/export them as `.nodal.json` files.

**v1 devices:** R, L, C · independent voltage and current sources (DC, AC, pulse, sine, PWL) · VCVS, VCCS, CCVS, CCCS · ideal op-amp · diode · BJT (NPN/PNP) · MOSFET Level 1 (N/P) · voltage-controlled switch.

**Not in v1:** digital logic, microcontroller emulation, accounts and sharing, PCB layout. See the roadmap for what comes later.

## How correctness is checked

Every analysis is compared against [ngspice](https://ngspice.sourceforge.io/) on a fixed suite of reference circuits, and simple circuits are also checked against closed-form solutions. CI blocks any change that breaks the suite. Accuracy claims in these docs are limited to what a passing test shows; see [`docs/VALIDATION.md`](docs/VALIDATION.md).

## Planned stack

| Part | Choice |
|---|---|
| Engine | Rust library crate, compiled to WASM, run in a Web Worker; native CLI for tests |
| Frontend | Vite, React, TypeScript, Zustand, SVG editor, uPlot |
| Storage | IndexedDB in the browser; JSON files for import/export |
| Hosting | Static site on GitHub Pages |
| Validation | ngspice golden files, analytic checks, Jacobian finite-difference tests |

## Documentation

| Document | Contents |
|---|---|
| [`docs/user-guide.md`](docs/user-guide.md) | How to draw, simulate and read results in the app |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Repo layout, data flow, engine design, file formats |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones with exit criteria and current status |
| [`docs/VALIDATION.md`](docs/VALIDATION.md) | Reference circuits, tolerances, how goldens are made |
| [`docs/adr/`](docs/adr/) | Architecture decision records |
| [`docs/reference/`](docs/reference/) | MNA stamps, device equations, numerical methods |
| [`AGENTS.md`](AGENTS.md) | Rules for anyone (human or AI) writing code here |

## License

[MIT](LICENSE) © 2026 Tristan Hottier
