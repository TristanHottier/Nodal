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
- Node `"0"` is ground. Other node names match `^[A-Za-z0-9_]+$`. The name `gnd` in any case is reserved, because ngspice treats it as ground; use `"0"`.
- Values are SI base units as JSON numbers. Suffix parsing (`4.7k`, `10u`) happens only in the UI ([ADR 0009](adr/0009-value-notation.md)).
- Device models (`D`, `NPN`, `PNP`, `NMOS`, `PMOS`, `SW`) are named entries in `models`, each `{name, type, params}`. Parameter keys are the uppercase SPICE names (`IS`, `BF`); other keys are rejected.
- Element names match `^[RLCVIEGHFDQMS][A-Za-z0-9_]*$`, and the first letter is the element kind (`R1`, `V1`, `D1`, `Q1`, `M1`, `S1`).
- The DC sweep analysis is `{"type":"dc","source":…,"start":…,"stop":…,"step":…}`, where `source` names a voltage or current source.
- `options.temp` is fixed at 27 in v1; any other value is rejected.
- Element names are unique, and so are node names. Both are compared ignoring case, because ngspice folds case.
- An element's two nodes must differ.
- Current-controlled sources reference a voltage source by name, as in SPICE.
- Capacitors and inductors take an optional `ic` (initial voltage or current), used when the transient analysis sets `"uic": true`.
- An optional top-level `nodeset` maps node names to initial guesses for the DC operating point. The engine holds each listed node near its value during the first Newton solve, then releases it, so it picks among valid solutions but does not constrain the final answer (numerical-methods §1.4).

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

### 4.2 Device trait

```rust
trait Device {
    fn state_len(&self) -> usize { 0 }
    /// Stamp the companion model at the iterate x. Returns true if limiting
    /// changed a junction voltage.
    fn load(&self, x: &[f64], state: &mut [f64], ctx: &LoadContext, sys: &mut RealSystem) -> bool;
    /// Stamp dQ/dv (and -L on an inductor branch row) into the reactive
    /// matrix C. Called once per AC run. Never touches C's right-hand side.
    fn load_reactive(&self, x: &[f64], state: &[f64], ctx: &LoadContext, c: &mut RealSystem) {}
    /// Stamp the AC phasor of an independent source.
    fn load_ac_excitation(&self, b: &mut AcExcitation) {}
    fn converged(&self, x_new: &[f64], state: &[f64], ctx: &LoadContext) -> bool { true }
    /// Offsets of each charge q in the device state; q + 1 holds its current.
    fn charge_slots(&self) -> &'static [usize] { &[] }
    /// Store every charge at x (or at the element ic values with uic).
    fn init_charges(&self, x: &[f64], state: &mut [f64], uic: bool) {}
    /// First source waveform corner strictly after t.
    fn next_breakpoint(&self, t: f64) -> Option<f64> { None }
    /// Fraction of the step at which a stored device state (a switch) changed
    /// between two accepted-candidate points, or None.
    fn crossing(&self, x_prev: &[f64], x_new: &[f64], prev: &[f64], new: &[f64]) -> Option<f64> { None }
    /// Independent sources: replace the DC value, and read it back.
    fn set_dc(&mut self, value: f64) -> bool { false }
    fn dc_value(&self) -> Option<f64> { None }
    /// Independent sources: the waveform value at time t.
    fn tran_value(&self, t: f64) -> Option<f64> { None }
}
```

Limiting happens inside `load`, as in SPICE, so there is no separate limit method. `load` receives the iterate `x`, the device's slice of the state vector (previous limited voltages, currents and conductances, or charges and currents) and a `LoadContext` (mode, gmin, source factor, tolerances, and an optional `tran`). `Device::converged` is the device's own convergence test. `load` cannot return an error, so a device that fails (for example a state slice too short for its charge slots) calls `RealSystem::fault`, which keeps the first error, and the Newton loop returns it as a fatal error after loading.

In a transient step `ctx.tran` carries the time being solved for, the integration coefficients and the device's own slices of the states accepted at the previous three time points. A capacitor then stores `q = C v`, integrates it and stamps the companion conductance and current, and an inductor integrates its flux and rewrites its branch row. Independent sources take their value from the waveform at that time, or from `dc` when they have none. Without `tran`, including the transient's initial operating point, capacitors stay open, inductors stay shorted and sources use `dc` times the source factor. The transient driver reads `charge_slots` for the truncation error, `init_charges` for the initial state, `next_breakpoint` for forced time points, `crossing` to reject a step in which a switch changed state, and `dc_value`, `set_dc` and `tran_value` to put sources at their t = 0 value for the initial operating point and restore their DC values afterwards.

