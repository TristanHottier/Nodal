# M6 Simulation in the Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A circuit drawn in the editor runs in the engine inside a Web Worker, with progress and cancel, and its results show on the schematic (operating-point values, highlighted error locations) and in a waveform viewer with probes, several traces, two cursors and a Bode view. The browser's numbers for T1 and A1 match the CLI to a relative difference of at most 1e-12.

**Architecture:** The engine gains one entry point that runs a single analysis and reports progress through a callback. `nodal-wasm` wraps it as `run(netlist_json, analysis_index, on_progress)` and returns the result as a small JSON layout plus one flat `Float64Array`, or a JSON error that names the elements and nodes involved. A long-lived worker owned by an `EngineClient` decodes nothing; it forwards the buffer (transferred) and the layout. The main thread decodes it into a `SimResult`, keeps it in a simulation store next to the editor store, and maps engine names back to parts, wires and labels with a circuit map the netlister now returns. The viewer is uPlot behind a thin wrapper; everything it shows (traces, dB, phase, cursor readouts) comes from pure functions with unit tests.

**Tech Stack:** Rust (engine, wasm-bindgen 0.2.130, js-sys 0.3.107, serde_json), TypeScript 6, React 19, Zustand 5, Zod 4, uPlot 1.6.32, Vitest 5 + jsdom, Playwright.

**Spec:** [`docs/ROADMAP.md`](../ROADMAP.md) §M6; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §2, §4.5, §5, §6.4, §8; ADRs [0002](../adr/0002-rust-wasm-engine.md), [0005](../adr/0005-frontend-stack.md), [0010](../adr/0010-github-pages-hosting.md); the M6 notes in the session doc (long-lived worker with AbortSignal, `messageerror` and `postMessage`-throw handling; re-measure the gzipped WASM with faer linked; wasm `run` for tran).

## Global Constraints

- Everything in `AGENTS.md` and earlier plans' Global Constraints still applies: English, commit identity `TristanHottier <185231225+TristanHottier@users.noreply.github.com>` with no AI trailers, Conventional Commits on `main`, humanizer on prose, never `minimumReleaseAgeExclude`, versions old enough for the release-age gate.
- No change to device math, analyses' numerics, the IR (`irVersion` 1), the project format (`formatVersion` 1) or goldens. `simulate` must return exactly what it returns today.
- `nodal-engine` stays free of browser, filesystem and clock access: progress is a plain `&mut dyn FnMut(f64)`.
- New dependencies only: `uplot = 1.6.32` (runtime, named in ADR 0005); in `nodal-wasm`, `js-sys = "=0.3.107"`, `serde` and `serde_json` (already in the lockfile).
- No `SharedArrayBuffer`; cancel = terminate the worker and start a new one (ARCHITECTURE §5).
- Exit parity: for every value v (browser) and w (CLI) of T1-trap, T1-gear and A1, same axis length and `|v − w| ≤ 1e-12 · max(|v|, |w|)`. Never loosen this; if it fails, find out why.
- Version stays `0.1.0`.
- Files under ~400 lines; components small; the netlister stays pure.
- Out of scope: results export, parameter sweeps, saving results, several runs side by side, a temperature option (`temp` must be 27).

## Review Focus

1. **Cancel, then run again at once.** Expected: the first promise rejects with `CancelledError`, a fresh worker serves the second run, and no progress or result from the first run reaches the store. Pinned by `cancel_then_run_uses_fresh_worker` (Task 4) and `stale_run_is_ignored` (Task 6).
2. **The worker dies mid-run** (wasm trap, `error` or `messageerror` event). Expected: the run rejects with the event's message, the next run works on a new worker. Pinned by `worker_crash_rejects_and_respawns` (Task 4).
3. **Editing the schematic after a run.** Expected: overlay and plots stay but are marked out of date; probes whose signal no longer exists after the next run are dropped. Pinned by `results_marked_stale_after_edit` and `missing_probes_dropped_on_rerun` (Task 6).
4. **An AC signal that is exactly zero** (a node with no excitation). Expected: magnitude in dB is a gap, not `-Infinity` or a crash; phase is 0. Pinned by `zero_magnitude_is_gap` (Task 9).
5. **An engine error about an op-amp or an internal node** (`Eopamp1`, `D1#internal`). Expected: the op-amp part or diode `D1` is highlighted. Pinned by `opamp_and_internal_names_map_to_parts` (Task 7).

