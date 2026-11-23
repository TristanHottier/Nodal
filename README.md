<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo-dark.svg">
  <img src="docs/brand/logo-light.svg" alt="Nodal" height="64">
</picture>

# Nodal

Browser-based schematic editor and analog circuit simulator. The simulation engine is written in Rust and runs in the browser as WebAssembly.

> **Status: v1.0.0. The web app is a schematic editor with the four analyses, eight example projects, a user guide and the "Solderless" design: light and dark themes, a read-only schematic view below 1024 px wide, and probed nets drawn in their trace colour.**
> Live editor: https://tristanhottier.github.io/Nodal/

What works today:

- Draw a schematic (place parts, wires, net labels), edit values, check problems, save and load `.nodal.json` files. Work is autosaved in the browser.
- Run DC operating point, DC sweep, AC small-signal (linear, decade and octave sweeps) and transient analysis (trapezoidal and Gear integration, pulse, sine and PWL sources, `uic`, switch hysteresis) in the browser. The engine is Rust compiled to WebAssembly and runs in a worker. Runs can be cancelled.
- See operating-point values on the schematic. Plot results with probes, cursors and a Bode view. Engine errors are marked on the schematic.
- Open one of eight examples from the "Open example" select in the project bar: divider, RC low-pass, RLC band-pass, half-wave rectifier, full-wave bridge rectifier, common-emitter amplifier, CMOS inverter and inverting op-amp. The [user guide](docs/user-guide.md) walks through drawing and simulating.
- Switch between light and dark with the Theme select in the status bar (it follows your OS by default). The editor works from 1024 px wide; in narrower windows the schematic is shown read-only. The design rules are in [`apps/web/DESIGN.md`](apps/web/DESIGN.md).
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

The test passes with a mean of at least 58 fps and at most 5 % slow frames, to allow for timer jitter. On Tristan's laptop in desktop Chrome (2026-11-22, deployed app at 93c38f1) the same page gave a transient median of 599.6 ms (samples 572.6 to 860.3 ms), an AC median of 82.1 ms, and 60.3 fps for pan and zoom with 7 slow frames of 240. Anyone can run it at https://tristanhottier.github.io/Nodal/bench.html.

### Page load

Lighthouse lab runs against https://tristanhottier.github.io/Nodal/ in the `lighthouse` CI job (median of 3 runs, CI run [45119585775](https://github.com/TristanHottier/Nodal/actions/runs/45119585775) at dea33b6). The limits are LCP 2.5 s, CLS 0.1 and TBT 200 ms.

| Profile | LCP | CLS | TBT |
|---|---|---|---|
| Mobile | 807 ms | 0.000 | 71 ms |
| Desktop | 259 ms | 0.000 | 0 ms |

In the same run, `e2e:perf` measured editor pan and zoom with 500 parts at 60 fps with 0 slow frames of 240 (limit 12). The CI job also runs axe-core (WCAG 2.2 AA) on the editor, inspector, analysis panel and waveform viewer in both themes; it finds no violations.

## What v1 does

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

## Stack

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

## Credits

| Asset | Source | Licence |
| --- | --- | --- |
| Inter (UI font, self-hosted Latin subset) | [Inter](https://rsms.me/inter/) via `@fontsource-variable/inter` | SIL Open Font License 1.1 |
| JetBrains Mono (numbers and code, self-hosted Latin subset) | [JetBrains Mono](https://www.jetbrains.com/lp/mono/) via `@fontsource-variable/jetbrains-mono` | SIL Open Font License 1.1 |
| Lucide (UI icons) | [`lucide-react`](https://lucide.dev/) | ISC |
| Poppins (outlined in the wordmark) | [Poppins](https://fonts.google.com/specimen/Poppins) | SIL Open Font License 1.1 |

Details and copyright lines are in [`docs/brand/CREDITS.md`](docs/brand/CREDITS.md).

## License

[MIT](LICENSE) © 2026 Tristan Hottier
