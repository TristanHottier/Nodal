# M3 AC Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nodal-cli run` performs AC small-signal analysis with linear, decade and octave sweeps. Every device has a small-signal model, junction and overlap capacitances included, and circuits A1–A4 match committed ngspice goldens in magnitude and phase in CI.

**Architecture:** AC reuses the DC machinery. After the operating point, every device is loaded once more in a new `LoadMode::SmallSignal` (ngspice `MODEINITSMSIG`); the resulting real Jacobian is $G$. A new trait method `load_reactive` stamps $\partial Q/\partial v$ (and $-L$ for inductor branches) into a second real matrix $C$. Sources stamp phasors into a complex excitation vector. Per frequency the engine factors $G + j\omega C$ with the dense LU, now generic over `f64` and `faer::c64` (ADR 0003). Device charge functions $Q(V)$ are written now, so capacitances are tested as finite differences of charge and M4 can reuse them.

**Tech Stack:** unchanged from M2 (Rust 1.97.0, serde, faer 0.24, clap 4; TypeScript 6, Zod 4, Vitest; ngspice-42 for golden regeneration only).

**Spec:** [`docs/ROADMAP.md`](../ROADMAP.md) §M3; [`docs/reference/numerical-methods.md`](../reference/numerical-methods.md) §4–5; [`docs/reference/mna.md`](../reference/mna.md) §3–4; [`docs/reference/devices.md`](../reference/devices.md) §1–5; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §3, §4.2–4.3; [`docs/VALIDATION.md`](../VALIDATION.md) §3–5; [ADR 0003](../adr/0003-linear-solver.md); the "Deferred from M2" list in the project's session notes, reproduced in Tasks 1, 3 and 9.

## Global Constraints

- Everything in `AGENTS.md` and in the M1/M2 plans' Global Constraints still applies (no I/O in the engine, no `unwrap`/`expect`/`panic!` in library code, SI f64, English, sorted name lists in errors, commit identity and no AI trailers, humanizer on prose, uppercase model keys, `temp` = 27).
- No new dependencies. Complex numbers are `faer::c64` (= `num_complex::Complex<f64>`), re-exported as `crate::linalg::C64`.
- `irVersion` stays 1; every IR change is additive.
- Phases are in degrees everywhere: IR `ac.phase`, goldens' derived phase, comparator, as in SPICE.
- Every ported ngspice routine cites its source file in a comment: `acan.c` (frequency grid), `vsrcacld.c`, `isrcacld.c`, `indacld.c`, `dioload.c`/`dioacld.c`, `bjtload.c`/`bjtacld.c`, `mos1load.c`/`mos1acld.c`.
- Small-signal evaluation point, as ngspice `MODEINITSMSIG`: diode and BJT evaluate at the junction voltages stored in their state by the last Newton load (`dioload.c`, `bjtload.c` read `CKTstate0`); the MOSFET reads voltages from the converged `x` and limits them against state (`mos1load.c` general iteration); the switch keeps its stored on/off state. `SmallSignal` never writes state.
- AC tolerances are VALIDATION §3: magnitude $r$ = 1e-4, $a$ = 1e-12; phase 0.01° after wrapping the difference into (−180°, 180°]. Frequencies of golden and result must agree within $10^{-9}\max(1, |f|)$. No tolerance changes.
- Out of scope: transient, noise, distortion, the wasm `run` entry point, AC in the web app, the MOSFET bulk junction diode current (M2 backlog item 7: it changes DC results and needs its own decision; see the handoff note in Task 11).

## Review Focus

1. **Frequency grids that don't land on `fstop`.** `dec` over less than one decade, `fstart = fstop`, and `oct` must give exactly the points of ngspice's `acan.c`. Pinned by `ac_frequencies_*` (Task 2).
2. **`lin` with 2 points.** ngspice returns one point (its `ACnumberSteps - 1 > 1` test); Nodal returns `[fstart, fstop]` and documents the deviation in numerical-methods §5. Pinned by `ac_frequencies_lin_two_points` (Task 2).
3. **Nodes with no AC response** (a supply node fed only by a DC source). Nodal must report exactly 0, and the comparator must not compare a phase where $|x_{ref}| \le 10^{-12}$ (phase undefined). Pinned by `supply_node_has_zero_response` (Task 5) and `compare_ac_skips_phase_below_floor` (Task 9).
4. **AC current source with a non-zero phase.** Its phasor must follow the DC current-source orientation (`b[n+] -= I`, `b[n-] += I`). Pinned by `current_source_ac_phase` (Task 5).
5. **PNP and PMOS small-signal signs.** Capacitances and transcapacitances keep their sign under the polarity flip, like conductances. Pinned by `pnp_small_signal_mirrors_npn` (Task 7) and `pmos_small_signal_mirrors_nmos` (Task 8).