---

### Task 1: Engine: one analysis with progress

**Files:** Modify `crates/nodal-engine/src/lib.rs`, `analysis/{mod,dc,ac,tran}.rs`. Test in `crates/nodal-engine/tests/progress.rs`.

**Interfaces:**
- Produces: `pub fn simulate_analysis(netlist: &Netlist, index: usize, progress: &mut dyn FnMut(f64)) -> Result<AnalysisResult, Error>`; index out of range → `Error::Invalid(format!("analysis index {index} out of range ({n} analyses)"))`. `simulate` keeps its signature and builds the circuit once, sharing a private `run_analysis(circuit, netlist, analysis, progress)` with `simulate_analysis`.
- Progress contract: values in [0, 1], non-decreasing, the last call on success is exactly `1.0`. op: one call `1.0`. dc and ac: `(k + 1) / n` after point k. tran: `t / tstop` after each accepted point (so `1.0` at `tstop`).
- `solve_dc_sweep`, `solve_ac`, `solve_tran` keep their signatures and delegate to `pub(crate)` `*_with_progress` variants.

- [ ] **Step 1:** Write `progress.rs`: `progress_reaches_one_for_each_analysis` (L1 op, N1 dc, A1 ac, T1-trap tran from `validation/circuits/`; non-decreasing, within [0, 1], last exactly 1.0, tran gets more than 10 calls), `single_analysis_matches_simulate` (`simulate_analysis(n, 0, …) == simulate(n)?[0]` for the same four), `index_out_of_range_is_invalid`.
- [ ] **Step 2:** `cargo test -p nodal-engine --test progress`. Expected: FAIL (not defined).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo run -p nodal-cli -- validate validation && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS, validation table unchanged.
- [ ] **Step 5:** Commit `feat(engine): run one analysis with progress reports`.

### Task 2: `nodal-wasm` `run` with flat results and located errors

**Files:** Create `crates/nodal-wasm/src/encode.rs`. Modify `crates/nodal-wasm/src/lib.rs`, `Cargo.toml`, `tests/node.rs`.

**Interfaces:**
- Produces (Rust, native-testable in `encode.rs`):
  - `pub struct Meta { r#type: &'static str /* "op"|"dc"|"ac"|"tran" */, source: Option<String> /* dc */, points: usize, signals: Vec<SignalMeta> }`, `pub struct SignalMeta { name: String, kind: &'static str /* "v"|"i" */ }`, serialized camelCase.
  - `pub fn encode(result: &AnalysisResult) -> (Meta, Vec<f64>)`. Layout of `data`: the axis (`points` values: sweep, frequencies or time; absent for op, where `points` = 1), then for each signal in order: its `points` real values, and for ac its `points` imaginary values right after. Signal order: node voltages in map order, then branch currents in map order.
  - `pub struct ErrorInfo { message: String, elements: Vec<String>, nodes: Vec<String> }` and `pub fn error_info(e: &Error) -> ErrorInfo`. `message` = `e.to_string()`. Floating → its nodes and elements; SourceLoop → elements; Singular and TimestepTooSmall `unknown`: `V(x)` → node x, `I(x)` → element x; TimestepTooSmall `device` → element; NoConvergence → the update labels mapped the same way, deduplicated in order; SweepPoint and AcPoint → the cause's lists plus, for SweepPoint, the source as element. Lists sorted and deduplicated.
