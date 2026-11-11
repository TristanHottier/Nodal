# M2 Nonlinear DC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nodal-cli run` solves the DC operating point and DC sweeps of circuits with diodes, BJTs, Level 1 MOSFETs and voltage-controlled switches. Every nonlinear device passes finite-difference Jacobian tests in every operating region, and circuits N1–N5 match committed ngspice goldens in CI.

**Architecture:** The IR gains models, four element kinds (`D`, `Q`, `M`, `S`), a `dc` sweep analysis and `nodeset`. The `Device` trait is reworked in SPICE style: each device owns a slice of a state vector (previous junction voltages, currents, conductances), applies limiting inside `load`, reports whether it limited, and checks its own current convergence. A Newton driver in `analysis/newton.rs` runs plain Newton, then gmin stepping, then source stepping. DC sweep reuses the driver point by point. The validation harness learns multi-point `dc` goldens.

**Tech Stack:** unchanged from M1 (Rust 1.97.0, serde, faer 0.24, clap 4; TypeScript 6, Zod 4, Vitest; ngspice-42 for golden regeneration only).

**Spec:** [`docs/ROADMAP.md`](../ROADMAP.md) §M2; [`docs/reference/devices.md`](../reference/devices.md) §1–5; [`docs/reference/numerical-methods.md`](../reference/numerical-methods.md) §1, §4; [`docs/reference/mna.md`](../reference/mna.md) §4–6; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §3, §4.2–4.5; [`docs/VALIDATION.md`](../VALIDATION.md) §3–5; the "Must address in M2" list in the project's session notes, reproduced in Tasks 1 and 2.

## Global Constraints

- Everything in `AGENTS.md` and in the M1 plan's Global Constraints still applies (no I/O in the engine, no `unwrap`/`expect`/`panic!` in library code, SI f64, English, sorted name lists in errors, commit identity and no AI trailers, humanizer on prose).
- No new dependencies, except the `float_roundtrip` feature of `serde_json` (Task 1).
- `irVersion` stays 1: every change to the IR is additive, and nothing has been released.
- Model parameter names, defaults and equations are those of `devices.md`. Parameter keys are case-sensitive and uppercase in the IR (`IS`, not `is`); anything else is rejected with `unsupported parameter <KEY> for model <name> (<type>)`.
- Every ported ngspice routine cites its source file in a comment: `devsup.c` (`DEVpnjlim`, `DEVfetlim`, `DEVlimvds`), `dioload.c`, `bjtload.c`, `mos1load.c`, `swload.c`, `cktop.c` (`dynamic_gmin`, `gillespie_src`), `niconv.c`, `dioconv.c`/`bjtconv.c`/`mos1conv.c`.
- Physical constants: ngspice-42 uses `CHARGE = 1.6021766208e-19` and `CONSTboltz = 1.38064852e-23` (CODATA 2014), not the SPICE2 values now in `devices.md`. $T = 300.15$ K. Define them once in `crates/nodal-engine/src/devices/constants.rs`; Task 4 corrects `devices.md`, and Task 11 confirms against ngspice output.
- `temp` is fixed at 27 °C in v1. Any `options.temp` other than 27 is rejected.
- Solver options honoured from Task 3 on: `reltol` (1e-3), `vntol` (1e-6 V), `abstol` (1e-12 A), `gmin` (1e-12 S). `itl1` = 100 is a constant, not an option.
- DC and op comparisons use the M1 op tolerance on every point: $|x - x_{ref}| \le 10^{-5}|x_{ref}| + a$, $a$ = 1e-8 V or 1e-13 A. Jacobian tests use VALIDATION §5: central differences, relative error ≤ 1e-5 or absolute ≤ 1e-15 S.
- Out of scope: AC, transient, charges and capacitances beyond parsing and validating their parameters, the wasm `run` entry point, switch `ON`/`OFF` initial-state flags.

## Review Focus

1. **Shorted terminals on multi-terminal devices.** Diode-connected BJTs (`b = c`) and MOSFETs (`g = d`, `s = b`) are normal circuits and must be accepted and solved. Pinned by `diode_connected_npn` (Task 7) and `diode_connected_nmos` (Task 8).
2. **A sweep whose step does not land on `stop`.** `start 0, stop 1, step 0.3` must be rejected with a message naming the analysis, not silently truncated or extended. Pinned by fixture `dc-step-misses-stop` (Task 2).
3. **Lower-case or ngspice-only parameters** (`is`, `BV`, `TOX`, `LEVEL`). They must be rejected, never ignored. Pinned by fixtures `model-lowercase-param`, `model-bv-rejected` (Task 2).
4. **A switch model with `ROFF` unset.** It must default to `1/gmin` using the netlist's `gmin` option, not the hard-coded 1e-12. Pinned by `switch_roff_follows_gmin` (Task 9).
5. **A sweep point that fails plain Newton.** It must fall back to the full op chain at that point and keep going, not abort the sweep. Pinned by `sweep_point_uses_fallbacks` (Task 10).