AC analysis uses `LoadMode::SmallSignal`. In it `load` stamps the conductance matrix $G$ at the operating point without writing state: a diode or BJT reads the junction voltages stored by the last Newton load, a MOSFET reads `x` limited against the state, and a switch keeps its stored on/off state. `load_reactive` fills $C$, and `load_ac_excitation` fills the phasor right-hand side. Per frequency, `mna::assemble_ac` forms $G + j\omega C$ and a dense complex LU solves it.

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
| `gmin` | 1e-12 S | Conductance across every pn junction, including the two bulk junctions of each MOSFET. |
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
- **Connectivity rule:** two items connect if a pin or wire endpoint lies on another pin, wire endpoint, or any point of a wire, including its bends. A net label connects to whatever pin, wire end or wire point lies at its anchor. Label anchors never create junction dots. Crossing wires without a dot do not connect. A wire endpoint landing inside a wire segment, or a third connection at one point, creates a junction dot (see the next rule). The shared predicates are `pointOnWire` and `isConnectionPoint` in `model/connectivity.ts`.
- **Junction dots:** only points where a wire ends or a pin sits are examined. At such a point `P`, the degree is the number of wire ends at `P`, plus the number of pins at `P`, plus 2 for each wire that passes through `P` (at an inner vertex or strictly inside a segment). Each wire counts at most once per point, and a wire with an end at `P` adds only its ends. `P` gets a dot when the degree is 3 or more. Wires that only cross get no dot, and label anchors do not count.
- **Symbol transform:** a symbol-local point `p` of a part at `(x, y)` is mirrored first (`(px, py) → (−px, py)` when `mirror` is set), then rotated clockwise on screen (`90: (px, py) → (−py, px)`, `180: → (−px, −py)`, `270: → (py, −px)`), then translated by `(x, y)`. All coordinates are integers in grid units.
- Nets get names from net labels; unlabeled nets get generated names (`N001`…). The ground symbol forces net `0`.
- Undo/redo: every edit produces a new immutable document (Immer); history keeps snapshots with structural sharing.
- **Interaction:** the palette picks the Select, Wire or place tool. Clicking with a place tool puts the part or label on the nearest grid point. The wire tool starts a wire on the first click and ends it on a click at a pin, a net label anchor, a wire end or any point of a wire. The wire preview has one bend, and `/` moves it to the other corner. Dragging with Select moves the selection.
- **Keymap:** `R` rotate, `X` mirror, `Delete` or `Backspace` delete, `Ctrl/Cmd+C` and `Ctrl/Cmd+V` copy and paste, `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` redo, `W` wire tool, `/` toggle the bend, `Enter` or double click finish a wire, `Esc` cancel. The mouse wheel zooms; middle-button drag or `Space` plus drag pans.
- **Inspector, problems and files:** the right column shows the selected part's fields and edits them with value notation (ADR 0009); a value commits on blur or Enter. Below it, the Problems list shows the netlister diagnostics for the current document, or "No problems". The project bar above the tools has New, Open… and Save as… for `.nodal.json` files; replacing a non-empty document asks for confirmation, and a file that fails validation leaves the document unchanged and reports the reason in the status bar. The document is autosaved to IndexedDB 500 ms after the last edit and on `pagehide`, and restored on load.

### 6.2 Netlister

`projectToNetlist(project)` is a pure function that returns `{ ir, diagnostics }`. The code lives in `apps/web/src/netlist/`: `nets.ts` (connectivity and net names), `elements.ts` (parts to IR elements), `netlister.ts` (orchestration and checks) and `equivalence.ts` (`compareNetlists`, used to compare a schematic with a reference IR). It has unit tests and needs no browser.

**Nets.** Union-find has one node per pin, per wire and per label. At every pin position, wire end and label anchor `P`, it joins the pins, wire ends and labels at `P` and every wire for which `pointOnWire(w, P)` holds. A wire is one conductor, and bends and crossings are not connection points. All ground pins share one net.

**Names.**
- A ground pin names its net `0`. A net label names its net. Labels whose text is equal ignoring ASCII case join their nets, and the net takes the first spelling in document order.
- A label must match `^[A-Za-z0-9_]+$` and must not be `0` or `gnd` in any case (`bad-label`). Labels on nets without pins are ignored.
- Other nets get `N001`, `N002`, … (`N1000` after `N999`) in order of first pin: parts in document order, pins in catalog order. Names equal to a label ignoring case are skipped.