- Produces (wasm): `#[wasm_bindgen] pub struct RunOutput` with getter `meta() -> String` (Meta JSON) and `take_data(&mut self) -> Vec<f64>` (a `Float64Array` in JS, empties the struct); `#[wasm_bindgen] pub fn run(netlist_json: &str, analysis_index: u32, on_progress: &js_sys::Function) -> Result<RunOutput, JsValue>` where the error is a string holding `ErrorInfo` JSON. Parse errors go through `parse_netlist` and `error_info` too. Progress is forwarded only when the fraction rose by ≥ 0.01 since the last forward, and always for 1.0; a throwing callback is ignored.

- [ ] **Step 1:** Write native tests in `encode.rs`: `op_layout` (2 nodes + 1 branch → points 1, data = [v_a, v_b, i_V1]), `ac_layout_interleaves_im` (data length = n + 2n·signals, im block follows re block), `tran_axis_first`, `error_info_lists` (one per Error variant above, including a nested SweepPoint→Singular `V(b)` that yields node `b` and element = source). Extend `tests/node.rs` with `run_rc_tran_reports_progress_and_data` (inline RC JSON; data length = points·(1 + signals); last progress 1.0) and `run_reports_floating_node` (error JSON has `nodes` non-empty).
- [ ] **Step 2:** `cargo test -p nodal-wasm`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && wasm-pack test --node crates/nodal-wasm && NODAL_WASM_NO_OPT=1 pnpm build:wasm && cargo clippy --workspace --all-targets -- -D warnings`. Expected: PASS. Note the gzipped size of the optimized build in the commit body once CI reports it (the deferred "re-measure with faer linked").
- [ ] **Step 5:** Commit `feat(wasm): run an analysis with progress and located errors`.

### Task 3: Result decoding and the CLI parity test

**Files:** Create `apps/web/src/engine/results.ts`, `results.test.ts`, `apps/web/src/engine/parity.test.ts`. Modify `.github/workflows/ci.yml` (web job: `cargo build -p nodal-cli` before `pnpm test`).

**Interfaces:**
- Produces:
  - `type SignalKind = "v" | "i"`; `interface Signal { name: string; kind: SignalKind; re: Float64Array; im?: Float64Array }`; `interface SimResult { type: "op" | "dc" | "ac" | "tran"; source?: string; axis: Float64Array /* length 0 for op */; signals: Signal[] }`.
  - `interface EngineErrorInfo { message: string; elements: string[]; nodes: string[] }`.
  - `decodeResult(meta: string, data: Float64Array): SimResult`: validates `meta` with Zod and the data length; throws `Error("malformed engine result: …")`. Signal arrays are `subarray` views (no copy).
  - `decodeError(raw: unknown): EngineErrorInfo`: parses the JSON string; anything else becomes `{ message: String(raw), elements: [], nodes: [] }`.
  - `signalKey(s: { name: string; kind: SignalKind }): string` → `V(name)` or `I(name)`.

- [ ] **Step 1:** `results.test.ts`: `decodes_each_type` (hand-built meta + data for op, dc with source, ac, tran), `rejects_length_mismatch`, `rejects_bad_meta`, `decode_error_falls_back`. `parity.test.ts` (`// @vitest-environment node`, 120 s timeout): `browser_matches_cli` for `T1-trap`, `T1-gear`, `A1`: load `validation/schematics/<id>.nodal.json` with `parseProject`, `projectToNetlist`, `initSync` the built `crates/nodal-wasm/pkg/nodal_wasm_bg.wasm`, `run(JSON.stringify(ir), 0, () => {})`, `decodeResult`; write the same IR JSON to a temp file, `spawnSync("cargo", ["run", "--quiet", "-p", "nodal-cli", "--", "run", file])`, parse; compare axis lengths and every value with the Global Constraints rule; the failure message names the signal, index and both values. Fails (does not skip) if cargo or the pkg is missing.
- [ ] **Step 2:** `pnpm --filter @nodal/web exec vitest run src/engine`. Expected: FAIL.
- [ ] **Step 3:** Implement `results.ts`; add the CI step.
- [ ] **Step 4:** `NODAL_WASM_NO_OPT=1 pnpm build:wasm && pnpm --filter @nodal/web exec vitest run src/engine && pnpm typecheck && pnpm lint`. Expected: PASS; report the largest relative difference seen. If parity fails, stop and investigate (step counts, `exp`/`ln` in libm vs the native libm) before going on.
- [ ] **Step 5:** Commit `feat(web): decode engine results; test browser parity with the CLI`.