---

### Task 1: M1 review follow-ups in the engine

**Files:**
- Modify: `crates/nodal-engine/Cargo.toml`, `src/error.rs`, `src/linalg/{mod,dense}.rs`, `src/mna/mod.rs`, `src/analysis/op.rs`, `tests/topology.rs`, `tests/ir_fixtures.rs`

**Interfaces:**
- Produces:
  - `Error::Internal(String)`, displayed `internal error: <msg>`. `SolveError::NotFactored` and `DimensionMismatch` map to it (they are bugs, not bad netlists).
  - `DenseMatrix::add(&mut self, r, c, v) -> bool`: `false` when out of range.
  - `RealSystem` gains `pub out_of_range: Option<(usize, usize)>`, set to the first out-of-range `add_a`/`add_b` (`add_b` records `(row, usize::MAX)`). Solving a system with it set returns `Error::Internal("stamp out of range at row r, column c")`.
  - `serde_json` with `features = ["float_roundtrip"]`.

- [ ] **Step 1: Write the failing tests.**
  - `dense.rs`: `refactor_replaces_previous` (factor A, factor B, solve gives B's answer); `failed_factor_then_solve_is_not_factored` (factor a singular matrix, then `solve` returns `NotFactored`); `non_finite_solve_is_singular` (factor `[[1e-300]]`, solve `[1e300]`: the result overflows, so `solve` returns `SingularPivot`, not inf); `out_of_range_add_returns_false`.
  - `mna/mod.rs`: `out_of_range_stamp_is_recorded`.
  - `tests/topology.rs`: `floating_reported_before_loop` (V1 a 0 1; V2 a 0 2; R1 b c 1k → `Floating`, not `SourceLoop`); `vccs_control_port_is_not_a_dc_edge` (V1 in 0 1; R1 in 0 1k; G1 0 x in 0 1m; R2 x y 1k → `Floating { nodes: [x, y], .. }`, and `G1` is listed).
  - `tests/ir_fixtures.rs`: `every_invalid_fixture_has_a_needle`: the set of file stems in `fixtures/ir/invalid/` equals the set of keys in `each_invalid_fixture_breaks_its_own_rule`'s table. Move that table to a `const NEEDLES` so both tests share it.
  - `tests/ir_fixtures.rs`: `floats_round_trip`: `parse_netlist` of a resistor `0.1000000000000000055511151231257827` gives exactly `0.1_f64`.
- [ ] **Step 2:** `cargo test --workspace`. Expected: the new tests fail (or don't compile).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `fix(engine): Internal error, out-of-range stamps, solver and topology test gaps`.

### Task 2: IR for models, nonlinear elements, DC sweep and nodeset (Rust + export)

**Files:**
- Create: `crates/nodal-engine/src/ir/models.rs`
- Modify: `src/ir/{mod,validate}.rs`, `src/export/spice.rs`, `src/circuit/{mod,topology}.rs`, `src/devices/mod.rs` (only to compile against the new `Element`), `tests/ir_fixtures.rs`
- Create fixtures: `packages/schema/fixtures/ir/valid/{nonlinear,dc-sweep,nodeset}.json`; invalid fixtures listed below. Delete `invalid/models-nonempty.json`.

**Interfaces:**
- Produces:
  - New `Element` variants (JSON keys camelCase):
    - `D { name, nodes: [String; 2], model }`: anode, cathode.
    - `Q { name, nodes: [String; 3], model }`: collector, base, emitter.
    - `M { name, nodes: [String; 4], model, w: Option<f64>, l: Option<f64> }`: drain, gate, source, bulk. Defaults W = L = 100e-6.
    - `S { name, nodes: [String; 2], control_nodes: [String; 2], model }`.
  - `Element::nodes(&self) -> &[String]` (was `&[String; 2]`), `Element::control_nodes(&self) -> &[String]`, `Element::model(&self) -> Option<&str>`.
  - Centralized kind lists, replacing the three `matches!` copies: `Element::has_branch(&self) -> bool` (V, E, H, L) and `Element::dc_edges(&self) -> Vec<(&str, &str)>`: R, L, V, E, H → `(n+, n-)`; D → `(a, c)`; Q → `(b, e), (b, c)`; M → `(d, s)`; S → `(n+, n-)`; C, I, G, F → none. Control ports and MOSFET gate/bulk are never edges. `topology.rs` uses only these.
  - `pub struct Model { name: String, #[serde(rename = "type")] kind: ModelKind, params: BTreeMap<String, f64> }`, `pub enum ModelKind { D, NPN, PNP, NMOS, PMOS, SW }`; `Netlist.models: Vec<Model>`.
  - `models.rs`: `pub fn param_spec(kind: ModelKind) -> &'static [ParamSpec]`, `pub struct ParamSpec { key: &'static str, default: f64, rule: Range }`, `pub enum Range { Any, Positive, NonNegative, UnitInterval /* [0, 1) */ }`, and `pub fn param(model: &Model, key: &str) -> f64` (the value or the default). Defaults and keys are exactly the tables in `devices.md` §1–4, minus `BV`/`IBV`. `VAF` defaults to `f64::INFINITY` and must be `Positive` when set. `ROFF` defaults to `f64::NAN`, meaning "1/gmin", resolved by the switch at build time.
  - Rules: D: `IS N VJ` Positive, `RS CJO TT` NonNegative, `M FC` UnitInterval. NPN/PNP: `IS BF BR NF NR VAF VJE VJC` Positive, `CJE CJC TF TR` NonNegative, `MJE MJC FC` UnitInterval. NMOS/PMOS: `VTO` Any, `KP PHI` Positive, `GAMMA LAMBDA CGSO CGDO CGBO` NonNegative. SW: `VT` Any, `VH` NonNegative, `RON ROFF` Positive. Instance `w`, `l` Positive.
  - `Analysis::Dc { source: String, start: f64, stop: f64, step: f64 }` (JSON `{"type":"dc",…}`), and `Netlist.nodeset: Option<BTreeMap<String, f64>>`.
  - `pub fn sweep_values(start, stop, step) -> Vec<f64>`: `start + i*step` for `i = 0..n`, `n = round((stop-start)/step) + 1`.
- Validation rules (Rust and, in Task 3, TS; messages contain the quoted names):

| # | Rule |
|---|---|
| V3 | element name regex becomes `^[RLCVIEGHFDQMS][A-Za-z0-9_]*$` |
| V8 | applies to the two `nodes` of R L C V I E G H F D and to the output pair of S. Q and M may share terminals. |
| V10 (replaced) | model names match `^[A-Za-z][A-Za-z0-9_]*$` and are unique ignoring case |
| V12 | every param key is in `param_spec(kind)`; value finite and inside its `Range` (`unsupported parameter …` / `parameter <KEY> of model <name> must be …`) |
| V13 | an element's `model` names an existing model, exact case, of a matching type: D→D, Q→NPN/PNP, M→NMOS/PMOS, S→SW |
| V14 | `dc`: `source` is an existing V or I element; `start`, `stop`, `step` finite; `step ≠ 0`; $k = (stop-start)/step \ge 0$; $|k - \mathrm{round}(k)| \le 10^{-9}\max(1, |k|)$; `round(k) + 1 ≤ 1_000_000` |
| V15 | `nodeset` keys are existing non-ground node names (exact case), values finite |
| V11 | `temp`, when set, equals 27 (`option temp must be 27 (temperature is fixed in v1)`) |

- New invalid fixtures, one rule each: `model-unknown`, `model-wrong-type` (D1 → NPN model), `model-duplicate-case`, `model-lowercase-param`, `model-bv-rejected`, `model-param-out-of-range` (`M: 1`), `mos-zero-width`, `switch-same-output-nodes`, `dc-unknown-source`, `dc-source-not-independent` (R1), `dc-zero-step`, `dc-step-misses-stop` (0, 1, 0.3), `nodeset-unknown-node`, `temp-not-27`. Add each to `NEEDLES`.
- Export: models as `.model <name> <type> (<KEY>=<v> …)` in IR order after the elements, keys sorted ASCII, `{:e}` numbers; NMOS/PMOS models get `LEVEL=1` first. Elements: `D1 a c DMOD`, `Q1 c b e QMOD`, `M1 d g s b MMOD W=<w> L=<l>` (always written, defaults filled), `S1 p n cp cn SMOD`. Switch models with `ROFF` unset get `ROFF=<1/gmin>` written explicitly. `nodeset` as `.nodeset v(a)=<v> …` (sorted). Each analysis gives one line: `.op`, or `.dc <source> <start> <stop> <step>`.

- [ ] **Step 1: Write the failing tests:** `valid_fixtures_parse` and `each_invalid_fixture_breaks_its_own_rule` cover the fixtures. Add `spice.rs::deck_for_nonlinear` (exact deck for `valid/nonlinear.json`, which holds one D, Q, M, S, all six model types, a nodeset and an op plus a dc analysis) and `ir::tests::sweep_values_hit_stop` (`sweep_values(-5, 5, 0.1)` has 101 values, the last within 1e-12 of 5).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. `Circuit::build` and `devices::instantiate` only need to compile: until Tasks 4–9, instantiating D/Q/M/S returns `Error::Invalid("<kind> elements are not simulated yet")`.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): IR models, nonlinear elements, dc sweep and nodeset`.

### Task 3: Same IR in `@nodal/schema`

**Files:** Modify `packages/schema/src/ir.ts`, `packages/schema/src/ir.test.ts`, `crates/nodal-engine/src/ir/models.rs` (one test); create `packages/schema/src/models.ts` (the parameter table, mirroring `models.rs`) and `packages/schema/fixtures/param-specs.json`.

**Interfaces:**
- Consumes: Task 2's fixtures and rules.
- Produces: `netlistSchema` accepting the new kinds, `models`, `dc` and `nodeset`; exported types `NetlistModel`, `ModelKind`, `DcAnalysis`; `PARAM_SPECS: Record<ModelKind, readonly ParamSpec[]>`.

- [ ] **Step 1:** In `ir.test.ts`, add the needle table for the new invalid fixtures, and a test that `PARAM_SPECS` keys and defaults equal a JSON dump produced by a Rust unit test (`models::tests::spec_matches_ts`) at `packages/schema/fixtures/param-specs.json`, so the two tables cannot drift. The Rust test writes nothing: it compares against the committed JSON.
- [ ] **Step 2:** `pnpm --filter @nodal/schema test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(schema): models, nonlinear elements, dc sweep and nodeset`.

### Task 4: Device trait for Newton, Newton driver, diode

**Files:**
- Create: `crates/nodal-engine/src/analysis/newton.rs`, `src/devices/{constants,diode,limit}.rs`, `tests/jacobian.rs`, `tests/nonlinear_op.rs`
- Modify: `src/devices/*.rs` (new signature), `src/circuit/mod.rs`, `src/analysis/{mod,op}.rs`, `docs/reference/devices.md` (constants table, trait note)

**Interfaces:**
- Produces:
  - In `devices/mod.rs`:
    ```rust
    pub enum LoadMode { InitJunction, Float, Exact }
    pub struct LoadContext { pub mode: LoadMode, pub gmin: f64, pub source_factor: f64 }
    pub trait Device: Debug {
        fn name(&self) -> &str;
        fn state_len(&self) -> usize { 0 }
        /// Returns true if limiting changed a junction voltage.
        fn load(&self, x: &[f64], state: &mut [f64], ctx: &LoadContext, sys: &mut RealSystem) -> bool;
        fn converged(&self, x: &[f64], state: &[f64], ctx: &LoadContext) -> bool { true }
        fn set_dc(&mut self, value: f64) -> bool { false }
    }
    ```
    `InitJunction`: ignore `x` and use the ngspice MODEINITJCT voltages (diode `Vcrit`; BJT `Vbe = Vcrit`, `Vbc = 0`; MOSFET `Vbs = -1`, `Vgs = VTO` type-adjusted, `Vds = 0`). `Float`: read voltages from `x`, limit against `state`, store the limited voltages and the evaluated current and conductances in `state`. `Exact`: evaluate at `x` without limiting (used for residuals and stamp tests). Independent V and I multiply their value by `source_factor` and implement `set_dc`.
  - `Circuit` gains `internal_names: Vec<String>` (unknowns `node_count .. node_count + internal_count`, labelled `V(D1#internal)`, never reported in results), `state_offsets: Vec<usize>`, `state_len()`, `device_mut(&mut self, name) -> Option<&mut Box<dyn Device>>`, and `options: SolverOptions { reltol, vntol, abstol, gmin }` filled from the netlist. `branch_unknown` = nodes + internals + j.
  - `devices/constants.rs`: `CHARGE = 1.6021766208e-19`, `BOLTZMANN = 1.38064852e-23`, `T_NOMINAL = 300.15`, `VT = BOLTZMANN * T_NOMINAL / CHARGE`.
  - `devices/limit.rs`: `pnjlim(vnew, vold, vt, vcrit) -> (f64, bool)`, `fetlim(vnew, vold, vto) -> f64`, `limvds(vnew, vold) -> f64`, ported exactly from `devsup.c`.
  - `diode.rs`: `pub fn eval(vd: f64, p: &DiodeParams, gmin: f64) -> (f64 /* I */, f64 /* g */)`, both regions of `devices.md` §1. `RS > 0` allocates one internal node between anode and junction and stamps `1/RS` from anode to it.
  - `analysis/newton.rs`:
    - `pub(crate) fn newton(circuit, x0: &[f64], state: &mut [f64], cfg: &NewtonConfig) -> Result<Vec<f64>, NewtonFailure>` with `NewtonConfig { diag_gmin: f64, source_factor: f64, init_junction: bool, max_iter: usize }`. `diag_gmin` is added to every node and internal-node diagonal.
    - Iteration: load (first iteration `InitJunction` when `init_junction`, else `Float`), check `out_of_range`, factor, solve. Converged when iteration ≥ 2, no device limited during this load, every unknown passes numerical-methods §1.2 test 1 (vntol for node and internal unknowns, abstol for branches), and every `device.converged(x_new)` holds.
    - `NewtonFailure { last_x: Vec<f64>, last_update: Vec<f64> }`; singular pivots still map to `Error::Singular`.
  - `solve_op` becomes: build x0 (zeros, or nodeset values; with a nodeset, `init_junction = false`) → plain Newton. Fallbacks arrive in Task 5.

- [ ] **Step 1: Write the failing tests.**
  - `tests/jacobian.rs` with a shared helper `check(f: impl Fn(f64) -> f64, analytic: f64, v: f64, h: f64)` implementing VALIDATION §5. Diode cases (IS = 1e-14, N = 1, gmin = 1e-12, h = 1e-6·VT): `diode_reverse` (−1 V), `diode_boundary_below`/`above` (−3·VT ∓ 1e-4), `diode_weak_forward` (0.3 V), `diode_strong_forward` (0.8 V), and `diode_n2_forward` (N = 2, 0.9 V). Also `diode_current_is_continuous_at_boundary` (|I(−3VT − 1e-12) − I(−3VT + 1e-12)| ≤ 1e-20).
  - `limit.rs` unit tests: `pnjlim_large_forward_step` (vold 0.6, vnew 5 → ≈ 0.6 + vt·(2 + ln(a − 2)), limited), `pnjlim_from_reverse` (vold −1, vnew 2 → vt·ln(2/vt)), `pnjlim_no_change_small_step`, `fetlim_*` and `limvds_*` cases, one per branch of each routine, values computed by hand in the test.
  - `tests/nonlinear_op.rs`:
    - `vt_value`: `VT` equals 0.025864186… to 1e-12 relative (compute the literal in the test from the two constants written out).
    - `diode_current_source_analytic`: I1 0 a 1e-3; D1 a 0 (IS 1e-14) → `V(a)` solves $10^{-3} = I_S(e^{V/V_t}-1) + g_{min}V$, found in the test by bisection; op tolerance.
    - `diode_series_resistor_matches_rs`: V1 in 0 5; R1 in a 1k; D1 a 0 RS=100 gives the same `V(in)`, `I(V1)` as V1 in 0 5; R1 in a 1k; R2 a b 100; D1 b 0 RS=0, within 1e-12 relative; the RS netlist reports no internal node.
    - `nodeset_changes_start_not_answer`: the diode circuit with `nodeset {a: 0.65}` gives the same answer.
  - Unit test in `analysis/op.rs`: `linear_circuits_converge_in_two_iterations`: the L1 netlist converges and a `pub(crate)` iteration count returned by `newton` is 2.
  - `devices::tests::diode_stamp_matches_eval`: `load` in `Exact` mode at `vd = 0.7` stamps `g` in the resistor pattern and `I − g·vd` into `b` as mna.md §4 says.
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. Update `devices.md`: constants table to the CODATA 2014 values with `V_t` recomputed (one line saying ngspice has used them since its const.h moved off SPICE2 values), and a note under ARCHITECTURE §4.2 that limiting happens inside `load` as in SPICE, so there is no separate `limit` method.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check && cargo run -p nodal-cli -- validate validation`. Expected: PASS, L1–L3 still pass.
- [ ] **Step 5:** Commit `feat(engine): Newton driver, device state and limiting, diode`.

