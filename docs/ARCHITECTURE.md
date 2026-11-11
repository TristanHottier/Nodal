# Architecture

This document describes the planned design. Sections describe intent until the roadmap marks the matching milestone done. Decisions and their reasons live in [`adr/`](adr/).

## 1. Repository layout

```
nodal/
├── crates/
│   ├── nodal-engine/     Pure Rust simulator library. No browser or I/O dependencies.
│   ├── nodal-wasm/       Thin wasm-bindgen wrapper around nodal-engine.
│   └── nodal-cli/        Native CLI: netlist JSON in, results out; SPICE deck export.
├── packages/
│   └── schema/           TypeScript types + Zod schemas: project file, netlist IR, results.
├── apps/
│   └── web/              Vite + React app: editor, simulation runner, waveform viewer.
├── validation/
│   ├── circuits/         Reference circuits as netlist IR JSON.
│   ├── golden/           ngspice outputs (committed), one file per circuit and analysis.
│   └── scripts/          Golden regeneration and comparison tooling.
└── docs/
```

Tooling: Cargo workspace for `crates/`, pnpm workspace for `packages/` and `apps/`. No Turborepo; the workspace is small enough for plain pnpm scripts.

## 2. Data flow

```
 ┌──────────────────────── Browser main thread ────────────────────────┐
 │                                                                     │
 │  Editor (SVG)  ──edits──▶  Project document (Zustand + Immer)       │
 │                                   │                                 │
 │                                   ▼                                 │
 │                            Netlister (TS)                           │
 │                  geometry ─▶ connectivity ─▶ nets ─▶ netlist IR      │
 │                                   │                                 │
 └───────────────────────────────────┼─────────────────────────────────┘
                                     │ postMessage(netlist IR, analysis)
 ┌───────────────────────────────────▼──── Web Worker ─────────────────┐
 │  nodal-wasm  ─▶  nodal-engine  ─▶  results (Float64Array, transfer)  │
 └───────────────────────────────────┬─────────────────────────────────┘
                                     ▼
                       Waveform viewer (uPlot) · operating-point overlay
```

Three data shapes, each with one owner:

| Shape | Owner | Purpose |
|---|---|---|
| **Project document** | `apps/web` | What the user drew: parts with position, rotation, mirror and parameters; wire segments; net labels. Saved to IndexedDB and `.nodal.json`. |
| **Netlist IR** | `packages/schema` (TS) and `nodal-engine` (Rust, serde) | What the engine simulates: elements, node names, models, analysis requests. No geometry. |
| **Results** | `nodal-engine` | Per analysis: axis vector (time, frequency or sweep value) plus one vector per signal. Complex signals are stored as magnitude/phase pairs or re/im pairs, chosen by the caller. |

The netlist IR is the single contract between UI and engine. The CLI reads the same JSON, so every circuit the UI can build can also be tested headlessly.

## 3. Netlist IR (v1 sketch)

```json
{
  "irVersion": 1,
  "title": "RC low-pass",
  "elements": [
    { "kind": "V", "name": "V1", "nodes": ["in", "0"], "dc": 0, "ac": { "mag": 1, "phase": 0 },
      "tran": { "type": "pulse", "v1": 0, "v2": 1, "td": 0, "tr": 1e-9, "tf": 1e-9, "pw": 1e-3, "per": 2e-3 } },
    { "kind": "R", "name": "R1", "nodes": ["in", "out"], "value": 1000 },
    { "kind": "C", "name": "C1", "nodes": ["out", "0"], "value": 1e-6 }
  ],
  "models": [],
  "analyses": [
    { "type": "op" },
    { "type": "ac", "sweep": "dec", "points": 20, "fstart": 1, "fstop": 1e6 },
    { "type": "tran", "tstep": 1e-5, "tstop": 5e-3 }
  ],
  "options": { "temp": 27 }
}
```

