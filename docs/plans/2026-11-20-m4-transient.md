# M4 Transient Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nodal-cli run` performs transient analysis with trapezoidal and Gear-2 integration, LTE step control ported from ngspice, pulse/sine/PWL sources with breakpoints, `uic`, and switch hysteresis with crossing location. MOSFET bulk junction diodes carry their saturation current. Circuits T1–T6 match committed ngspice goldens with both `trap` and `gear` in CI.

**Architecture:** Transient reuses the Newton driver. Each reactive device keeps charge slots in its state, as ngspice keeps `qcap`/`ccap` pairs: slot `q` holds the charge (or flux), slot `q + 1` its current. The driver keeps three accepted copies of the state vector (ngspice `CKTstate1..3`) and hands each device its own slices of them through a new `tran` field on `LoadContext`. Devices compute their charge, call one shared integrator (port of `niinteg.c`) and stamp the companion. Step control is generic: devices list their charge slots, and the driver runs the `cktterr.c` port over every slot. Breakpoints come from a pure `waveform` module; switch crossings are found after each converged point and resolved by step rejection.

**Tech Stack:** unchanged from M3 (Rust 1.97.0, serde, faer 0.24, clap 4; TypeScript 6, Zod 4, Vitest; ngspice-42 for golden regeneration only).

**Spec:** [`docs/ROADMAP.md`](../ROADMAP.md) §M4; [`docs/reference/numerical-methods.md`](../reference/numerical-methods.md) §1.3, §2–3; [`docs/reference/mna.md`](../reference/mna.md) §3–5; [`docs/reference/devices.md`](../reference/devices.md) §1–5; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §3, §4.2–4.5; [`docs/VALIDATION.md`](../VALIDATION.md) §3–4; the M4 scope note and "Minor test gaps from M3" in the project's session notes, reproduced in Task 1.

## Global Constraints

- Everything in `AGENTS.md` and in the M1–M3 plans' Global Constraints still applies: no I/O in the engine, no `unwrap`/`expect`/`panic!` in library code, SI f64, English, commit identity `TristanHottier <185231225+TristanHottier@users.noreply.github.com>` with no AI trailers, humanizer on prose, uppercase model keys, `temp` = 27, never `minimumReleaseAgeExclude`.
- No new dependencies. `irVersion` stays 1; every IR change is additive.
- Every ported ngspice routine cites its source file in a comment and is ported from the source, fetched with `curl -sfL https://raw.githubusercontent.com/imr/ngspice/master/src/<path>`: `spicelib/analysis/dctran.c`, `spicelib/analysis/cktterr.c`, `maths/ni/nicomcof.c`, `maths/ni/niinteg.c`, `spicelib/devices/vsrc/{vsrcload,vsrcacct}.c`, `spicelib/devices/isrc/isrcload.c`, `spicelib/devices/cap/capload.c`, `spicelib/devices/ind/indload.c`, `spicelib/devices/dio/dioload.c`, `spicelib/devices/bjt/bjtload.c`, `spicelib/devices/mos1/mos1load.c`, `spicelib/devices/sw/swload.c`. Reviewers get the same files.
- Defaults (ARCHITECTURE §4.4): `method = trap`, `trtol = 7`, `chgtol = 1e-14`, `itl4 = 10` (constant, not an option), max order 2, `tmax = min(tstep, (tstop − tstart)/50)`, `hmin = 1e-11 · tmax`. After a failed Newton at a time point: `h /= 8`, order 1 (numerical-methods §1.3).
- Order 1 (backward Euler) at t = 0 and on the first step after every breakpoint, for both methods (numerical-methods §2.1).
- The initial operating point of a transient uses each source's `dc` value, as ngspice does when the deck gives `DC` (the exported deck always does). The waveform is used for t > 0.
- Transient tolerance is VALIDATION §3 (`a = 1e-3 ×` reference peak-to-peak) plus the absolute floor of ADR 0011 (Task 10). No other tolerance change.
- Out of scope: the wasm `run` entry point and anything in the web app (M6), node `.ic` lines, PWL repeat, pulse/sine defaults that depend on the analysis (`tr = 0 → tstep`), `CBD`/`CBS`/`CJ`/`JS`/`TOX` (still rejected), predictor (ngspice builds without `PREDICTOR` by default).

## Review Focus