---

### Task 1: M2 backlog in the engine

**Files:** Modify `crates/nodal-engine/src/analysis/{dc,newton}.rs`, `src/ir/{mod,models,validate}.rs`, `src/devices/{bjt,diode,mod}.rs`, `src/circuit/topology.rs`, `tests/nonlinear_op.rs`.

**Interfaces:**
- Produces:
  - `models::param(model, key) -> Result<f64, Error>`: `Error::Internal("unknown parameter <KEY> for model type <T>")` for a key not in `param_spec`; every caller propagates it.
  - `diode::junction(v: f64, is: f64, nvt: f64) -> (f64, f64)`, `pub(crate)`: the two-region current and conductance of devices.md §1 without gmin. `diode::eval` and the BJT both use it; `bjt::junction` is deleted.
  - `Element::dc_edges` destructures the node arrays instead of indexing them.
  - Source stepping that exits on `MAX_SOURCE_STEPS` reports the last attempted update in `NoConvergence.updates`, not zeros.

- [ ] **Step 1: Write the failing tests.**
  - `dc.rs`: `warm_failure_runs_cold_chain`. Use N5's 10-diode string with `dc V1 0 1e4 1e4` (two points). Assert through `Trace` that plain warm Newton failed at point 1, that the full chain then ran, and that point 1 equals a cold `solve_op` at 1e4 V within the op tolerance. If warm Newton converges, try `dc V1 0 1e5 1e5`, then the N6 cascode with `dc VG 0 3 3`. If none fails warm, stop and report: don't fake it with `plain_allowed`.
  - `newton.rs`: `source_stepping_exhaustion_reports_updates` (the `NeverConverges` circuit under `Strategy::SourceOnly`: every reported update is non-zero) and `kcl_residuals_are_numeric`: V1 a 0 1; R1 a b 1k; `NeverConverges` from b to 0 stamping a fixed 1 mA. Run `All`; the residual reported for `b` equals the hand value $|A(x)x - b(x)|_b$ at the reported last iterate, recomputed in the test, within 1e-12 relative.
  - `models.rs`: `unknown_param_is_internal_error`.
  - `tests/nonlinear_op.rs`: `nmos_reverse_conduction` additionally checks the value: with `VTO 0.7, KP 1e-4`, W/L = 10, gate 3 V, drain −0.5 V, source 0, bulk 0, `I(VD)` equals the swapped-terminal Level 1 current from devices.md §3 computed in the test, op tolerance.