**Elements.** Parts become elements in document order; ground parts produce none. The kind letter comes from the symbol prefix, and an op-amp becomes `E` plus its part name with nodes `[out, "0"]` and `controlNodes: [inp, inn]`. Element nodes follow pin order. Only the fields in `PARAM_FIELDS` whose `when` condition holds are read. Values use the notation of [ADR 0009](adr/0009-value-notation.md). Optional empty fields are left out and the IR defaults apply. A source with `acMag` gets `ac: { mag, phase }`, with the phase defaulting to 0. References (`model`, `controlSource`, a DC sweep `source`) must match a name exactly.

**Diagnostics.** Each has a severity, a code, a message that names the part and field, and the ids of the parts or labels involved where there are any. `ir` is `null` when any error is present.

| Code | Severity | Meaning |
|---|---|---|
| `no-ground` | error | No ground symbol in the schematic. |
| `invalid-value` | error | A field does not parse, for example `R1 value: not a number: 4,7k`. |
| `missing-value` | error | A required field is empty. |
| `bad-name` | error | A part name does not fit the IR element rules or does not start with the kind letter. |
| `duplicate-name` | error | Two IR element names are equal ignoring case. |
| `bad-label` | error | A label has characters outside the node-name set, or is `0` or `gnd`. |
| `label-conflict` | error | One net has labels that differ beyond case, or a label sits on ground. |
| `missing-model` | error | A device has no model, or the named model does not exist. |
| `model-type-mismatch` | error | The model type does not fit the device, for example `D1 model QMOD is NPN, expected D`. |
| `invalid-model` | error | A model parameter does not parse. |
| `unknown-control-source` | error | A CCVS or CCCS names no voltage source. The ids include a source whose name differs only in case. |
| `unknown-sweep-source` | error | A DC sweep names no voltage or current source. |
| `shorted-element` | error | Both terminals of a two-terminal element (any kind except Q and M) are on one net. |
| `ir-invalid` | error | `parseNetlist` rejected the result, for example a resistance of 0. The message carries its text without the internal path, and an issue about an element carries the id of the part that produced it. Model issues name the model and have no ids. |
| `dangling-pin` | warning | A pin has no other pin on its net. |
| `unconnected-part` | warning | Every pin of a part is alone on its net. It replaces the dangling-pin warnings of that part. |

Warnings do not stop netlist generation. Renaming a voltage source never rewrites the CCVS, CCCS or sweep that refers to it. The netlister reports `unknown-control-source` or `unknown-sweep-source` for each.

### 6.3 Symbols

Drawn from scratch as SVG, IEC 60617 style, pins on grid ([ADR 0007](adr/0007-iec-symbols-drawn-from-scratch.md)). One file per symbol, holding the geometry and the pin list.

### 6.4 Waveform viewer

uPlot. Click a net to probe its voltage; click a two-terminal part to probe its current. Transient and DC sweep use linear axes. AC shows magnitude (dB) and phase (degrees) against log frequency. Cursors give readouts and deltas.

## 7. Project file (`.nodal.json`)

```json
{ "format": "nodal-project", "formatVersion": 1, "name": "…", "createdAt": "…",
  "schematic": { "parts": [ … ], "wires": [ … ], "labels": [ … ] },
  "models": [ { "name": "D1N4148", "type": "D", "params": { "IS": "2.5n" } } ],
  "simulation": { "analyses": [ … ], "options": { … } } }
```

Loading validates with Zod and runs migrations from older `formatVersion`s. Unknown future versions are refused with a clear message.

A migration maps one version to the next. A file at version v goes through the migrations for v, v + 1 and so on up to the current version, and loading fails if a step is missing. Model parameters and part parameters are stored as the strings the user typed (for example `"2.5n"`); the netlister parses them with the value notation of [ADR 0009](adr/0009-value-notation.md).

## 8. Testing layers

| Layer | Tool | What |
|---|---|---|
| Device math | `cargo test` | Stamps on 1–3 element circuits; finite-difference Jacobian check for every nonlinear device. |
| Analyses | `cargo test` + `validation/` | Analytic circuits; ngspice golden comparison ([VALIDATION.md](VALIDATION.md)). |
| Netlister, schema | Vitest | Connectivity edge cases, file migrations. |
| Deployed shell and editor | Playwright (from M0, editor from M5a) | The production build served under `/Nodal/` loads the worker and `.wasm` and shows the engine version. The editor places a resistor and a ground, wires them, makes a junction dot and undoes it. |
| Reference schematics | Vitest (`reference.test.ts`) | Loads each of the 31 schematics in `validation/schematics/`, requires zero diagnostics and compares the netlist with the reference IR. |
| Project round trip | Playwright (from M5b) | Opens `A1.nodal.json`, edits R1 to `2k`, reloads the page (autosave) and exports a file that contains the edit. A file with an unsupported `formatVersion` reports an error and leaves the canvas unchanged. |
| End to end | Playwright (from M6) | Draw an RC circuit, run transient, check a probed value. |