1. **Breakpoint closer than `hmin` to the current time** (a PWL vertex 1e-20 s after another, or a pulse with `tr` far below `tstop`·1e-11). Expected: the driver treats it as reached (ngspice `dctran.c` compares with `delmin`), never loops or errors. Pinned by `breakpoint_within_hmin_is_reached` (Task 7).
2. **A step that lands exactly on `tstop` after rounding.** Expected: the last output time equals `tstop` exactly and no point lies beyond it. Pinned by `last_point_is_tstop` (Task 7).
3. **`uic` with an inductor `ic` and a capacitor `ic` in the same loop** (series RLC). Expected: `v(C)` at the first output point is the `ic` value and the inductor current starts at its `ic`, matching the closed form. Pinned by `uic_rlc_starts_from_ic` (Task 7).
4. **A switch whose control crosses both thresholds within one step** (a fast PWL edge through the whole hysteresis band). Expected: the step is rejected until only one state change lies in it, and the reported state sequence is off → on with no missing transition. Pinned by `fast_edge_through_band` (Task 9).
5. **Forward-biased MOSFET bulk junction** (source below bulk on an NMOS). Expected: bulk current follows the diode law with `IS`, Newton converges via `pnjlim` on the bulk voltage. Pinned by `nmos_forward_bulk_current` (Task 1).

---

### Task 1: MOSFET bulk junction diodes, plus the M3 test gaps

**Files:** Modify `crates/nodal-engine/src/devices/mos1.rs`, `src/ir/models.rs`, `packages/schema/fixtures/param-specs.json` (regenerated), `crates/nodal-engine/tests/{jacobian,nonlinear_op,ac}.rs`, `src/mna/mod.rs`, `docs/reference/{devices,mna}.md`, `docs/ARCHITECTURE.md` §4.4 (`gmin` row).