### Task 4: Long-lived worker and `EngineClient`

**Files:** Modify `apps/web/src/engine/{protocol,engine.worker,client}.ts`, `client.test.ts`, `apps/web/src/App.tsx`.

**Interfaces:**
- Protocol: requests `{ type: "version"; id: number }`, `{ type: "run"; id: number; netlist: string; analysisIndex: number }`; responses `{ type: "version"; id; version }`, `{ type: "progress"; id; fraction }`, `{ type: "result"; id; meta: string; data: Float64Array }` (buffer transferred), `{ type: "error"; id; error: unknown }` (the raw wasm error, or a string).
- Produces: `class EngineClient { constructor(opts?: { createWorker?: () => Worker }); version(timeoutMs?: number /* 10 000 */): Promise<string>; run(netlist: string, analysisIndex: number, opts?: { onProgress?: (f: number) => void; signal?: AbortSignal }): Promise<SimResult>; cancel(): void; dispose(): void }`, `class EngineRunError extends Error { info: EngineErrorInfo }`, `class CancelledError extends Error`, `type EngineRunner = Pick<EngineClient, "run" | "cancel">`.
- Behaviour: one worker, created lazily. One run at a time; a new `run` cancels the active one. Cancel (or abort) → terminate, reject the run with `CancelledError`, next request creates a new worker. Worker `error` or `messageerror` → reject every pending request with the event message, drop the worker. A throwing `postMessage` rejects that request. Responses with an unknown id are ignored. Runs have no timeout. `getEngineVersion` is removed; `App` creates one client and calls `version()`.

- [ ] **Step 1:** Rewrite `client.test.ts` with the existing `FakeWorker` (now recording `postMessage` calls and supporting `messageerror`): `version_resolves`, `version_times_out`, `run_resolves_decoded_result`, `progress_forwarded`, `engine_error_becomes_EngineRunError`, `abort_signal_cancels`, `cancel_then_run_uses_fresh_worker`, `worker_crash_rejects_and_respawns`, `messageerror_rejects`, `postMessage_throw_rejects`, `unknown_id_ignored`, `constructor_throw_rejects`.
- [ ] **Step 2:** `pnpm --filter @nodal/web exec vitest run src/engine/client.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the worker (memoized `init()`, `run` → transfer `take_data().buffer`) and the client; switch `App`.
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint && NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web build && pnpm --filter @nodal/web e2e`. Expected: PASS (shell spec still shows `Engine 0.1.0`).
- [ ] **Step 5:** Commit `feat(web): long-lived engine worker with progress and cancel`.

### Task 5: Netlister circuit map

**Files:** Modify `apps/web/src/netlist/{nets,netlister}.ts`, `nets.test.ts`, `netlister.test.ts`.

**Interfaces:**
- Produces: `NetResult` gains `netOfWire: Map<string, string>` and `netOfLabel: Map<string, string>` (wire and label id → net name). `NetlistResult` gains `map: CircuitMap | null` (null only for the empty schematic): `interface CircuitMap { partOfElement: Map<string, string> /* IR element name → part id, incl. "E" + op-amp name */; netOfPin: Map<string, string>; netOfWire: Map<string, string>; netOfLabel: Map<string, string> }`, present even when error diagnostics exist.