- [ ] **Step 2:** `cargo test --workspace`. Expected: the new tests fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check && cargo run -p nodal-cli -- validate validation`. Expected: PASS, all M2 rows still pass.
- [ ] **Step 5:** Commit `fix(engine): M2 review backlog (warm-sweep fallback test, residual report, param lookup, shared junction)`.

### Task 2: IR for AC sources and the `ac` analysis (Rust + export)

**Files:** Modify `crates/nodal-engine/src/ir/{mod,validate}.rs`, `src/export/spice.rs`, `src/lib.rs` (match arm returns `Error::Invalid("ac analysis is not simulated yet")` until Task 5), `tests/ir_fixtures.rs`. Create fixtures `packages/schema/fixtures/ir/valid/ac.json` and the invalid ones below.

**Interfaces:**
- Produces:
  - `pub struct AcSpec { pub mag: f64, #[serde(default)] pub phase: f64 }` (degrees); `Element::V` and `Element::I` gain `#[serde(default, skip_serializing_if = "Option::is_none")] ac: Option<AcSpec>`.
  - `Analysis::Ac { sweep: AcSweep, points: u32, fstart: f64, fstop: f64 }`, JSON `{"type":"ac","sweep":"dec","points":10,"fstart":1,"fstop":1e7}`; `pub enum AcSweep { Lin, Dec, Oct }`, serialized lowercase.
  - `pub fn ac_frequencies(sweep: AcSweep, points: u32, fstart: f64, fstop: f64, reltol: f64, limit: usize) -> Option<Vec<f64>>` (`None` when more than `limit` points). Port of `acan.c`:
    - `Dec`: if `fstop / 10 < fstart`: $\delta = 1$ when `fstart == fstop`, else $\delta = e^{\ln 10/n}$. Otherwise $\delta = e^{\ln(f_{stop}/f_{start})/m}$ with $m = \lfloor |\log_{10}(f_{stop}/f_{start})|\, n\rfloor$.
    - `Oct`: $\delta = e^{\ln 2/n}$.
    - Both: tolerance $\delta\, f_{stop}\, \text{reltol}$; `f = fstart`; push while `f <= fstop + tol`; stop after the first point when $\delta = 1$; else `f *= δ`.
    - `Lin`: `points` values `fstart + i·(fstop − fstart)/(points − 1)`, or `[fstart]` when `points == 1` (deviation for `points == 2`, see Review Focus 2).
  - `pub const MAX_AC_POINTS: usize = 1_000_000`.
- Validation rules (messages quote the element or analysis):

| # | Rule |
|---|---|
| V16 | `ac.mag` and `ac.phase` finite |
| V17 | `ac`: `fstart`, `fstop` finite; `points ≥ 1`; `fstop ≥ fstart`; `fstart > 0` for `dec`/`oct`, `≥ 0` for `lin`; `lin` with `points == 1` needs `fstart == fstop`; `ac_frequencies(…, options reltol, MAX_AC_POINTS)` is `Some` |

- Invalid fixtures, one rule each, added to `NEEDLES`: `ac-mag-infinite`, `ac-dec-zero-fstart`, `ac-fstop-below-fstart`, `ac-zero-points`, `ac-lin-one-point-range`, `ac-too-many-points` (`dec`, 200000 points, 1 to 1e9), `ac-unknown-sweep` (`"sweep":"log"`).
- Export: `V1 in 0 DC 0e0 AC 1e0 0e0` (the `AC` part only when `ac` is set; same for I); `.ac dec 10 1e0 1e7`.

- [ ] **Step 1: Write the failing tests.** Fixtures through `valid_fixtures_parse` / `each_invalid_fixture_breaks_its_own_rule`; `spice.rs::deck_for_ac` (exact deck for `valid/ac.json`: V with `ac {mag 1, phase 0}`, I with `ac {mag 1e-3, phase 90}`, an R, a C, analysis `ac dec 10 1 1e7`). In `ir/mod.rs`: `ac_frequencies_dec_whole_decades` (1 to 1e7, 10/decade: 71 points, last within 1e-12 relative of 1e7), `ac_frequencies_dec_partial_decade_count` (1 to 5e6, 10: $m$ = 66, 67 points, last ≈ 5e6), `ac_frequencies_dec_less_than_decade` (100 to 500, 10: $\delta = 10^{0.1}$, points up to ≤ 500 + tol, count computed in the test), `ac_frequencies_dec_single` (1e3 to 1e3: `[1e3]`), `ac_frequencies_oct` (1 to 16, 4/octave: 17 points), `ac_frequencies_lin` (0 to 100, 11: steps of 10), `ac_frequencies_lin_two_points` (`[1, 2]`), `ac_frequencies_limit` (returns `None` above the limit).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): IR for AC sources and the ac analysis`.

### Task 3: Same IR in `@nodal/schema`, plus the M2 TS backlog

**Files:** Modify `packages/schema/src/{ir,ir.test,models}.ts`, `crates/nodal-engine/src/ir/models.rs` (test only), `package.json` (script); create `packages/schema/src/ac.ts`.

**Interfaces:**
- Consumes: Task 2's fixtures, rules and `ac_frequencies`.
- Produces: `netlistSchema` accepting `ac` on V/I and the `ac` analysis; exported types `AcSpec`, `AcSweep`, `AcAnalysis`; `acFrequencyCount(sweep, points, fstart, fstop, reltol, limit): number | null` in `ac.ts`, the same loop as Rust, used by V17.
- `models::tests::spec_matches_ts` writes `packages/schema/fixtures/param-specs.json` instead of comparing when `NODAL_REGEN_PARAM_SPECS=1`; root script `"regen:param-specs": "NODAL_REGEN_PARAM_SPECS=1 cargo test -p nodal-engine spec_matches_ts"`.

- [ ] **Step 1: Write the failing tests** in `ir.test.ts`: needles for the seven new invalid fixtures; `acFrequencyCount` cases equal to the Rust `ac_frequencies_*` counts (71, 67, the partial-decade count, 1, 17, 11, 2, `null`). M2 backlog: `dc sweep boundaries`: `step` landing on `stop` within the 1e-9 rule passes (`0, 1, 0.1`), just outside fails (`0, 1, 0.1000001`), `round(k) + 1 = 1_000_000` passes and `1_000_001` fails.
- [ ] **Step 2:** `pnpm --filter @nodal/schema test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm regen:param-specs && git diff --exit-code packages/schema/fixtures/param-specs.json`. Expected: PASS, no diff.
- [ ] **Step 5:** Commit `feat(schema): AC sources and the ac analysis; sweep boundary tests, param-specs regen script`.

### Task 4: Linear solver over real and complex scalars

**Files:** Modify `crates/nodal-engine/src/linalg/{mod,dense}.rs`, `src/mna/mod.rs`, callers in `src/analysis/newton.rs` (type annotations only).

**Interfaces:**
- Produces:
  - `pub use faer::c64 as C64;`
  - `pub trait Scalar: Copy + faer::traits::ComplexField + sealed::Sealed { fn modulus(self) -> f64; fn is_finite(self) -> bool; }` implemented for `f64` and `C64` only. Use whatever extra faer bound `PartialPivLu<T>` needs; don't widen the trait to other types.
  - `DenseMatrix<T: Scalar = f64>`, `DenseLu<T: Scalar = f64>`, `LinearSolver<T: Scalar = f64>` with the same methods. The tiny-pivot rule of numerical-methods §4 uses `modulus` for both. Existing real code compiles unchanged through the defaults.
  - `mna::AcExcitation { pub b: Vec<C64>, pub out_of_range: Option<usize> }` with `new(n)` and `add(row: Option<usize>, v: C64)`.
  - `mna::assemble_ac(g: &DenseMatrix, c: &DenseMatrix, omega: f64) -> DenseMatrix<C64>`: entry $(r,c) = G_{rc} + j\omega C_{rc}$.

- [ ] **Step 1: Write the failing tests** in `dense.rs`: `complex_solves_2x2` (`[[1+j, 2], [3, 4-j]] x = [1, j]`, solution computed by hand with Cramer's rule in the test, within 1e-15 relative), `complex_singular_pivot` (rank-deficient complex matrix gives `SingularPivot { index: 1 }`), `complex_non_finite_is_singular`; in `mna/mod.rs`: `assemble_ac_combines` and `ac_excitation_out_of_range`. All existing real tests stay as they are.
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. Update the `linalg/mod.rs` doc comment (the trait is generic now).
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check && NODAL_WASM_NO_OPT=1 pnpm build:wasm`. Expected: PASS (the wasm build proves the complex LU builds for wasm32).
- [ ] **Step 5:** Commit `feat(engine): dense LU over real and complex scalars`.