**Interfaces:**
- Produces:
  - Model param `IS` for `NMOS`/`PMOS`, default 1e-14, `Pos` (same spec as the diode's `IS`).
  - `mos1::bulk_junction(v: f64, is: f64, gmin: f64) -> (f64, f64)`, `pub(crate)`: port of the `mos1load.c` block. For `v <= -3·Vt`: `(gmin·v − is, gmin)`; else `evb = exp(min(v/Vt, MAX_EXP_ARG))`, `(is·(evb − 1) + gmin·v, is·evb/Vt + gmin)`. `MAX_EXP_ARG` = 709.0 as in ngspice `include/ngspice/defines.h` and `mos1load.c`.
  - Bulk voltage limiting as `mos1load.c`: with `vcrit = Vt·ln(Vt/(√2·IS))`, if `vds >= 0` limit `vbs` with `pnjlim` against the stored `vbs` and set `vbd = vbs − vds`, else limit `vbd` against the stored `vbd` and set `vbs = vbd + vds`. Store `vbd` in state (extend `STATE_LEN`; keep existing slot indices).
  - Terminal stamps of the two junctions (`gbd`, `gbs`, `ceqbd`, `ceqbs`) as `mos1load.c`, for NMOS and PMOS (`type` sign). The old drain-bulk/source-bulk `gmin` stamp is removed: the junction carries it.
  - `converged` also tests `cbhat = cbs + cbd` as `mos1conv.c`.
  - `SmallSignal` stamps `gbd`, `gbs` from the stored junction voltages.

- [ ] **Step 1: Write the failing tests.**
  - `tests/jacobian.rs`: `mos1_bulk_junction_regions`: finite differences of `bulk_junction` at `v` = −1 (below −3Vt), −3Vt ± 1e-6, 0.3, 0.7 (VALIDATION §5 rules), and of the full NMOS and PMOS terminal currents at a bias with `Vbs = 0.6` (forward) and one with `Vbd = 0.6`.
  - `tests/nonlinear_op.rs`: `nmos_forward_bulk_current`: NMOS `VTO 1 KP 1e-4`, gate 0, drain 0, bulk 0, source driven to −0.65 V through 0 Ω (V source). `I(VS)` equals `−IS·(exp(0.65/Vt) − 1) − gmin·0.65` computed in the test, op tolerance. Same mirrored for PMOS.
  - `mos1.rs`: `small_signal_leaves_state_untouched` (load in `SmallSignal`, state unchanged bit for bit; M3 gap). `tests/ac.rs`: `mos_reverse_mode_capacitance`: NMOS with `Vds < 0`, overlap capacitances stay on the physical terminals (closed form as in A6's test; M3 gap).
  - `mna/mod.rs`: `assemble_ac_rejects_size_mismatch`: `assemble_ac` returns `Err(Error::Internal(..))` when `G` and `C` differ in size (change its return type to `Result<DenseMatrix<C64>, Error>`; M3 gap).
- [ ] **Step 2:** `cargo test --workspace`. Expected: the new tests fail.
- [ ] **Step 3:** Implement. Delete the "gmin part only" row from devices.md §5 and its mention in §3, mna.md §5 and ARCHITECTURE §4.4; describe the junction in devices.md §3 (equations above, `IS` row in the table, limiting). Run `pnpm regen:param-specs`.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check && cargo run -p nodal-cli -- validate validation && pnpm --filter @nodal/schema test`. Expected: PASS. N3, N4, N6 and A6 still pass against their unchanged goldens (ngspice always had the junctions). If one fails, it is a bug until shown otherwise (AGENTS.md); do not regenerate.
- [ ] **Step 5:** Commit `feat(engine): MOSFET bulk junction diodes with IS`.

### Task 2: IR for waveforms, initial conditions and the `tran` analysis (Rust + export)

**Files:** Modify `crates/nodal-engine/src/ir/{mod,validate}.rs`, `src/export/spice.rs`, `src/lib.rs` (arm returns `Error::Invalid("tran analysis is not simulated yet")` until Task 7), `tests/ir_fixtures.rs`. Create `packages/schema/fixtures/ir/valid/tran.json` and the invalid fixtures below.

**Interfaces:**
- Produces:
  - `pub enum Waveform` (serde tag `type`, lowercase, `deny_unknown_fields`, camelCase fields):
    - `Pulse { v1, v2, td, tr, tf, pw, per }`, all `f64`, `td` defaults to 0.
    - `Sin { vo, va, freq, td, theta, phase }`, `td`, `theta`, `phase` (degrees) default to 0.
    - `Pwl { points: Vec<[f64; 2]> }`, `[time, value]` pairs.
  - `Element::V` and `Element::I` gain `#[serde(default, skip_serializing_if = "Option::is_none")] tran: Option<Waveform>`; `Element::C` and `Element::L` gain `ic: Option<f64>` the same way.
  - `Analysis::Tran { tstep: f64, tstop: f64, #[serde(default)] tstart: f64, tmax: Option<f64>, #[serde(default)] uic: bool }`.
  - `Options` gains `method: Option<Method>` (`pub enum Method { Trap, Gear }`, lowercase) and `trtol: Option<f64>`.
- Validation rules (messages quote the element or analysis):

| # | Rule |
|---|---|
| V18 | Waveform numbers finite. Pulse: `tr > 0`, `tf > 0`, `pw >= 0`, `per > 0`, `td >= 0`. Sin: `freq > 0`, `td >= 0`, `theta >= 0`. Pwl: at least one point, times `>= 0` and strictly increasing |
| V19 | `ic` finite |
| V20 | `tran`: `tstep > 0`, `tstop > tstart >= 0`, `tmax > 0` when set; all finite |
| V21 | `trtol > 0` and finite |

- Invalid fixtures, one rule each, added to `NEEDLES`: `tran-pulse-zero-rise`, `tran-sin-zero-freq`, `tran-pwl-decreasing`, `tran-pwl-empty`, `tran-ic-infinite`, `tran-tstop-before-tstart`, `tran-zero-tstep`, `tran-trtol-zero`, `tran-unknown-method` (`"method":"euler"`), `tran-unknown-waveform` (`"type":"exp"`).
- Export (ngspice syntax): `V1 in 0 DC 0e0 PULSE(v1 v2 td tr tf pw per)`, `SIN(vo va freq td theta phase)`, `PWL(t1 v1 t2 v2 …)`; `C1 a b 1e-6 IC=1e0`, `L1 a b 1e-3 IC=…`; `.tran tstep tstop tstart tmax` (`tmax` only when set; `tstart` printed whenever `tmax` is) plus ` uic` when set; `.options method=gear trtol=…` when set. Numbers in the existing `{:e}` style.

- [ ] **Step 1: Write the failing tests.** Fixtures through `valid_fixtures_parse` / `each_invalid_fixture_breaks_its_own_rule`. `spice.rs::deck_for_tran`: exact deck for `valid/tran.json` (one V of each waveform, an I with a pulse, a C with `ic`, an L with `ic`, `tran 1e-6 1e-3` with `uic`, options `method: gear`).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): IR for source waveforms, initial conditions and the tran analysis`.

### Task 3: Same IR in `@nodal/schema`

**Files:** Modify `packages/schema/src/{ir,ir.test,index}.ts`.

**Interfaces:**
- Consumes: Task 2's fixtures and rules.
- Produces: `netlistSchema` accepting `tran` on V/I, `ic` on C/L, the `tran` analysis, options `method` and `trtol`; exported types `Waveform`, `PulseWaveform`, `SinWaveform`, `PwlWaveform`, `TranAnalysis`, `IntegrationMethod`. Rules V18–V21 in the same order as Rust.

- [ ] **Step 1: Write the failing tests** in `ir.test.ts`: needles for the ten new invalid fixtures; `valid/tran.json` parses and round-trips.
- [ ] **Step 2:** `pnpm --filter @nodal/schema test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(schema): source waveforms, initial conditions and the tran analysis`.

### Task 4: Waveforms and breakpoints

**Files:** Create `crates/nodal-engine/src/waveform.rs`; modify `src/lib.rs` (`pub mod waveform`).

**Interfaces:**
- Consumes: `ir::Waveform`.
- Produces:
  - `pub fn value(w: &Waveform, t: f64) -> f64`: port of the `PULSE`, `SINE` and `PWL` cases of `vsrcload.c`. Pulse repeats with period `per` after `td`. Sine: `vo` for `t < td`, else `vo + va·exp(−(t−td)·theta)·sin(2π·freq·(t−td) + phase)`. PWL: first value before the first point, last value after the last, linear in between.
  - `pub fn next_breakpoint(w: &Waveform, t: f64) -> Option<f64>`: the smallest corner strictly greater than `t`. Pulse corners: `td + k·per + {0, tr, tr+pw, tr+pw+tf}`; sine: `td` when `td > 0`; PWL: each point time. `None` when there is none. Bounded work per call (no enumeration of all periods).

- [ ] **Step 1: Write the failing tests** in `waveform.rs`: `pulse_values` (on each edge midpoint, the plateau, the second period), `pulse_breakpoints_repeat` (from `t` just after the third corner of period 2, the next is the fourth corner of period 2), `sin_before_delay_and_damped` (closed form in the test, 1e-15 relative), `sin_phase_in_degrees`, `pwl_holds_ends`, `pwl_breakpoints`, `breakpoint_none_after_last_pwl_point`.
- [ ] **Step 2:** `cargo test -p nodal-engine waveform`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): pulse, sine and PWL waveforms with breakpoints`.

### Task 5: Integration formulas and truncation error

**Files:** Create `crates/nodal-engine/src/analysis/integrate.rs`; modify `src/analysis/mod.rs`.

**Interfaces:**
- Consumes: `ir::Method`.
- Produces (`pub(crate)` unless noted):
  - `#[derive(Clone, Copy)] pub struct Coeffs { pub method: Method, pub order: usize, pub ag: [f64; 3] }`; `Coeffs::new(method: Method, order: usize, h: [f64; 2]) -> Coeffs` with `h = [h_n, h_{n-1}]`: port of `nicomcof.c` (trap `xmu = 0.5`; gear order 2 by its Vandermonde solve; order 1 is backward Euler for both).
  - `integrate(c: &Coeffs, state: &mut [f64], hist: [&[f64]; 3], q: usize, cap: f64) -> (f64, f64)`: port of `niinteg.c`. Reads `state[q]` (`q_{n+1}`), `hist[j][q]` (`q_{n−j}`) and `hist[0][q+1]` (`i_n`); writes `state[q+1] = i_{n+1}`; returns `(geq, ceq)` with `geq = ag[0]·cap`, `ceq = i_{n+1} − ag[0]·state[q]`.
  - `pub struct TruncOpts { pub reltol: f64, pub abstol: f64, pub chgtol: f64, pub trtol: f64 }`.
  - `truncation(c: &Coeffs, q: usize, levels: [&[f64]; 4], h: [f64; 3], o: &TruncOpts) -> f64`: port of `cktterr.c` for one charge slot, `levels[0]` the new state, `h = [h_n, h_{n−1}, h_{n−2}]`. Constants `trap = [0.5, 1/12]`, `gear = [0.5, 2/9]` (numerical-methods §3.1).

- [ ] **Step 1: Write the failing tests** in `integrate.rs`:
  - `bdf2_constant_step`: `Coeffs::new(Gear, 2, [h, h])` gives `ag = [1.5/h, −2/h, 0.5/h]` within 1e-15 relative.
  - `bdf2_variable_step`: for `ρ = 0.5` and `ρ = 3`, `integrate` returns the numerical-methods §2.2 formula computed in the test.
  - `trap_matches_mna_closed_form`: linear capacitor `C = 2e-6`, `h = 1e-6`: `geq = 2C/h`, `ceq = −(2C/h·v_n + i_n)` (mna.md §3).
  - `backward_euler_order_one`: both methods at order 1 give `geq = C/h`, `ceq = −C/h·v_n`.
  - `truncation_exact_on_cubic`: `q(t) = t³` sampled on uneven points; `DD_3 = 1`, so the proposed step equals the §3.1 formula evaluated in the test for trap order 2.
  - `truncation_large_for_constant_charge`: equal levels give a step `>= 1e10·h`.
- [ ] **Step 2:** `cargo test -p nodal-engine integrate`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): trapezoidal and Gear-2 integration with cktterr truncation error`.

### Task 6: Transient device interface and the linear devices

**Files:** Modify `crates/nodal-engine/src/devices/{mod,capacitor,inductor,vsource,isource}.rs`, every other device file (lifetime on `LoadContext` only where needed), `docs/ARCHITECTURE.md` §4.2.

**Interfaces:**
- Consumes: `Coeffs`, `integrate` (Task 5); `waveform::{value, next_breakpoint}` (Task 4).
- Produces:
  - `LoadContext<'a>` gains `pub tran: Option<TranLoad<'a>>`; `LoadContext::new` returns `LoadContext<'static>` with `tran: None`. `#[derive(Clone, Copy)] pub struct TranLoad<'a> { pub time: f64, pub coeffs: Coeffs, pub hist: [&'a [f64]; 3] }`, where `hist[j]` is this device's slice of the state accepted at `t_{n−j}`.
  - New `Device` methods, all with defaults:
    - `fn charge_slots(&self) -> &'static [usize] { &[] }`: offsets of `q` slots in the device's state; `q + 1` is that charge's current.
    - `fn init_charges(&self, x: &[f64], state: &mut [f64], uic: bool) {}`: store every charge at `x`; with `uic`, a capacitor uses `C·ic` and an inductor `L·ic` (ic 0 when unset); current slots set to 0.
    - `fn next_breakpoint(&self, t: f64) -> Option<f64> { None }`.
  - Capacitor: `state_len` 2, slots `[0]`. With `ctx.tran` set, `load` stores `q = C·v`, integrates, stamps `geq` in the resistor pattern and `ceq` as `b[n+] −= ceq`, `b[n−] += ceq` (`capload.c`). Without `tran`, unchanged (open).
  - Inductor: `state_len` 2, slots `[0]` (flux `L·i_k`). With `tran`, the branch row becomes `v+ − v− − geq·i_k = ceq` (`indload.c`).
  - V and I sources: with `tran`, the value is `waveform::value(w, ctx.tran.time)` when a waveform is set, else `dc` (source factor 1). `next_breakpoint` delegates to the waveform. The source stores its waveform from the IR.

- [ ] **Step 1: Write the failing tests:** `capacitor.rs::tran_trap_stamp` and `tran_gear_stamp` (stamps equal `integrate` on hand-built history; trap equals mna.md §3), `capacitor.rs::uic_init_uses_ic`, `inductor.rs::tran_branch_row` (trap: row matches mna.md §3 inductor table), `vsource.rs::tran_uses_waveform_value` (pulse source, `time` mid-plateau, `b[k] = v2`), `vsource.rs::dc_mode_ignores_waveform`, `isource.rs::tran_breakpoint_delegates`.
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. Update ARCHITECTURE §4.2 to the trait as built (replace the `accept`/`truncation_error`/`breakpoints` sketch).
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check && cargo run -p nodal-cli -- validate validation`. Expected: PASS, every M1–M3 row unchanged.
- [ ] **Step 5:** Commit `feat(engine): transient companion models for C, L and sources`.

### Task 7: Transient driver, result and CLI

**Files:** Create `crates/nodal-engine/src/analysis/tran.rs`, `crates/nodal-engine/tests/tran.rs`; modify `src/analysis/{mod,newton,op}.rs`, `src/error.rs`, `src/lib.rs`, `crates/nodal-cli/src/main.rs`, `crates/nodal-cli/tests/cli.rs`.

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces:
  - `newton_counted` gains `history: Option<&History>` and `NewtonConfig` gains `tran: Option<(f64 /*time*/, Coeffs)>`; when both are set, the load loop builds each device's `TranLoad` from its state offsets. `pub(crate) struct History { pub levels: [Vec<f64>; 3] }`.
  - `pub struct TranResult { pub time: Vec<f64>, pub node_voltages: BTreeMap<String, Vec<f64>>, pub branch_currents: BTreeMap<String, Vec<f64>> }` (camelCase JSON, like `DcResult`); `AnalysisResult::Tran(TranResult)`.
  - `pub fn solve_tran(circuit: &Circuit, spec: &TranSpec) -> Result<TranResult, Error>` with `pub struct TranSpec { pub tstep, pub tstop, pub tstart, pub tmax: Option<f64>, pub uic: bool, pub method: Method, pub trtol: f64, pub chgtol: f64 }` built in `lib.rs` from the analysis and options.
  - `Error::TimestepTooSmall { time: f64, device: String }`: "time step too small at t = … s (smallest proposed step: …)".
- Driver (port of `dctran.c`, cite it):
  1. Without `uic`: `solve_op_with_state`. With `uic`: `x = 0`, state zeros. Then `init_charges` on every device and `History.levels = [state; 3]`. Output point t = 0.
  2. `tmax`, `hmin` as in Global Constraints; first `h` and the post-breakpoint `h` as `dctran.c` (`MIN(tstop/100, tstep)/10`, then `0.1·MIN(saved h, next breakpoint − t)`).
  3. Never step past the next breakpoint (minimum over devices' `next_breakpoint`, and `tstop`); a breakpoint closer than `hmin` counts as reached. After a breakpoint: order 1.
  4. Each point: Newton in `Float` mode from the last accepted `x` and state, `max_iter = 10`. Failure: `h /= 8`, order 1, retry; fatal errors propagate.
  5. Converged: `h_new = min(2h, min over charge slots of truncation(...))`; reject if `h_new < 0.9h`. At order 1 with max order 2, try order 2 as `dctran.c`/`cktterr.c` do (raise when the order-2 proposal exceeds 1.05·h).
  6. Accept: rotate history (`levels[2] = levels[1]`, …, `levels[0] = state`), record the point when `t >= tstart`. `h < hmin` gives `TimestepTooSmall` naming the device of the smallest proposal.
- CLI: `nodal-cli run` prints the tran result like the dc result (JSON).

- [ ] **Step 1: Write the failing tests** in `tests/tran.rs` (all run with both methods, golden-run options `reltol 1e-6, vntol 1e-9, abstol 1e-15, chgtol 1e-18`):
  - `t1_rc_matches_closed_form`: V1 pulse 0→1, `td 0, tr 1e-9, tf 1e-9, pw 1, per 2`; R 1 kΩ; C 1 µF; `tran 1e-5 5e-3`. `v(out)` equals the RC response to a ramp-and-hold input (superposition of two ramps, computed in the test) at every output point within `1e-3` V.
  - `t2_rlc_matches_closed_form`: same source; R 10 Ω, L 1 mH, C 1 µF in series; `tran 1e-6 2e-3`. `v(C)` equals the underdamped step response (ω₀ = 1/√(LC), ζ = R/2·√(C/L)) within `1e-3 × 2` V (twice the source step bounds the peak-to-peak).
  - `uic_rlc_starts_from_ic`: T2 without a source step (V1 dc 0), `C ic 1`, `L ic 1e-3`, `uic`: first point `v(C) = 1`, `I(L) = 1e-3`, then matches the closed form within 1e-3.
  - `breakpoint_within_hmin_is_reached`: PWL with vertices at 1e-4 and 1e-4 + 1e-20 into an RC; the run completes and a point lies at 1e-4 within `hmin`.
  - `last_point_is_tstop` and `points_land_on_pulse_corners` (every pulse corner below `tstop` is an output time, exactly).
  - `tstart_drops_early_points`.
  - `timestep_too_small_names_device`: a circuit that cannot converge at any step (the `NeverConverges` test device behind a capacitor) gives `TimestepTooSmall`. Use a `cfg(test)` hook in `tran.rs` if the device must be injected.
  - `cli.rs::run_tran_prints_time`.
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check && NODAL_WASM_NO_OPT=1 pnpm build:wasm`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): transient analysis with LTE step control and breakpoints`.

### Task 8: Charges of the diode, BJT and MOSFET in transient

**Files:** Modify `crates/nodal-engine/src/devices/{diode,bjt,mos1}.rs`, `tests/jacobian.rs`, `tests/tran.rs`, `docs/reference/devices.md` §1–3.

**Interfaces:**
- Consumes: `diode::charge`, `bjt::charges`, `integrate`, `TranLoad`, `charge_slots`, `init_charges`.
- Produces:
  - Diode: one charge slot (`Q_d`, devices.md §1). With `tran`, `gd += geq`, `cd += i_q` as `dioload.c`.
  - BJT: two slots (`Q_be`, `Q_bc`). Base and collector currents gain the charge currents and the transcapacitance term `geqcb` as `bjtload.c`, with `XCJC = 1`, no `qbx`, no substrate charge. PNP by the existing sign rule.
  - MOSFET: three slots (`q_gs`, `q_gd`, `q_gb`) for the constant overlap capacitances, integrated as `mos1load.c` does with zero Meyer capacitance (`q = (v − v_prev)·C + q_prev`), including its `MODEINITTRAN` handling. No bulk charge (CBD/CBS rejected).

- [ ] **Step 1: Write the failing tests:**
  - `tests/jacobian.rs::tran_companion_matches_charge` for each device (diode forward and reverse; BJT active, saturation; NMOS and PMOS saturation): with hand-built trap history at step `h`, the stamped `geq` equals `ag0 ·` central difference of the charge, and the stamped current equals `ag0·(q(v) − q_n) − i_n` (trap order 2), VALIDATION §5 criteria.
  - `tests/tran.rs::diode_reverse_charge_balance`: diode with `CJO 10p, TT 0` reverse-biased by a sine through 1 kΩ; over one full period after 5 periods, `∫ I(V1) dt` (trapezoid over output points) is below `1e-3 · CJO · va`.
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. devices.md: one paragraph per device on the transient companion and its source file.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check && cargo run -p nodal-cli -- validate validation`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): junction and overlap charges in transient`.

### Task 9: Switch hysteresis in transient

**Files:** Modify `crates/nodal-engine/src/devices/{mod,switch}.rs`, `src/analysis/tran.rs`, `tests/tran.rs`, `docs/reference/devices.md` §4.

**Interfaces:**
- Produces:
  - `Device::crossing(&self, x_prev: &[f64], x_new: &[f64], state_prev: &[f64], state_new: &[f64]) -> Option<f64> { None }`: for a switch whose stored state differs between the two points, the fraction `θ ∈ [0, 1]` of the step at which `v_c` crosses the threshold it crossed (`VT + VH` off→on, `VT − VH` on→off), by linear interpolation.
  - Driver, after a converged point and before LTE: take the smallest `θ` over devices. If `(1 − θ)·h > reltol·h`, reject and retry with `h' = θ·h + 0.5·reltol·h` (order unchanged); when the retried point no longer changes state, keep stepping normally. Accepting a point with a state change restarts at order 1 with the post-breakpoint `h`.