- [ ] **Step 1:** Tests: `wires_and_labels_get_their_net` (a T-junction, a crossing without dot and two wires joined by a label: each wire's net equals its pins' net), `map_names_opamp_as_E` (op-amp part `U1` → `partOfElement.get("EU1")`), `map_present_with_errors` (no ground → `ir` null, `map` non-null).
- [ ] **Step 2:** Run `pnpm --filter @nodal/web exec vitest run src/netlist`. Expected: FAIL.
- [ ] **Step 3:** Implement (wires and labels already sit in the union-find; read their roots after naming).
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint`. Expected: PASS, reference tests unchanged.
- [ ] **Step 5:** Commit `feat(web): netlister returns the circuit map`.

### Task 6: Simulation store, analysis setup panel, Run and Cancel

**Files:** Create `apps/web/src/simulation/{store,store.test,SimulationContext}.ts(x)`, `apps/web/src/simulation/AnalysisEditor.tsx`, `AnalysisEditor.test.tsx`, `apps/web/src/simulation/RunBar.tsx`, `RunBar.test.tsx`. Modify `apps/web/src/netlist/value.ts` (+ test), `apps/web/src/editor/store.ts` (+ test), `apps/web/src/editor/Editor.tsx`, `apps/web/src/editor/inspector/Inspector.tsx`, `apps/web/src/App.tsx`.

**Interfaces:**
- `formatValue(n: number, digits = 12): string` in `value.ts`: engineering suffix from `f p n u m (none) k Meg G T` chosen so the mantissa is in [1, 1000), mantissa `String(Number(m.toPrecision(digits)))`; 0 → `"0"`; outside 1e-15…1e15 → `String(n)`. `parseValue(formatValue(x))` returns exactly x for `1e-6, 4.7e3, 1e6, 0.001, 159.15e3, 2.5e-9`.
- Editor store: `setSimulation(sim: Project["simulation"]): void`, outside history like `setModels`.
- Simulation store (`createSimulationStore({ runner: EngineRunner })`, provided by `SimulationProvider`; `Editor` takes an optional `simulation` prop and creates one with a real client otherwise):
  - `status: { kind: "idle" } | { kind: "running"; index: number; progress: number } | { kind: "done" } | { kind: "failed"; message: string; partIds: string[]; wireIds: string[]; labelIds: string[] }`.
  - `result: SimResult | null`, `ranDoc: Schematic | null`, `ranSimulation: Project["simulation"] | null`, `map: CircuitMap | null`, `probes: string[]` (signal keys).
  - `run(project: Project, index: number): Promise<void>`: netlist first; any error diagnostic → `failed` with message "Fix the problems listed before simulating" and the error diagnostics' item ids; else run, decode, apply `withDerivedCurrents` (Task 9 owns it; until then identity) and keep probes that exist in the new result; if none remain and the result is not op, probe the first node voltage. A run whose promise settles after a newer run started, or after cancel, changes nothing. `EngineRunError` → `failed` with ids from `errorTargets` (Task 7; until then empty lists). `CancelledError` → `idle`, result kept.
  - `cancel()`, `addProbe(key)`, `removeProbe(key)` (no duplicates).
  - `useResultsStale(): boolean`: true when a result exists and the editor's `doc` or `project.simulation` differs (by reference) from `ranDoc`/`ranSimulation`.
- `AnalysisEditor` (in the inspector's project view, under the model library): one card per analysis with a type select and these fields. op: none; dc: source (select of vsource/isource part names), start, stop, step; ac: sweep (lin/dec/oct), points (integer), fstart, fstop; tran: tstep, tstop, tstart, tmax (optional), uic (checkbox). Number fields use `Field` with `parseValue` on commit and `formatValue` for display. Remove button (disabled with one analysis); "Add analysis" with defaults op; dc on the first source 0→5 step 0.1; ac dec 10 1 → 1Meg; tran 1u / 1m. Options: method (default/trap/gear), reltol, abstol, vntol, gmin, chgtol, trtol (optional; empty = engine default shown as hint).
- `RunBar` (top of the results panel, always visible): analysis select (`1. Transient`, …), Run button (`Cancel` while running), a `<progress>` with the fraction, status text (`Done`, `Out of date, run again`, the failure message).
- Layout: `Editor` grid rows become `1fr auto auto`; the results panel (RunBar now, viewer in Task 10) spans all columns above the status bar.

- [ ] **Step 1:** Tests. `value.test.ts`: `format_round_trips`. `store.test.ts` (editor): `set_simulation_outside_history`. `simulation/store.test.ts` with a fake runner: `run_success_sets_result`, `netlist_errors_block_run`, `engine_error_sets_failed`, `cancel_keeps_previous_result`, `stale_run_is_ignored`, `missing_probes_dropped_on_rerun`, `first_node_probed_by_default`, `results_marked_stale_after_edit` (hook via a tiny component). `AnalysisEditor.test.tsx`: `edit_tran_stop_commits_number`, `invalid_value_rejected`, `add_and_remove_analysis`, `dc_source_choices_are_sources`, `method_option`. `RunBar.test.tsx`: `run_then_cancel`, `shows_progress`, `shows_failure_message`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): analysis setup and run controls`.

