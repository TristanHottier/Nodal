# Architecture

This document describes the design of Nodal. Sections for milestones the roadmap has not marked done describe intent. Decisions and their reasons live in [`adr/`](adr/).

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
├── linalg/      LinearSolver trait; sparse LU backend, dense LU as test oracle (ADR 0003)
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

AC analysis uses `LoadMode::SmallSignal`. In it `load` stamps the conductance matrix $G$ at the operating point without writing state: a diode or BJT reads the junction voltages stored by the last Newton load, a MOSFET reads `x` limited against the state, and a switch keeps its stored on/off state. `load_reactive` fills $C$, and `load_ac_excitation` fills the phasor right-hand side. Per frequency, `mna::assemble_ac` forms $G + j\omega C$ and a sparse complex LU solves it.

The stamps and equations each device must implement are in [`reference/mna.md`](reference/mna.md) and [`reference/devices.md`](reference/devices.md).

### 4.3 Analyses

| Analysis | Method |
|---|---|
| **DC operating point** | Newton–Raphson on the MNA system with capacitors open and inductors shorted. Junction voltage limiting every iteration. If plain Newton fails, or hits a singular matrix: gmin stepping, then source stepping. |
| **DC sweep** | Sweep one independent source; each point starts from the previous solution. A singular matrix falls back to gmin and source stepping, as in the operating point. |
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

**Entry points.** `engine_version() -> String` and `run(netlist_json: &str, analysis_index: u32, on_progress: &js_sys::Function) -> Result<RunOutput, JsValue>`. `run` parses the netlist JSON, runs analysis number `analysis_index` of it through `nodal_engine::simulate_analysis` and encodes the result. `on_progress` receives fractions in `[0, 1]` (of `tstop` or of the sweep), at most once per 0.01 of progress and always for 1.0. Exceptions thrown by the callback are ignored. The code is in `crates/nodal-wasm/src/lib.rs` and `encode.rs`.

**Result.** `RunOutput` has a `meta` getter and a `take_data()` method. `meta` is JSON:

```json
{ "type": "tran", "source": null, "points": 501,
  "signals": [ { "name": "out", "kind": "v" }, { "name": "V1", "kind": "i" } ] }
```

`type` is `op`, `dc`, `ac` or `tran`. `source` is the swept source of a DC sweep and `null` otherwise. `kind` is `v` for a node voltage and `i` for a branch current. `take_data()` moves the data out as one flat `Float64Array`:

- The axis comes first: `points` values (sweep values, frequencies or times). An operating point has no axis.
- Then each signal in `signals` order, node voltages before branch currents, each group in name order. A signal has `points` real values and, for AC only, `points` imaginary values right after them.
- The total length is `axis + signals × points × (2 for ac, otherwise 1)`. `decodeResult` in `apps/web/src/engine/results.ts` checks it and returns views of the buffer.

**Errors.** On failure `run` throws a string that holds JSON: `{ "message": "…", "elements": ["V1", "V2"], "nodes": ["N001"] }`. `elements` and `nodes` name the circuit objects the engine blames, sorted and without duplicates. Errors without a location (parse errors, invalid input) have empty lists. The frontend maps them back to schematic items (`simulation/errorTargets.ts`).

**Worker protocol.** `apps/web/src/engine/engine.worker.ts` is a long-lived module worker that calls `init()` once. Requests are `{ type: "version", id }` and `{ type: "run", id, netlist, analysisIndex }`. Responses carry the same `id`: `version`, `progress` (`fraction`), `result` (`meta` and `data`) or `error` (the raw thrown value). The `data` buffer is transferred to the main thread, not copied. `EngineClient` (`client.ts`) runs one analysis at a time and creates the worker on first use.

