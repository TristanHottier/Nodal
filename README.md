# Nodal

Browser-based schematic editor and analog circuit simulator. The simulation engine is written in Rust and runs in the browser as WebAssembly.

> **Status: pre-alpha. M6 in progress: the web app is a schematic editor that also runs the four analyses in the browser. You can draw, edit values, check problems, save and load project files, run an analysis, cancel it, see operating-point values on the schematic and plot results with probes and cursors. Your work is autosaved. M6 stays open until CI and the published site show it. The CLI runs the same analyses (M4).**
> Live editor: https://tristanhottier.github.io/Nodal/
> The repository holds the workspaces, CI, a schematic editor in the web app (place parts, draw wires, edit values, check problems, save and load project files, autosave), and the engine: DC operating point, DC sweep, AC small-signal analysis (linear, decade and octave sweeps) and transient analysis (trapezoidal and Gear integration, pulse, sine and PWL sources, `uic`, switch hysteresis) for R, L, C, V, I, E, G, H and F elements plus diode, BJT, MOSFET Level 1 and voltage-controlled switch, with junction and overlap capacitances in AC and transient. Circuits T1 to T6 match ngspice-42 for both integration methods within the tolerance in the validation docs. `nodal-cli` has three commands: `run` simulates a netlist, `export-spice` prints an ngspice deck, and `validate` compares results with the ngspice goldens in `validation/`. The web app runs the engine as WebAssembly in a worker: analysis setup, run and cancel, operating-point tags on the schematic, a waveform viewer with probes, cursors and a Bode view, and engine errors marked on the schematic. Nothing else described below exists unless [`docs/ROADMAP.md`](docs/ROADMAP.md) marks it as done.

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