### Task 5: gmin stepping, source stepping, non-convergence report

**Files:** Modify `src/analysis/{newton,op}.rs`, `src/error.rs`. All tests are unit tests in `analysis/newton.rs`, because they use `pub(crate)` and `#[cfg(test)]` items.

**Interfaces:**
- Produces:
  - `pub(crate) fn solve_dc(circuit, x0, state, strategy: Strategy) -> Result<Vec<f64>, Error>` with `Strategy::{All, GminOnly, SourceOnly}` (the last two are for tests). `All` = plain Newton, then gmin stepping, then source stepping.
  - gmin stepping (from `cktop.c` `dynamic_gmin`, starting value from numerical-methods §1.4): `g = 1e-2`, `factor = 10`. Loop: Newton from the last good x with `diag_gmin = g`. On success: keep x; if `g ≤ gmin`, stop; if it took ≤ `itl1/4` iterations, `factor = min(factor·√factor, 10)`; `g = max(g/factor, gmin)`. On failure: `factor = √√factor`; if `factor < 1.00005`, the stage fails; `g = g_last_good/factor`. Then one plain Newton with `diag_gmin = 0` from the result.
  - Source stepping (`gillespie_src`): α = 0 solved by plain Newton from zeros; `raise = 0.001`. Loop: `α' = min(1, α + raise)`, Newton at `source_factor = α'` from the last good x. On success: accept; if `α' = 1`, done; if ≤ `itl1/4` iterations, `raise *= 1.5`. On failure: `raise /= 10`; below 1e-7, the stage fails.
  - `Error::NoConvergence { updates: Vec<(String, f64)>, residuals: Vec<(String, f64)> }`: the five unknowns with the largest |last update| (labels from `unknown_label`) and the five node rows with the largest |KCL residual|, both sorted by magnitude descending (an exception to ascending-name order, documented on the variant). The residual is $A(x)\,x - b(x)$ with every device loaded in `Exact` mode at the last iterate of the last stage. Display: `DC operating point did not converge after gmin and source stepping; largest updates: V(a)=1.2e-3, …; largest KCL residuals: a=3.4e-6, …`.