### Task 7: Engine errors on the schematic

**Files:** Create `apps/web/src/simulation/errorTargets.ts`, `errorTargets.test.ts`. Modify `apps/web/src/simulation/store.ts`, `apps/web/src/editor/canvas/{Canvas,PartView,WireView,LabelView}.tsx`, `Canvas.test.tsx`.

**Interfaces:**
- `errorTargets(info: EngineErrorInfo, map: CircuitMap, doc: Schematic): { partIds: string[]; wireIds: string[]; labelIds: string[] }`. Elements → `partOfElement` (names compared ignoring case); a node `x#…` (internal) → element `x`; a node → every wire and label on that net, and the parts with a pin on it when the net has no wire. Ground `0` is never highlighted. Sorted, deduplicated.
- Canvas: items in the failed status's id lists get class `sim-error` (red stroke, CSS `.nodal-canvas .sim-error { color: #dc2626; }`), independent of selection.

- [ ] **Step 1:** Tests: `floating_node_highlights_its_wires`, `source_loop_highlights_parts`, `opamp_and_internal_names_map_to_parts`, `pin_only_net_highlights_parts`, `ground_never_highlighted`; `Canvas.test.tsx`: `failed_status_marks_items`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; wire `errorTargets` into the store's failure path.
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): show engine errors on the schematic`.

### Task 8: Operating-point overlay

**Files:** Create `apps/web/src/simulation/opTags.ts`, `opTags.test.ts`, `apps/web/src/editor/canvas/OpOverlay.tsx`, `apps/web/src/editor/inspector/OpValues.tsx`. Modify `Canvas.tsx`, `Inspector.tsx`, `Canvas.test.tsx`, `Inspector.test.tsx`.

**Interfaces:**
- `formatQuantity(v: number, unit: string, digits = 4): string` in `value.ts` (`formatValue(v, digits) + " " + unit`, e.g. `"2.5 V"`, `"-1.25 mA"`).
- `opTags(result: SimResult, map: CircuitMap, doc: Schematic): { net: string; at: Point; text: string }[]` for op results only (else `[]`): one tag per non-ground net present in `result`; anchor = the first label of the net in document order, else the midpoint of the first segment of the first wire on the net (rounded to the grid), else its first pin. Text `formatQuantity(v, "V")`.
- `OpOverlay` draws each tag as small text with a white halo at `at` offset by (0.3, −0.3) grid units, class `nodal-op-tag`, `opacity: 0.5` when results are stale.
- `OpValues` (inspector part view, after the fields, op result only): the part's current `I(name)` (branch or derived, Task 9) when present, and the voltage of each of its pins' nets.

- [ ] **Step 1:** Tests: `tags_one_per_net_skip_ground`, `tag_prefers_label_anchor`, `tag_on_pin_only_net`, `non_op_result_has_no_tags`; `Canvas.test.tsx`: `op_tags_render_and_dim_when_stale`; `Inspector.test.tsx`: `op_values_for_selected_part`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): operating-point values on the schematic`.