- [ ] **Step 1: Write the failing tests** in `tests/tran.rs`: `switch_turns_on_within_reltol` (control PWL ramp 0→5 V over 1 ms, `VT 2.5, VH 0.5`: the first output point with the switch on lies within `reltol·h` after the analytic crossing at 0.6 ms), `switch_hysteresis_band` (ramp up then down: on at 3 V, off at 2 V), `fast_edge_through_band` (control steps 0→5 in 1 ns: exactly one off→on change, located within tolerance).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. devices.md §4: describe the rule as built.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): switch threshold crossings in transient`.

### Task 10: Transient validation: comparator, ADR, T1–T6 goldens

**Files:** Create `docs/adr/0011-transient-absolute-floor.md`, `crates/nodal-cli/src/validate/tran.rs` (move `validate.rs` to `validate/mod.rs`; it is past 1000 lines), `validation/circuits/T{1..6}-{trap,gear}.json`, `validation/golden/T{1..6}-{trap,gear}.tran.csv`; modify `validation/scripts/regen-goldens.mjs`, `regen-goldens.test.mjs`, `docs/VALIDATION.md`, `docs/adr/README.md`.

**Interfaces:**
- Produces:
  - ADR 0011 (Accepted, Tristan): a transient sample passes if `|x − x_ref| ≤ 1e-3·p2p(ref) + a_op`, with `a_op` the op absolute tolerance (1e-8 V, 1e-13 A). Reason: a constant signal (a supply node) has `p2p = 0`, and the VALIDATION §3 rule alone would demand bit-exact equality. **Manual, Tristan: accept the ADR** (the plan's approval counts if he says so).
  - `parse_tran_golden(text) -> Result<TranGolden, String>`, `compare_tran(golden: &TranGolden, result: &TranResult) -> Comparison`: Nodal output linearly interpolated onto every golden time point; golden times outside Nodal's range fail.
  - `regen-goldens.mjs`: `tran` kind, real plot, first vector `time` (kept as `time`), header records `method`.
  - Circuits (golden-run options plus `method`), each with one `tran` analysis:

| ID | Circuit |
|---|---|
| T1 | Task 7 RC, `tran 1e-5 5e-3` |
| T2 | Task 7 RLC, `tran 1e-6 2e-3` |
| T3 | V1 `sin(0, 10, 50)`; D1 in→out (`IS 1e-14, RS 0.1, CJO 10p, TT 1e-9`); R 1 kΩ and C 100 µF out→0; `tran 1e-5 6e-2` |
| T4 | VDD 5; Vin `pulse(0 5 1e-9 1e-9 1e-9 2e-8 4e-8)`; NMOS `VTO 1 KP 1e-4 CGSO 1e-10 CGDO 1e-10`, PMOS `VTO -1 KP 5e-5` same caps, `W 10u L 1u`; load 100 fF; `tran 1e-10 8e-8` |
| T5 | Vin PWL `(0,0) (1e-6,0) (1.01e-6,5) (5e-6,5) (5.01e-6,0) (1e-5,0)`; Rb 10 kΩ; NPN `BF 100 TF 3e-10 TR 1e-8 CJE 2e-12 CJC 1e-12`; Rc 1 kΩ to VCC 5; `tran 1e-8 1e-5` |
| T6 | Vctl PWL triangle `(0,0) (1e-3,5) (2e-3,0) (3e-3,5) (4e-3,0)`; S1 out→0, `VT 2.5 VH 0.5 RON 1 ROFF 1e6`; V2 5 V → 1 kΩ → out; C 1 µF out→0; `tran 1e-5 4e-3` |

- [ ] **Step 1: Write the failing tests:** `validate/tran.rs`: `compare_tran_passes_with_interpolation`, `compare_tran_constant_signal_uses_floor`, `compare_tran_out_of_range_fails`, `compare_tran_failure_names_signal_and_time`; `regen-goldens.test.mjs`: `mapSignals` keeps `time` for tran, rejects a tran plot not starting with `time`.
- [ ] **Step 2:** `cargo test --workspace && node --test "validation/scripts/*.test.mjs"`. Expected: FAIL.
- [ ] **Step 3:** Implement. Install ngspice (`apt-get update && apt-get install -y ngspice`), write the twelve circuits, run `node validation/scripts/regen-goldens.mjs T1-trap … T6-gear`. VALIDATION §3: add the floor citing ADR 0011; §4: T IDs map to `-trap`/`-gear` files.
- [ ] **Step 4:** `cargo run -p nodal-cli -- validate validation`. Expected: all rows pass, T1–T6 for both methods. A failing row is a bug until shown otherwise: find which side is wrong and record why. Never loosen a tolerance or regenerate to pass.
- [ ] **Step 5:** Commit `test(validation): transient comparator and T1–T6 goldens (trap and gear)`, body naming ngspice-42 and the reason for new goldens.

### Task 11: Close M4

**Files:** Modify `README.md`, `docs/ROADMAP.md`, `docs/VALIDATION.md` (accuracy rule paragraph), `docs/reference/numerical-methods.md` (§3 as built, any deviation found), the project's session notes (outside the repo).

- [ ] **Step 1:** Push; wait for CI green on `main`. Record the run URL, the rust job URL and the `validation-report` artifact URL showing T1–T6 for both methods.
- [ ] **Step 2:** ROADMAP M4 → done with that evidence; README describes the transient engine as tested; VALIDATION's opening rule cites the run. Humanizer on all prose.
- [ ] **Step 3:** `cargo test --workspace && pnpm test && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 4:** Commit `docs: close M4`; push.