- [ ] **Step 1: Write the failing tests.**
  - `n5_like_converges_each_way`: 10 series default diodes from 100 V through 1 Ω. `All`, `GminOnly` and `SourceOnly` agree within the op tolerance.
  - `gmin_stepping_reaches_target`: on that circuit, a `pub(crate)` trace of `GminOnly` shows the last diag gmin equals `options.gmin`, then a final 0.
  - `no_convergence_names_unknowns`: a `#[cfg(test)]` device `NeverConverges` (in `devices/mod.rs`, always returns "limited") makes `All` fail with `NoConvergence`, at most five entries in each list, labels of the form `V(…)`/`I(…)` and node names.
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): gmin and source stepping with a non-convergence report`.

### Task 6: Validation harness fixes and L5

**Files:** Modify `crates/nodal-cli/src/validate.rs`, `crates/nodal-cli/tests/cli.rs`, `validation/scripts/regen-goldens.mjs`; create `validation/circuits/L5.json`, `validation/golden/L5.op.csv`, a test in `crates/nodal-engine/tests/reference_linear.rs`.

**Interfaces:**
- `validate_dir` no longer aborts on a circuit that fails to load or simulate: it writes `| <id> | <analysis> | - | - | <message> | ERROR |` and the run fails.
- `regen-goldens.mjs`: `fail()` throws an `Error`; `main` catches, prints `regen-goldens: <msg>` and exits 1. Goldens are computed for every id first and written only after all succeed.

- [ ] **Step 1: Write the failing tests** in `validate.rs`: `missing_circuit_is_an_error_row`, `empty_golden_dir_is_an_error`, `parse_golden_rejects_bad_header`, `parse_golden_rejects_bad_number`, `parse_golden_skips_comments`, and `error_row_rendered` (a temp dir with one golden whose circuit is floating gives exit failure and a table with `ERROR`). Use `std::env::temp_dir()` plus a unique subfolder; no new dependency.
- [ ] **Step 2:** `cargo test -p nodal-cli`. Expected: FAIL.
- [ ] **Step 3:** Implement. Add **L5**: I1 0 a 2e-3; R1 a b 1k; L1 b c 1e-3; R2 c 0 2k; C1 c 0 1e-6; R3 a 0 3k, with golden-run options. Analytic: `V(a) = 2e-3·(3k ∥ 3k) = 3`, `V(b) = V(c) = 2`, `I(L1) = 1e-3`. Add the analytic test, then run `node validation/scripts/regen-goldens.mjs L5` (needs `apt-get install ngspice`) and commit the golden.
- [ ] **Step 4:** `cargo test --workspace && cargo run -p nodal-cli -- validate validation && node --check validation/scripts/regen-goldens.mjs && pnpm format:check`. Expected: PASS, L1–L5 pass.
- [ ] **Step 5:** Commit `test(validation): error rows, harness tests, atomic golden regeneration, L5`.

### Task 7: BJT (Gummel–Poon subset)

**Files:** Create `src/devices/bjt.rs`; tests in `tests/jacobian.rs`, `tests/nonlinear_op.rs`.

**Interfaces:**
- `pub fn eval(vbe: f64, vbc: f64, p: &BjtParams, gmin: f64) -> BjtEval` with `BjtEval { ic, ib, dic_dvbe, dic_dvbc, dib_dvbe, dib_dvbc }`, NPN polarity; the device applies PNP sign flips per `devices.md` §2. The stamp derivation from $(I_C, I_B)$ and $I_E = -(I_C + I_B)$ is written as a comment above `load`. State: `vbe, vbc, ic, ib` and the four derivatives. pnjlim on each junction with $V_{crit}$ from `IS` and `NF`/`NR`. `converged` follows `bjtconv.c`.

- [ ] **Step 1: Write the failing tests.** Jacobian (all four partials, h = 1e-6·VT) for NPN with `IS 1e-16, BF 100, BR 1, VAF 50`: `bjt_cutoff` (−0.5, −5), `bjt_active` (0.7, −3), `bjt_saturation` (0.75, 0.6), `bjt_reverse` (−3, 0.7), plus `bjt_active_no_early` (VAF ∞). `pnp_mirrors_npn`: PNP eval at (−vbe, −vbc) gives negated currents and equal conductances. Circuits: `npn_forced_ib` (I1 0 b 10e-6; V1 c 0 5; Q1 c b 0, VAF ∞ → `I(V1)` = −BF·10e-6·(…) computed from the equations in the test by solving for vbe by bisection) and `diode_connected_npn` (I1 0 a 1e-4; Q1 a a 0 → `V(a)` solves $10^{-4} = I_F(1 + 1/B_F)$ + gmin terms, bisection).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): BJT (Gummel-Poon transport subset)`.