### Task 9: Waveform data layer

**Files:** Create `apps/web/src/waveform/{traces,traces.test,cursors,cursors.test}.ts`. Modify `apps/web/src/simulation/store.ts` (use `withDerivedCurrents`).

**Interfaces:**
- `withDerivedCurrents(result: SimResult, ir: Netlist): SimResult`: adds one `kind: "i"` signal per `R` element with no reported current, `(V(n+) − V(n−)) / R` (ground = 0; complex parts separately for ac), SPICE sign (positive from `nodes[0]` through R to `nodes[1]`), appended after the engine's signals in element order.
- `listSignals(result): { key: string; label: string }[]`: voltages first, then currents, in result order; label `V(out)` / `I(R1)`.
- `type TraceView = "linear" | "mag" | "phase"`; `traceValues(result, key, view): Float64Array`: linear = real part; mag = `20·log10(hypot(re, im))` with `NaN` where the magnitude is 0; phase = `atan2(im, re)` in degrees (−180, 180]. Unknown key → throws.
- `valueAt(xs: Float64Array, ys: Float64Array, x: number, logX: boolean): number | null`: linear interpolation between the bracketing points (in `log10(x)` when `logX`), exact at sample points, `null` outside the range or when a bracketing value is `NaN`.
- `cursorReadout(result, keys, view, a: number | null, b: number | null): { rows: { key: string; a: number | null; b: number | null; delta: number | null }[]; dx: number | null; inverseDx: number | null }`.

- [ ] **Step 1:** Tests: `derived_resistor_current_sign_and_value` (divider: 1 mA from `in` to `out`), `derived_current_ac_complex`, `signals_ordered`, `mag_and_phase_of_known_phasor` (1 + 1j → 3.0103 dB, 45°), `zero_magnitude_is_gap`, `value_at_interpolates_and_hits_samples`, `value_at_log_axis`, `value_at_outside_is_null`, `readout_delta_and_inverse_dx`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; call `withDerivedCurrents` in the store's success path (the store keeps the IR it ran).
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): waveform traces, Bode values and cursor readouts`.

### Task 10: Waveform viewer and probe tool

**Files:** Create `apps/web/src/waveform/{Plot,WaveformPanel,CursorTable,SignalPicker}.tsx`, `WaveformPanel.test.tsx`, `apps/web/src/editor/tools/probe.ts`, `probe.test.tsx`. Modify `apps/web/package.json` (`uplot: 1.6.32`), `apps/web/src/editor/store.ts` (`Tool` gains `{ kind: "probe" }`), `Palette.tsx` (a "Probe" button), `useShortcuts.ts` (`P`), `Editor.tsx`, `apps/web/src/test/setup.ts` (mock `./waveform/Plot` only where a test asks).

**Interfaces:**
- `Plot` props: `{ x: Float64Array; series: { label: string; values: Float64Array; color: string }[]; logX: boolean; xLabel: string; yLabel: string; cursors: { a: number | null; b: number | null }; onCursor(which: "a" | "b", x: number): void; height: number }`. uPlot instance created on mount, `setData` on change, destroyed on unmount, resized with a `ResizeObserver`. `NaN` becomes `null` (gap). Click sets cursor A, Shift+click cursor B; cursors drawn as dashed vertical lines in a `draw` hook. Colors: a fixed list of 8.
- `WaveformPanel` (below `RunBar`, 280 px high when a non-op result exists): `SignalPicker` (select from `listSignals` + Add), one removable chip per probe, plots: ac → two `Plot`s (magnitude in dB and phase in degrees, log frequency axis, shared cursors); dc → x is the sweep source value; tran → time. op results show a table of every signal instead. `CursorTable`: A and B as `Field`-style inputs in value notation, a row per probe with A, B, Δ, and Δx and 1/Δx (cursor state lives in the panel, reset when the result's type changes).
- Probe tool: active with `P` or the palette button; a click on a wire or label probes `V(net)`, on a part probes `I(irName)` when that signal exists (status message "No current available for X" otherwise); ground does nothing. Without a result the click sets status "Run a simulation first".

- [ ] **Step 1:** Tests (Plot mocked to render its props as data attributes): `WaveformPanel.test.tsx`: `tran_shows_one_plot_with_probes`, `ac_shows_bode_pair_log_x`, `op_shows_table`, `add_and_remove_probe`, `cursor_inputs_fill_readout` (T1-like data: value at A equals `valueAt`), `click_sets_cursor_a_shift_sets_b`. `probe.test.tsx`: `click_wire_probes_net_voltage`, `click_part_probes_current`, `no_result_sets_message`, `p_key_selects_probe_tool`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Add `uplot` (`pnpm --filter @nodal/web add uplot@1.6.32`, import `uplot/dist/uPlot.min.css`), implement.
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint && pnpm format:check`. Then build and look at the app in Chromium (Playwright screenshot of `vite preview` with T1-trap and A1 loaded and run): plots visible, traces thin, cursors drawn, Bode phase sensible. Fix what reads badly.
- [ ] **Step 5:** Commit `feat(web): waveform viewer with probes, cursors and Bode view`.