Rules:
- Node `"0"` is ground. Other node names are free strings.
- Values are SI base units as JSON numbers. Suffix parsing (`4.7k`, `10u`) happens only in the UI ([ADR 0009](adr/0009-value-notation.md)).
- Device models (`D`, `NPN`, `PNP`, `NMOS`, `PMOS`, `SW`) are named entries in `models`, with SPICE parameter names.
- Names are unique per element. Current-controlled sources reference a voltage source by name, as in SPICE.
- Capacitors and inductors take an optional `ic` (initial voltage or current), used when the transient analysis sets `"uic": true`.
- An optional top-level `nodeset` maps node names to initial guesses for the DC operating point. It is a starting point for Newton, not a constraint.

## 4. Engine (`nodal-engine`)

### 4.1 Modules

```
nodal-engine/src/
├── ir/          serde types for the netlist IR; validation
├── circuit/     IR → indexed circuit: node map, branch-current unknowns, device instances
├── devices/     one module per device; each implements the Device trait
├── mna/         system assembly: real (DC, transient) and complex (AC)
├── linalg/      LinearSolver trait; dense LU backend (ADR 0003)
├── analysis/    op, dc_sweep, ac, tran
├── waveform/    source waveforms (pulse, sine, PWL) and their breakpoints
├── export/      SPICE deck writer (for validation against ngspice)
└── error.rs     typed errors; no panics in library code
```

### 4.2 Device trait (shape, not final API)

```rust
trait Device {
    /// Stamp the linearized companion model at the current Newton iterate.
    fn load(&self, x: &[f64], ctx: &LoadContext, sys: &mut RealSystem);
    /// Stamp the small-signal model at the stored operating point.
    fn load_ac(&self, op: &OpPoint, omega: f64, sys: &mut ComplexSystem);
    /// Limit junction voltages between Newton iterations (pnjlim, fetlim).
    fn limit(&self, x_new: &mut [f64], x_old: &[f64]) {}
    /// Accept a converged time point: store charges/currents for integration.
    fn accept(&mut self, x: &[f64], ctx: &TranContext) {}
    /// Local truncation error estimate for step control.
    fn truncation_error(&self, ctx: &TranContext) -> Option<f64> { None }
    /// Time points where this device's behaviour changes abruptly.
    fn breakpoints(&self, t0: f64, t1: f64, out: &mut Vec<f64>) {}
}
```

The stamps and equations each device must implement are in [`reference/mna.md`](reference/mna.md) and [`reference/devices.md`](reference/devices.md).

### 4.3 Analyses

| Analysis | Method |
|---|---|
| **DC operating point** | Newton–Raphson on the MNA system with capacitors open and inductors shorted. Junction voltage limiting every iteration. If plain Newton fails: gmin stepping, then source stepping. |
| **DC sweep** | Sweep one independent source; each point starts from the previous solution. |
| **AC** | Linearize every device at the DC operating point; solve the complex system $(G + j\omega C)\,x = b$ per frequency. Linear, decade or octave sweep. |
| **Transient** | Initial condition from the DC operating point (or user ICs with `uic`). Trapezoidal integration by default, BDF2 (Gear 2) optional. Variable step from local truncation error, with forced time points at source breakpoints. Newton–Raphson at each time point. |

Numerical details: [`reference/numerical-methods.md`](reference/numerical-methods.md).

### 4.4 Simulation options and defaults

Defaults match ngspice so comparisons are like-for-like.

| Option | Default | Meaning |
|---|---|---|
| `temp` | 27 °C | Circuit temperature (fixed for v1; no temperature dependence of model parameters). |
| `reltol` | 1e-3 | Relative convergence tolerance. |
| `vntol` | 1e-6 V | Absolute voltage tolerance. |
| `abstol` | 1e-12 A | Absolute current tolerance. |
| `gmin` | 1e-12 S | Conductance across every pn junction; across the drain–source channel of each MOSFET (a deviation from ngspice, see [reference/devices.md](reference/devices.md) §5). |
| `itl1` | 100 | Max Newton iterations, DC. |
| `itl4` | 10 | Max Newton iterations per transient time point before the step is cut. |
| `trtol` | 7 | Truncation-error overestimate factor. |
| `chgtol` | 1e-14 C | Absolute charge tolerance for step control. |
| `method` | `trap` | `trap` or `gear` (order 2). |
| `tmax` | min(`tstep`, (`tstop` − `tstart`)/50) | Largest allowed transient step. Set per transient analysis. |
| `uic` | false | Skip the DC operating point and start the transient from element `ic` values (0 where unset). Set per transient analysis. |