### Task 8: MOSFET Level 1

**Files:** Create `src/devices/mos1.rs`; tests in `tests/jacobian.rs`, `tests/nonlinear_op.rs`.

**Interfaces:**
- `pub fn eval(vgs: f64, vds: f64, vbs: f64, p: &Mos1Params, beta: f64) -> MosEval` with `MosEval { id, gm, gds, gmbs }`, NMOS polarity and $V_{ds} \ge 0$; the device handles the drain/source swap and PMOS negation per `devices.md` §3. `gmin` is stamped drain–source (the §5 deviation). Limiting per `mos1load.c`: fetlim on `vgs` (or `vgd` in reverse mode), limvds on `vds`, pnjlim is not used (no bulk diodes). `converged` follows `mos1conv.c` with the drain current only.

- [ ] **Step 1: Write the failing tests.** Jacobian (gm, gds, gmbs; h = 1e-6 V) with `VTO 0.7, KP 1e-4, GAMMA 0.4, PHI 0.65, LAMBDA 0.02`, W/L = 10: `mos_cutoff`, `mos_triode` (vgs 2, vds 0.5), `mos_saturation` (vgs 2, vds 3), `mos_reverse_vds` (device-level, vds −0.5, checked through the terminal currents the device stamps), `mos_vbs_positive` (vbs 0.2), `mos_vbs_negative` (vbs −1), `pmos_saturation`. `mos_current_continuous_at_vdsat`. Circuits: `nmos_saturation_analytic` (V1 g 0 2; V2 d 0 3; M1 d g 0 0 → `I(V2) = -β/2·(1.3)²·(1 + 0.06)`), `diode_connected_nmos` (I1 0 a 1e-4; M1 a a 0 0 → `V(a) = VTO + √(2·1e-4/β)` with λ = 0, and gmin·V folded in by bisection).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): MOSFET Level 1 (Shichman-Hodges)`.

### Task 9: Voltage-controlled switch

**Files:** Create `src/devices/switch.rs`; tests in `tests/nonlinear_op.rs`; update `docs/reference/mna.md` §6 (switch output pair is a DC edge, control port is not).

**Interfaces:**
- State: one slot, the on/off state (0.0 or 1.0). `InitJunction` starts off. Each `Float` load: on if $v_c > V_T + V_H$, off if $v_c < V_T - V_H$, else the stored state (`swload.c`). A change of state returns "limited", so that iteration can't converge. Stamps `1/RON` or `1/ROFF` in the resistor pattern; `ROFF` unset means `1/options.gmin`.

- [ ] **Step 1: Write the failing tests:** `switch_on` (vc 2 V, VT 1 → divider with RON), `switch_off`, `switch_in_band_starts_off` (VT 1, VH 0.5, vc 1.2 → off), `switch_roff_follows_gmin` (gmin option 1e-9, ROFF unset → off resistance 1e9), `switch_jacobian_on_off` (FD of the stamped current equals the stamped conductance in both states).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): voltage-controlled switch, DC behaviour`.