### Task 5: AC analysis with linear devices, CLI output

**Files:** Create `crates/nodal-engine/src/analysis/ac.rs`, `crates/nodal-engine/tests/ac.rs`; modify `src/devices/{mod,capacitor,inductor,vsource,isource,switch}.rs` and the other device files (match arm for the new mode only), `src/analysis/{mod,op}.rs`, `src/error.rs`, `src/lib.rs`, `crates/nodal-cli/src/main.rs`, `crates/nodal-cli/tests/cli.rs`, `docs/reference/{mna,numerical-methods}.md`, `docs/ARCHITECTURE.md` §4.2.

**Interfaces:**
- Consumes: Task 2 (`Analysis::Ac`, `ac_frequencies`), Task 4 (`C64`, `DenseLu<C64>`, `AcExcitation`, `assemble_ac`).
- Produces:
  - `LoadMode::SmallSignal` (semantics in Global Constraints). In this task: linear devices stamp as always; the switch stamps the resistance of its stored state.
  - Trait methods with no-op defaults:
    ```rust
    /// Stamps dQ/dv (and -L on an inductor branch row) into `c.a`. Never touches `c.b`.
    fn load_reactive(&self, x: &[f64], state: &[f64], ctx: &LoadContext, c: &mut RealSystem) {}
    /// Stamps the AC phasor of an independent source.
    fn load_ac_excitation(&self, b: &mut AcExcitation) {}
    ```
    Capacitor: $C$ in the resistor pattern. Inductor: $C_{kk} \mathrel{+}= -L$ (`indacld.c`). V: `b[k] += mag·e^{jφ}` (`vsrcacld.c`). I: `b[n+] -= I`, `b[n-] += I` (`isrcacld.c`), with $\varphi$ in degrees.
  - `op.rs`: `pub(crate) fn solve_op_with_state(circuit) -> Result<(Vec<f64>, Vec<f64>), Error>` (x and the device state after convergence); `solve_op` uses it.
  - `ac.rs`: `pub fn solve_ac(circuit: &Circuit, frequencies: &[f64]) -> Result<AcResult, Error>`. Operating point; one load of every device in `SmallSignal` (on a copy of the state) into `G`; `load_reactive` into `C`; excitation; any `out_of_range` → `Error::Internal`. Then per frequency `assemble_ac`, factor, solve.
  - `AcResult { frequencies: Vec<f64>, node_voltages: BTreeMap<String, ComplexSeries>, branch_currents: BTreeMap<String, ComplexSeries> }`, `ComplexSeries { re: Vec<f64>, im: Vec<f64> }`; JSON `{"type":"ac","frequencies":[…],"nodeVoltages":{"out":{"re":[…],"im":[…]}},"branchCurrents":{…}}`. Internal nodes are never reported.
  - `Error::AcPoint { frequency: f64, cause: Box<Error> }`, displayed `ac analysis failed at <f:e> Hz: <cause>`; a singular pivot names its unknown as in DC.