### 4.5 Errors the engine must report clearly

Detected before solving, reported with element and node names:
- Floating node (no DC path to ground).
- Loop of voltage sources and/or inductors (singular MNA matrix).
- Cut-set of current sources and/or capacitors.
- Reference to an unknown model or controlling source.

Detected while solving:
- DC non-convergence after all fallbacks (report the five unknowns with the largest last Newton update and the five nodes with the largest KCL residual).
- Time step too small (report time and the device with the largest truncation error).

## 5. WASM boundary (`nodal-wasm`)

- One exported entry point: `run(netlist_json: &str, analysis_index: u32) -> Result`.
- Results cross the boundary as `Float64Array`s, transferred (not copied) to the main thread.
- The engine reports progress (fraction of `tstop` or sweep done) through a callback every N accepted points.
- Cancel = terminate and respawn the worker. No `SharedArrayBuffer`, so no cross-origin isolation headers are needed. GitHub Pages can't set those headers anyway ([ADR 0010](adr/0010-github-pages-hosting.md)).

## 6. Frontend (`apps/web`)

### 6.1 Editor model

- Grid unit: 10 px at zoom 1. All pin positions lie on grid points.
- A part instance holds: `id`, `type`, `name` (R1…), position, rotation (0/90/180/270), mirror flag, parameters.
- A wire is a list of orthogonal segments between grid points.
- **Connectivity rule:** two items connect if a pin or wire endpoint lies on another pin, wire endpoint, or wire segment interior. A wire endpoint landing on a segment interior creates a junction dot. Crossing wires without a dot do not connect.
- Nets get names from net labels; unlabeled nets get generated names (`N001`…). The ground symbol forces net `0`.
- Undo/redo: every edit produces a new immutable document (Immer); history keeps snapshots with structural sharing.

### 6.2 Netlister

Pure TypeScript function `projectToNetlist(doc) → { ir, diagnostics }`. It does union–find over connection points, assigns net names, maps part parameters to IR elements, and reports dangling pins and unconnected parts. Unit-tested without a browser.

### 6.3 Symbols

Drawn from scratch as SVG, IEC 60617 style, pins on grid ([ADR 0007](adr/0007-iec-symbols-drawn-from-scratch.md)). One file per symbol, holding the geometry and the pin list.

### 6.4 Waveform viewer

uPlot. Click a net to probe its voltage; click a two-terminal part to probe its current. Transient and DC sweep use linear axes. AC shows magnitude (dB) and phase (degrees) against log frequency. Cursors give readouts and deltas.

## 7. Project file (`.nodal.json`)

```json
{ "format": "nodal-project", "formatVersion": 1, "name": "…", "createdAt": "…",
  "schematic": { "parts": [ … ], "wires": [ … ], "labels": [ … ] },
  "simulation": { "analyses": [ … ], "options": { … } } }
```

Loading validates with Zod and runs migrations from older `formatVersion`s. Unknown future versions are refused with a clear message.

## 8. Testing layers

| Layer | Tool | What |
|---|---|---|
| Device math | `cargo test` | Stamps on 1–3 element circuits; finite-difference Jacobian check for every nonlinear device. |
| Analyses | `cargo test` + `validation/` | Analytic circuits; ngspice golden comparison ([VALIDATION.md](VALIDATION.md)). |
| Netlister, schema | Vitest | Connectivity edge cases, file migrations. |
| End to end | Playwright (from M6) | Draw an RC circuit, run transient, check a probed value. |