### Task 10: DC sweep analysis, CLI and `dc` goldens

**Files:** Create `src/analysis/dc.rs`, `crates/nodal-engine/tests/dc_sweep.rs`; modify `src/lib.rs`, `src/analysis/mod.rs`, `crates/nodal-cli/src/{main,validate}.rs`, `validation/scripts/regen-goldens.mjs`.

**Interfaces:**
- `AnalysisResult::Dc(DcResult)`, `DcResult { source: String, sweep: Vec<f64>, node_voltages: BTreeMap<String, Vec<f64>>, branch_currents: BTreeMap<String, Vec<f64>> }`, JSON `{"type":"dc","source":…,"sweep":[…],"nodeVoltages":{…},"branchCurrents":{…}}`.
- `solve_dc_sweep(circuit: &mut Circuit, source, values) -> Result<DcResult, Error>` calls `pub(crate) fn sweep_with(circuit, source, values, plain_allowed: impl Fn(usize) -> bool)` with `|_| true`; `set_dc` on the source for each value (restored afterwards, also on error); point 0 uses the full op chain; each later point starts from the previous x and state with plain Newton, then the full chain if that fails. An error names the failing sweep value.
- Golden `validation/golden/<id>.dc.csv`: same comment header with `# analysis: dc`, then `sweep,<signal>,…` and one row per point. `validate` finds `*.op.csv` and `*.dc.csv`; `compare_dc` checks the point count and each sweep value ($|Δ| \le 10^{-9}\max(1,|x|)$) and every signal at every point with the op tolerance; the row reports the worst ratio over all points. The table's analysis column shows `op` or `dc`.
- Regen script: every validation circuit has exactly one analysis (else fail); multi-point rawfiles parse into rows; the ngspice scale vector (`v-sweep` or `i-sweep`) becomes `sweep`; vectors containing `#` other than `#branch` are device-internal and skipped.