### Task 11: End-to-end test, docs and close M6

**Files:** Create `apps/web/e2e/simulate.spec.ts`. Modify `docs/ARCHITECTURE.md` (§5 the real `run` signature, result layout and error JSON; §6.4 the viewer as built; §8 rows for parity and the M6 end-to-end test), `README.md`, `docs/ROADMAP.md`.

- [ ] **Step 1:** `simulate.spec.ts` (Chromium and Firefox, production build): `draw_divider_run_op`: place a voltage source (DC 5), two 1k resistors and a ground, wire them, Run (op) → tags `5 V` and `2.5 V` on the canvas. `rc_transient_probe_and_cursor`: Open… `T1-trap.nodal.json`, Run, probe the `out` wire, type cursor A = `1m`, the readout for `V(out)` shows `0.6321` (closed form 1 − e^(−1) ≈ 0.63212; the 1 ns rise moves it far below the shown digits). `ac_bode`: Open… `A1.nodal.json`, Run, two plots with log x, cursor A = `159.155` → magnitude ≈ −3.010 dB. `dc_sweep_plot`: Open… `N1.nodal.json`, Run, one plot, x label names the source. `cancel_long_run`: Open… `T1-trap`, set tstop to `1` (about 1e5 steps at tmax = 10 µs), Run, Cancel within 1 s → status idle, Run again → finishes after restoring tstop. `engine_error_highlight`: two voltage sources in parallel (source loop) → failure message names both and both parts carry `sim-error`.
- [ ] **Step 2:** `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web build && pnpm --filter @nodal/web e2e`. Expected: PASS with the earlier specs.
- [ ] **Step 3:** Update the docs (README status: simulation runs in the browser; ROADMAP M6 in progress until CI evidence exists). Humanizer on the prose.
- [ ] **Step 4:** Full local check: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm --filter @nodal/web build && pnpm --filter @nodal/web e2e && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings`. Expected: PASS.
- [ ] **Step 5:** Commit `test(web): simulate end to end`, push, wait for CI, open the Pages site in Playwright and run A1 there.
- [ ] **Step 6:** Fill the ROADMAP evidence (CI run, the web job running `parity.test.ts` and `simulate.spec.ts`, the gzipped WASM size, the deploy job), set M6 to **done**, update the session doc's Status, commit `docs: close M6`, push.