**Cancel** is terminate and respawn: `EngineClient.cancel()` terminates the worker and rejects the pending run with `CancelledError`, and the next run starts a fresh worker. There is no `SharedArrayBuffer`, so no cross-origin isolation headers are needed. GitHub Pages can't set those headers anyway ([ADR 0010](adr/0010-github-pages-hosting.md)).

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
- **Interaction:** the tool rail picks the Select, Wire or place tool, and the parts panel picks the part to place. Clicking with a place tool puts the part or label on the nearest grid point. The wire tool starts a wire on the first click and ends it on a click at a pin, a net label anchor, a wire end or any point of a wire. The wire preview has one bend, and `/` moves it to the other corner. Dragging with Select moves the selection.
- **Keymap:** `R` rotate, `X` mirror, `Delete` or `Backspace` delete, `Ctrl/Cmd+C` and `Ctrl/Cmd+V` copy and paste, `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` redo, `W` wire tool, `/` toggle the bend, `Enter` or double click finish a wire, `Esc` cancel. The mouse wheel zooms; middle-button drag or `Space` plus drag pans.
- **Inspector, problems and files:** the right column shows the selected part's fields and edits them with value notation (ADR 0009); a value commits on blur or Enter. Below it, the Problems list shows the netlister diagnostics for the current document, or "No problems". The top bar has New, Open… and Save as… for `.nodal.json` files; replacing a document that has parts, wires, labels, models or a project name other than "Untitled" asks for confirmation, and a file that fails validation leaves the document unchanged and reports the reason in the status bar. The document is autosaved to IndexedDB 500 ms after the last edit, on `pagehide` and when the page becomes hidden (`visibilitychange`), and restored on load. A failed write shows "Autosave failed" in the status bar, and the next successful write clears it. Tabs share one autosave slot, so a tab that starts autosave announces itself on a `BroadcastChannel` (`nodal-autosave`); any older tab pauses its autosave, drops its pending write and says so in the status bar. The newest tab keeps saving.

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
| `shorted-element` | error | The two main nodes of an element are on one net: the terminals of a two-terminal element, or the output pair of a controlled source. Q, M and op-amps are not checked. |
| `ir-invalid` | error | `parseNetlist` rejected the result, for example a resistance of 0. The message carries its text without the internal path, and an issue about an element carries the id of the part that produced it. Model issues name the model and have no ids. |
| `dangling-pin` | warning | A pin has no other pin on its net. |
| `unconnected-part` | warning | Every pin of a part is alone on its net. It replaces the dangling-pin warnings of that part. |

Warnings do not stop netlist generation. Renaming a voltage source never rewrites the CCVS, CCCS or sweep that refers to it. The netlister reports `unknown-control-source` or `unknown-sweep-source` for each.

### 6.3 Symbols

Drawn from scratch as SVG, IEC 60617 style, pins on grid ([ADR 0007](adr/0007-iec-symbols-drawn-from-scratch.md)). One file per symbol, holding the geometry and the pin list.

### 6.4 Waveform viewer

The code is in `apps/web/src/waveform/` and `apps/web/src/simulation/`. The run bar above the results picks an analysis, runs or cancels it, and shows a progress bar and a status ("Running…", "Done", "Out of date, run again", or the engine error). The Analyses panel in the inspector (shown when nothing is selected) edits the analyses and options of the project.

- **Probes.** The Probe tool (`P`) adds a signal: a click on a wire or net label probes the net voltage, and a click on a part probes its current. A signal can also be added from the Signal list in the results panel. Each probe is a chip with a color and a remove button. After a run that has no matching probes, the first node voltage is probed (not for an operating point).
- **Derived resistor currents.** The engine reports no branch current for resistors. `withDerivedCurrents` adds `I(R)` as `(V(n+) - V(n-)) / R` for each resistor, positive from the first node through the resistor to the second.
- **Plots.** uPlot draws thin traces. Transient and DC sweep use one plot with a linear x axis (time, or the swept source name). AC shows two plots, magnitude in dB and phase in degrees, against log frequency.
- **Cursors.** The first click on the plot sets cursor A and the second sets B. Later clicks move whichever cursor is nearer in pixels (a tie moves A), and Shift+click always sets B. A cursor can be dragged by its line. With the plot focused, `A` or `B` picks the active cursor, the arrow keys step it one sample (Shift: ten samples), Home and End jump to the ends, and Delete clears it. Each cursor has a tag beside its line (filled for the active one, outlined for the other), and the Cursor A and Cursor B inputs take a value in value notation, for example `1m`. The readout table shows each probe at A, at B and the difference, plus Δx and, except on a DC sweep, 1/Δx. Values are interpolated between samples and formatted with `formatQuantity` (4 significant digits and an engineering suffix, for example `632.1 mV`); AC rows are in dB and degrees.
- **Operating point.** The result is drawn on the schematic as a voltage tag at each net, and the inspector of a selected part lists its current and pin voltages. The results panel also has a table of all operating-point signals. Tags and values dim when the schematic or settings changed after the run.
- **Errors.** A failed run lists the engine message in the status and marks the involved parts, wires and labels with the `sim-error` class (red on the canvas).

### 6.5 Examples, benchmark and performance

- **Examples.** `apps/web/src/examples/` holds eight projects (divider, RC low-pass, RLC band-pass, half-wave rectifier, full-wave bridge rectifier, common-emitter amplifier, CMOS inverter, inverting op-amp) as `.nodal.json` files, listed in `index.ts`. The "Open example" select in the top bar loads one, with the same replace confirmation as Open. `examples.test.ts` checks that each netlists without diagnostics, that every analysis runs in the wasm engine, and one expected value per example.
- **Benchmark page.** `apps/web/bench.html` (`src/bench/`) is a second Vite entry that runs the performance cases in the browser: a transient and an AC run of `validation/perf/tran50.json` in the engine, and pan and zoom of a generated 500-part project in the `<Editor>`. `pnpm --filter @nodal/web e2e:perf` runs it in the Playwright `perf` project and checks the budget of the roadmap.
- **Canvas culling.** `editor/canvas/cull.ts` limits rendering to the parts, wires and labels near the visible world box, which is snapped to coarse cells so that the rendered lists change only when the view crosses a cell border.

