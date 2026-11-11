# Nodal

Browser-based schematic editor and analog circuit simulator. The simulation engine is written in Rust and runs in the browser as WebAssembly.

> **Status: pre-alpha: M1 done (linear DC operating point in the CLI); no simulation in the browser yet.**
> Live shell: https://tristanhottier.github.io/Nodal/
> The repository now holds the M0 bootstrap (workspaces, CI, and the empty app shell). Nothing else described below exists yet unless [`docs/ROADMAP.md`](docs/ROADMAP.md) marks it as done.

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
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Repo layout, data flow, engine design, file formats |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones with exit criteria and current status |
| [`docs/VALIDATION.md`](docs/VALIDATION.md) | Reference circuits, tolerances, how goldens are made |
| [`docs/adr/`](docs/adr/) | Architecture decision records |
| [`docs/reference/`](docs/reference/) | MNA stamps, device equations, numerical methods |
| [`AGENTS.md`](AGENTS.md) | Rules for anyone (human or AI) writing code here |

## License

[MIT](LICENSE) © 2026 Tristan Hottier