- [ ] **Step 1: Write the failing tests:** `sweep_linear_divider` (L1 with `dc V1 0 10 1` → `V(out) = 0.75·V1` at each point), `sweep_restores_source` (op after a sweep in the same netlist gives the original value), `sweep_point_uses_fallbacks` (unit test in `dc.rs`: `sweep_with` on N1's circuit with plain Newton disabled at index 3 returns all points, equal to the normal sweep within the op tolerance), `sweep_current_source`; CLI `run_dc_sweep_json`; validate `compare_dc_point_count_mismatch_fails`, `compare_dc_sweep_value_mismatch_fails`, `parse_dc_golden`.
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check && cargo run -p nodal-cli -- validate validation && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine,cli): dc sweep analysis and dc goldens`.

### Task 11: Reference circuits N1–N5 and their goldens

**Files:** Create `validation/circuits/{N1,N2,N3-vgs1,N3-vgs2,N3-vgs3,N4,N5}.json` and their goldens; `validation/circuits/probe-vt.json` is a scratch file, not committed.

Circuits (every file carries the golden-run options):
- **N1:** V1 in 0; R1 in a 1k; D1 a 0 `DMOD (IS=1e-14, RS=10)`; `dc V1 -5 5 0.1`.
- **N2:** VCC vcc 0 12; R1 vcc b 47k; R2 b 0 10k; RC vcc c 4.7k; RE e 0 1k; Q1 c b e `QMOD NPN (IS=1e-15, BF=200, VAF=100)`; op.
- **N3-vgsK** (K = 1, 2, 3): VGS g 0 K; VDS d 0 0; M1 d g 0 0 `NMOD (VTO=0.7, KP=1e-4, GAMMA=0.4, PHI=0.65, LAMBDA=0.02)`, W = 10e-6, L = 1e-6; `dc VDS 0 5 0.05`. Bulk tied to source (devices.md §5).
- **N4:** VDD vdd 0 3.3; VIN in 0; MN out in 0 0 `NMOD` (as N3), W 10e-6, L 1e-6; MP out in vdd vdd `PMOD PMOS (VTO=-0.7, KP=5e-5, LAMBDA=0.02)`, W 20e-6, L 1e-6; `dc VIN 0 3.3 0.033`.
- **N5:** V1 in 0 100; R1 in a1 1; D1…D10 in series a1 → a2 → … → a10 → 0, default `D` model; op.

- [ ] **Step 1: Confirm the constants.** `apt-get install ngspice`, then run `probe-vt.json` (I1 0 a 1e-3; D1 a 0, IS 1e-14, op) through ngspice. $V_t = V(a)/\ln(10^{-3}/10^{-14} + 1)$ (gmin effect below 1e-9 relative) must match `VT` within 1e-7 relative. If not, stop and report; don't change any tolerance.
- [ ] **Step 2:** Write the circuit files and run `node validation/scripts/regen-goldens.mjs N1 N2 N3-vgs1 N3-vgs2 N3-vgs3 N4 N5`.
- [ ] **Step 3:** `cargo run -p nodal-cli -- validate validation`. Expected: all rows pass. A failing row is a bug until shown otherwise (AGENTS.md): find which side is wrong; a documented deviation needs a written reason in the commit, and no tolerance changes.
- [ ] **Step 4:** `cargo test --workspace` (`valid_fixtures_parse` covers the new circuits, and Zod does via `pnpm test`).
- [ ] **Step 5:** Commit `test(validation): reference circuits N1-N5 with ngspice goldens`.

### Task 12: Close M2

**Files:** `docs/ROADMAP.md`, `README.md`, `docs/VALIDATION.md` (rule line names the N circuits checked in CI), `docs/ARCHITECTURE.md` §3/§4.2 if the IR or trait text is now out of date.

- [ ] **Step 1:** Push; wait for a green CI run. Record its URL, the rust job URL and the `validation-report` artifact URL.
- [ ] **Step 2:** Update the M2 roadmap entry to **done** with that evidence, as M1 did. README status: what M2 adds, only as far as the tests show.
- [ ] **Step 3:** Humanize the prose; `pnpm format:check`.
- [ ] **Step 4:** Commit `docs: close M2`, push, confirm green.
- [ ] **Step 5:** Final whole-milestone review on Opus.