- [ ] **Step 1: Write the failing tests** in `tests/ac.rs`, each comparing every point against a closed form with the VALIDATION §3 AC tolerances (a shared helper `assert_ac(result, signal, expected: impl Fn(f64) -> C64)` checks magnitude and wrapped phase):
  - `rc_lowpass_analytic` (A1's circuit: V1 in 0 AC 1; R1 in out 1k; C1 out 0 1e-6; `dec 10 1 1e7`): $V_{out} = 1/(1 + j\omega RC)$; `I(V1)` $= -(1 - V_{out})/R$.
  - `series_rlc_bandpass_analytic` (A2's circuit: V1 in 0 AC 1; L1 in a 10e-3; C1 a out 1e-6; R1 out 0 10; `dec 100 100 1e4`): $V_{out} = R/(R + j\omega L + 1/(j\omega C))$; `I(L1)` too.
  - `current_source_ac_phase`: I1 0 a AC 1e-3 phase 90; R1 a 0 1k; `lin 3 1 3` → `V(a)` $= 1\,e^{j90°}$ V at each point.
  - `supply_node_has_zero_response`: V1 in 0 AC 1; R1 in out 1k; VCC vcc 0 DC 5; R2 vcc out 1k → `V(vcc)` re and im exactly 0.
  - `vcvs_and_inductor_ac`: an E source driving R–L, closed form computed in the test.
  - `switch_ac_uses_op_state`: switch on at the op → `RON` divider at every frequency.
  - CLI (`tests/cli.rs`): `run_ac_json` (shape of the JSON for the RC circuit, 71 frequencies).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. Docs: numerical-methods §5 gains the `acan.c` grid rules and the `lin`/2-point deviation; mna.md §4 gains "AC: $G$ is the Jacobian at the small-signal point, $C$ the charge Jacobian"; ARCHITECTURE §4.2 replaces the `load_ac` sketch with the two methods above.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check && cargo run -p nodal-cli -- validate validation`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine,cli): AC small-signal analysis with linear devices`.

### Task 6: Diode charge and small-signal model

**Files:** Modify `crates/nodal-engine/src/devices/diode.rs`, `tests/jacobian.rs`, `tests/ac.rs`, `docs/reference/devices.md` §1.

**Interfaces:**
- Produces: `DiodeParams` gains `cjo, vj, m, fc, tt`; `pub fn charge(vd: f64, p: &DiodeParams, gmin: f64) -> (f64 /* Q */, f64 /* C */)` from `dioload.c`: depletion charge and capacitance in both regions (split at `FC·VJ`), plus $T_T I_d$ and $T_T g_d$, where $I_d$ and $g_d$ include the gmin term as ngspice's `cd`, `gd` do. `load` in `SmallSignal` evaluates at the stored junction voltage; `load_reactive` stamps $C$ between the junction's anode side (the internal node when `RS > 0`) and the cathode.

- [ ] **Step 1: Write the failing tests.** In `tests/jacobian.rs`, $C$ against central differences of $Q$ (VALIDATION §5 criteria, h = 1e-6·VT), with `IS 1e-14, CJO 2e-12, VJ 0.7, M 0.4, FC 0.5, TT 1e-8`: `diode_charge_reverse` (−2 V), `diode_charge_below_fc` (0.2 V), `diode_charge_above_fc` (0.6 V), `diode_charge_strong_forward` (0.75 V); `diode_charge_continuous_at_fc` ($|ΔQ|$ and $|ΔC|$ across `FC·VJ` ± 1e-12 below 1e-20 and 1e-15·|C|). In `tests/ac.rs`: `diode_small_signal_analytic`: I1 0 a DC 1e-3; D1 a 0 (`IS 1e-14, CJO 2e-12, TT 1e-8`); I2 0 a AC 1e-6 → $V_a = I/(g_d + j\omega C)$ with $g_d$, $C$ from `eval`/`charge` at the op voltage; and `diode_rs_ac_matches_explicit_resistor` (RS 100 vs. a 100 Ω resistor plus RS 0: equal results within 1e-12 relative).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. devices.md §1: note that the diffusion terms include the gmin current and conductance, as in `dioload.c`.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): diode charge and small-signal model`.

### Task 7: BJT charges and small-signal model

**Files:** Modify `crates/nodal-engine/src/devices/bjt.rs`, `tests/jacobian.rs`, `tests/ac.rs`, `docs/reference/devices.md` §2.

**Interfaces:**
- Produces: `BjtParams` gains `cje, vje, mje, cjc, vjc, mjc, tf, tr, fc`; `pub fn charges(vbe: f64, vbc: f64, p: &BjtParams) -> BjtCharges` with `BjtCharges { qbe, qbc, cbe /* ∂Qbe/∂vbe */, cbe_vbc /* ∂Qbe/∂vbc, ngspice geqcb */, cbc /* ∂Qbc/∂vbc */ }`, NPN polarity. Ported from `bjtload.c` with `XTF = 0`: when `TF ≠ 0` and $V_{be} > 0$, the diffusion charge is $T_F I_F/q_b$, $C_{be}$ uses $g_{be}/q_b$ (`dqbdve` = 0 since `VAR` = ∞), and $\partial Q_{be}/\partial V_{bc} = -T_F I_F\, (\partial q_b/\partial V_{bc})/q_b^2$; otherwise the diffusion charge is $T_F I_F$ and the transcapacitance is 0. $I_F$, $g_{be}$ exclude gmin. $Q_{bc} = T_R I_R$ + depletion. Depletion terms use each junction's `CJ`, `VJ`, `MJ` and `FC`, as the diode. `load_reactive` stamps $C_{be}$ (b–e), $C_{bc}$ (b–c) and the transcapacitance in the `bjtacld.c` pattern (`xcmcb`: B'B' +, B'C' −, E'C' +, E'B' −). PNP: evaluate at the negated voltages; capacitances keep their sign.

- [ ] **Step 1: Write the failing tests.** FD of `qbe`, `qbc` against `cbe`, `cbe_vbc`, `cbc` (h = 1e-6·VT) with `IS 1e-16, BF 100, VAF 50, CJE 1e-12, CJC 5e-13, TF 3e-10, TR 1e-8`: `bjt_charge_active` (0.7, −3), `bjt_charge_saturation` (0.75, 0.6: above FC·VJ on both junctions), `bjt_charge_cutoff` (−0.5, −5), `bjt_charge_no_early` (VAF ∞: transcapacitance exactly 0). `pnp_small_signal_mirrors_npn`: `charges` at negated voltages equals the NPN values. In `tests/ac.rs`: `bjt_hybrid_pi_analytic`: Q1 biased by I1 0 b DC 10e-6, VC c 0 DC 5, VAF ∞, `TF 3e-10, CJE 1e-12, CJC 0`; AC 1e-9 into the base. $h_{ie}$-style closed form $i_c/i_b = g_m/(g_\pi + j\omega C_\pi)$ with $g_m$, $g_\pi$, $C_\pi$ taken from `eval`/`charges` at the stored op voltages; compare `I(VC)`.
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. devices.md §2 "Charges": correct to $T_F I_F/q_b$ for $V_{be} > 0$, add the transcapacitance and the `bjtload.c` condition.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): BJT charges and small-signal model`.

### Task 8: MOSFET overlap capacitances and small-signal model

**Files:** Modify `crates/nodal-engine/src/devices/mos1.rs`, `tests/ac.rs`, `docs/reference/devices.md` §3.

**Interfaces:**
- Produces: `Mos1Params` gains `cgso, cgdo, cgbo`. Constant overlap capacitances from `mos1load.c` with `LD = 0`: $C_{gs} = C_{GSO} W$, $C_{gd} = C_{GDO} W$, $C_{gb} = C_{GBO} L$ (per unit **length**, which devices.md currently gets wrong). They attach to the physical source and drain, whatever the operating mode. `SmallSignal` follows the Global Constraints (from `x`, limited against state, state untouched).

- [ ] **Step 1: Write the failing tests** in `tests/ac.rs`: `nmos_common_source_analytic`: VDD vdd 0 5; VG g 0 DC 1.5 AC 1; RD vdd d 10k; M1 d g 0 0 (`VTO 0.7, KP 1e-4, LAMBDA 0.02, CGSO 4e-10, CGDO 4e-10, CGBO 2e-10`), W 100e-6, L 1e-6. Closed form at each frequency from nodal equations at d with $g_m$, $g_{ds}$ from `eval` at the op, $C_{gd}$ the Miller path, and the gate driven ideally (so $C_{gs}$ and $C_{gb}$ only load VG): check `V(d)` and `I(VG)`. `pmos_small_signal_mirrors_nmos`: the mirrored circuit (VDD −5, VG DC −1.5 with the same AC 1, PMOS model with `VTO -0.7` and the same other parameters) has the same small-signal transfer, so its `V(d)` complex values equal the NMOS ones within 1e-12 relative. `overlap_caps_scale_with_w_and_l`: doubling W doubles $C_{gs}$, $C_{gd}$ and leaves $C_{gb}$; doubling L doubles $C_{gb}$ only (checked through `load_reactive` stamps).
- [ ] **Step 2:** `cargo test --workspace`. Expected: FAIL.
- [ ] **Step 3:** Implement. devices.md §3: `CGBO` is per unit length; the parameter table and the text say so.
- [ ] **Step 4:** `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): MOSFET overlap capacitances and small-signal model`.

### Task 9: AC goldens in the harness and the regen script

**Files:** Modify `crates/nodal-cli/src/validate.rs`, `validation/scripts/regen-goldens.mjs`, `docs/VALIDATION.md` §3.

**Interfaces:**
- Golden `validation/golden/<id>.ac.csv`: the comment header with `# analysis: ac`, then `frequency,V(out).re,V(out).im,I(V1).re,I(V1).im,…` and one row per frequency, values formatted as today.
- `validate`: `Kind::Ac`; `parse_ac_golden(text) -> Result<AcGolden, String>` (rejects a signal with only one of `.re`/`.im`); `compare_ac(golden: &AcGolden, result: &AcResult) -> Comparison`: point count, each frequency within $10^{-9}\max(1,|f|)$, magnitude $||x| - |x_{ref}|| \le 10^{-4}|x_{ref}| + 10^{-12}$, phase $|\mathrm{wrap}(\angle x - \angle x_{ref})| \le 0.01°$ only where $|x_{ref}| > 10^{-12}$. The row's ratio is the worst of magnitude and phase over all points. `validate_dir` also finds `*.ac.csv`.
- Regen script: `parseRaw` accepts `Flags: complex` (values `re,im`; the scale vector `frequency` has im 0 and becomes `frequency`); `ac` analysis supported; before writing `<id>.<kind>.csv`, fail if `<id>.<other kind>.csv` exists (M2 backlog item 6), naming the stale file.
- VALIDATION §3: one line under the table saying phase is not compared where $|x_{ref}| \le 10^{-12}$, because phase is undefined there. This is the first AC comparator, so no existing tolerance changes. Tristan confirmed it on 2026-11-20.

- [ ] **Step 1: Write the failing tests** in `validate.rs`: `parse_ac_golden`, `parse_ac_golden_rejects_half_signal`, `compare_ac_passes`, `compare_ac_phase_wraps` (179.999° vs −179.999° passes), `compare_ac_phase_failure`, `compare_ac_magnitude_failure`, `compare_ac_skips_phase_below_floor`, `compare_ac_frequency_mismatch_fails`. For the script: `node --test validation/scripts/regen-goldens.test.mjs` with `parseRaw` on a two-point complex rawfile literal and `mapSignals` for `ac` (create the test file; add it to the root `test` script).
- [ ] **Step 2:** `cargo test -p nodal-cli && node --test "validation/scripts/*.test.mjs"`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cargo test --workspace && cargo run -p nodal-cli -- validate validation && node --test validation/scripts/ && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `test(validation): ac goldens, complex rawfiles, stale-golden check`.

### Task 10: Reference circuits A1–A6 and their goldens

**Files:** Create `validation/circuits/A{1..6}.json` and `validation/golden/A{1..6}.ac.csv`; modify `docs/VALIDATION.md` §4 (add A5, A6 rows, check G).

Circuits (every file carries the golden-run options; sources have `ac {mag 1, phase 0}` unless stated):
- **A1:** as `rc_lowpass_analytic`; `dec 10 1 1e7`.
- **A2:** as `series_rlc_bandpass_analytic`; `dec 100 100 1e4`.
- **A3:** VCC vcc 0 DC 12; VS s 0 AC 1; RS s in 1k; CIN in b 10e-6; R1 vcc b 47k; R2 b 0 10k; RC vcc c 4.7k; RE e 0 1k; CE e 0 100e-6; COUT c out 10e-6; RL out 0 10k; Q1 c b e `QMOD NPN (IS=1e-15, BF=200, VAF=100, CJE=10e-12, VJE=0.75, MJE=0.33, CJC=5e-12, VJC=0.75, MJC=0.33, TF=3e-10, TR=1e-8)`; `dec 10 10 1e9`.
- **A4:** VS in 0 AC 1; RIN in inm 1k; RF inm out 10k; CF inm out 1e-9; E1 out 0 0 inm 1e6; RL out 0 10k; `dec 10 1 1e8`.
- **A5:** V1 in 0 DC 5 AC 1; R1 in a 10k; D1 a 0 `DF (IS=1e-14, RS=10, CJO=2e-12, VJ=0.7, M=0.4, TT=1e-8)`; R2 in b 10k; D2 0 b `DR (IS=1e-14, CJO=5e-12, VJ=0.7, M=0.5)` (reverse biased); `dec 10 1e3 1e10`.
- **A6:** VDD vdd 0 5; VG g 0 DC 1.5 AC 1; RD vdd d 10k; M1 d g 0 0 `NMOD (VTO=0.7, KP=1e-4, LAMBDA=0.02, CGSO=4e-10, CGDO=4e-10, CGBO=2e-10)`, W 100e-6, L 1e-6; RD2 d2 0 10k; M2 d2 g vdd vdd `PMOD PMOS (VTO=-0.7, KP=5e-5, LAMBDA=0.02, CGSO=4e-10, CGDO=4e-10, CGBO=2e-10)`, W 200e-6, L 1e-6; `dec 10 1e3 1e11`.

- [ ] **Step 1:** Write the circuit files; `apt-get install ngspice`; `node validation/scripts/regen-goldens.mjs A1 A2 A3 A4 A5 A6`.
- [ ] **Step 2:** `cargo run -p nodal-cli -- validate validation`. Expected: every row passes. A failing row is a bug until shown otherwise (AGENTS.md). Check first the small-signal evaluation point and the BJT `TF/q_b` condition against the ngspice sources; record any documented deviation in the commit body. No tolerance changes.
- [ ] **Step 3:** Add `a1_matches_closed_form` and `a2_matches_closed_form` to `tests/ac.rs`, loading the committed circuit files, so A1 and A2 have their analytic check (VALIDATION §4 "A, G").
- [ ] **Step 4:** `cargo test --workspace && pnpm test` (both parse the new circuits).
- [ ] **Step 5:** Commit `test(validation): reference circuits A1-A6 with ngspice goldens`.

### Task 11: Close M3

**Files:** `docs/ROADMAP.md`, `README.md`, `docs/VALIDATION.md` (rule line names the A circuits checked in CI), `docs/ARCHITECTURE.md` §4.2–4.3 if out of date.

- [ ] **Step 1:** Push; wait for a green CI run. Record its URL, the rust job URL and the `validation-report` artifact URL.
- [ ] **Step 2:** Update the M3 roadmap entry to **done** with that evidence, as M2 did. README status: what M3 adds, only as far as the tests show.
- [ ] **Step 3:** Humanize the prose; `pnpm format:check`.
- [ ] **Step 4:** Commit `docs: close M3`, push, confirm green.
- [ ] **Step 5:** Final whole-milestone review on Opus. Report to Tristan that M2 backlog item 7 (MOSFET bulk diode current) is still open; he decides whether it goes to M4 or post-v1.