### 6.6 Theme and design tokens

The visual design is a modern engineering tool ([ADR 0013](adr/0013-modern-visual-design.md), which supersedes the Solderless design of [ADR 0012](adr/0012-solderless-visual-design.md)); `apps/web/DESIGN.md` describes it for anyone adding screens.

- **Shell layout.** A top bar (brand mark, short project title, file actions, theme) sits above a main row. The main row holds the icon tool rail, the parts panel, the canvas and the inspector. The results panel with its run bar sits under the canvas, and the status bar closes the window. The parts panel spans the rows beside the results. `editor/TopBar.tsx`, `editor/ToolRail.tsx`, `editor/Palette.tsx` and `editor/inspector/` hold the pieces, and `editor/projectActions.ts` is shared by the top bar and the first-run prompt shown in an empty editor. With nothing selected the inspector shows Analyses first, with Options and Models collapsed. After a run the status bar shows a mono readout such as `tran · 450 points · 54 ms`; the time is wall-clock around the runner call.
- **Fonts.** Inter (UI) and JetBrains Mono (numbers, units and signal names) are self-hosted from Fontsource variable files, declared in `theme/fonts.css` with `font-display: swap`. Only the Inter Latin file is preloaded, through a small Vite plugin in `vite.config.ts`.
- **Icons.** Control icons come from Lucide, imported one by one. Schematic symbols stay hand-drawn ([ADR 0007](adr/0007-iec-symbols-drawn-from-scratch.md)).
- **Fit on load and on results.** `editor/canvas/useFitOnLoad.ts` fits the circuit once per document. `editor/canvas/useRefitOnResults.ts` refits whenever a new result resizes the canvas, so the circuit stays whole when the results panel opens. `fit.ts` never zooms in, and a rerun of the same analysis keeps the user's zoom.
- **One token file.** `apps/web/src/theme/tokens.css` holds every color (OKLCH), type size, space, radius, elevation, duration and panel width as a CSS custom property. `base.css` styles the standard controls from those tokens. No other CSS or component file contains a color literal or a `px`, `rem` or `em` value; `theme/noRawValues.test.ts` scans `src` and fails on one. `theme/color.ts` and the tests are the exceptions, and so are the canvas drawing sizes in `waveform/Plot.tsx` (tag size, line widths, dash patterns, axis sizes). uPlot draws on a canvas that CSS cannot reach, so those are constants there; the colors and fonts still come from tokens.
- **Themes.** The light values sit on `:root` and `[data-theme="light"]`. The dark values sit under `[data-theme="dark"]` and again under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`, so the default follows the OS. A test checks that the two dark blocks match.
- **Theme select.** `theme/ThemeSelect.tsx` is the top-bar select with System, Light and Dark. `theme/theme.ts` stores the choice in `localStorage` and sets or removes `data-theme` on `<html>`. The uPlot setup needs token values in JavaScript. It reads them with `theme/cssVar.ts` and rebuilds the plot when `useResolvedTheme` reports a change.
- **Tests on the tokens.** `theme/tokens.test.ts` parses the file and checks text contrast (4.5:1), UI and focus contrast (3:1) and the separation of the six trace colors under simulated color-vision deficiencies, in both themes.
- **Probed nets.** A net with a probe draws its wires in the trace's color. Selection and error colors take precedence.
- **Stale results.** After an edit that follows a run, operating-point tags, the inspector values and the plots are dimmed with `--opacity-stale`, and the run bar says "Out of date, run again".
- **Narrow windows.** From 1280 px down to 1024 px the palette and inspector use the `-narrow` width tokens. Below 1024 px the editor is read-only: pan and zoom work, and a notice explains why. `e2e/responsive.spec.ts` covers both.
- **Quality gates.** `e2e/a11y.spec.ts` runs axe-core (WCAG 2.2 AA) on the editor, inspector, analysis panel and waveform viewer in both themes. `e2e/visual.spec.ts` compares screenshots of the main views in both themes with baselines rendered by CI. The `lighthouse` CI job audits the deployed Pages URL on mobile and desktop. The impeccable critique and audit are in `docs/design/`.

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
| Engine parity | Vitest (`parity.test.ts`) | The wasm `run` entry point, called directly with the same IR as the CLI and decoded with `decodeResult`, gives T1-trap, T1-gear and A1 results bit-identical to the CLI (maximum relative difference 0). The worker and its protocol are not part of this test; the end-to-end tests exercise them. |
| Simulation end to end | Playwright (`simulate.spec.ts`, M6) | On Chromium and Firefox with the production build: draw a divider and read its operating-point tags; run T1-trap, probe `out` and read `632.1 mV` at 1 ms; run A1 and read about −3.01 dB at 159.155 Hz on the Bode pair; run the N1 sweep; cancel a long transient and run again; show a source-loop error on both sources. |
