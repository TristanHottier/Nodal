# Validation

How Nodal proves its numbers are right. Policy: [ADR 0008](adr/0008-ngspice-golden-validation.md).

**Rule:** a document in this repo may claim an accuracy only if a test in CI demonstrates it. L1–L3 match ngspice within the §3 op tolerance, and L1–L4 match their closed-form values; both are checked in the [rust CI job](https://github.com/TristanHottier/Nodal/actions/runs/43115456912/job/130842158355). N1–N5 match ngspice within the §3 tolerances, and the Jacobian tests of §5 pass for the diode, BJT, MOSFET and switch; both are checked in the [rust CI job](https://github.com/TristanHottier/Nodal/actions/runs/43127904416/job/130884551641).

## 1. Three kinds of check

| Check | Reference | Catches |
|---|---|---|
| **Analytic** | Closed-form solution computed in the test | Stamp errors, sign errors, integration-order errors |
| **Golden** | ngspice output committed in `validation/golden/` | Model-equation errors, convergence and step-control differences on realistic circuits |
| **Jacobian** | Central finite differences of the device's own current/charge functions | Wrong derivatives, which cause slow or failed Newton convergence without giving wrong answers on easy circuits |

## 2. How goldens are produced

1. Each reference circuit exists once, as netlist IR: `validation/circuits/<id>.json`.
2. `nodal-cli export-spice` writes the equivalent SPICE deck. The export is part of the engine and is itself tested.
3. `validation/scripts/regen-goldens.mjs` runs `ngspice -b` on the deck and writes `validation/golden/<id>.<analysis>.csv`.
4. Each golden starts with a comment header: circuit id, analysis, ngspice version, options, and generation date.
5. Goldens are committed. CI does not run ngspice, so results don't depend on the ngspice package of the CI image.

**Golden-run options.** Goldens are generated with tightened tolerances (`reltol=1e-6`, `vntol=1e-9`, `abstol=1e-15`, `chgtol=1e-18`), so the reference is close to the exact solution of the model equations. Nodal runs the suite with the same options. Comparisons therefore measure model and algorithm differences. They don't measure the gap between two solvers that each stop at a loose tolerance.

**Changing a golden.** Regenerate only with a commit message that explains why: a circuit change, an ngspice version bump, or a documented ngspice behaviour Nodal intentionally does not copy. Never regenerate to make a failing comparison pass without that explanation.

## 3. Comparison and tolerances

For every compared signal, a sample passes if $|x - x_{\text{ref}}| \le r\,|x_{\text{ref}}| + a$.

| Analysis | Compared on | $r$ | $a$ |
|---|---|---|---|
| OP, DC sweep | every node voltage and voltage-source current, every sweep point | 1e-5 | 1e-8 V · 1e-13 A |
| AC | magnitude at every frequency point | 1e-4 | 1e-12 (linear units) |
| AC | phase at every frequency point | — | 0.01° |
| Transient | Nodal output linearly interpolated onto ngspice time points | — | 1e-3 × signal peak-to-peak |

Transient uses a range-normalized absolute bound because the two simulators choose different time points, so interpolation error is unavoidable.

These are initial values. Each will be tightened to roughly 10× the worst error seen once the suite runs. Loosening one requires an ADR.

## 4. Reference circuits (v1)

Circuit IDs are referenced by the roadmap's exit criteria. "A" in the Check column means analytic, "G" means golden.

### Linear DC (M1)

| ID | Circuit | Check |
|---|---|---|
| L1 | Resistive divider | A, G |
| L2 | Unbalanced Wheatstone bridge | A, G |
| L3 | One instance of each controlled source (VCVS, VCCS, CCVS, CCCS) in a resistive network | A, G |
| L4 | 8-bit R-2R ladder DAC, all 256 codes | A |

### Nonlinear DC (M2)

| ID | Circuit | Check |
|---|---|---|
| N1 | Diode + resistor; DC sweep of the source −5 V to +5 V | G |
| N2 | NPN common-emitter, voltage-divider bias; operating point | G |
| N3 | NMOS output characteristic: Vds sweep at Vgs = 1, 2, 3 V, crossing triode/saturation. Three files: `N3-vgs1`, `N3-vgs2`, `N3-vgs3`. | G |
| N4 | CMOS inverter voltage transfer curve | G |
| N5 | Convergence stress: 10 series diodes driven from 100 V through 1 Ω | G |

### AC (M3)

| ID | Circuit | Check |
|---|---|---|
| A1 | RC low-pass, 1 Hz–10 MHz | A, G |
| A2 | Series RLC band-pass (Q ≈ 10) | A, G |
| A3 | NPN common-emitter amplifier with coupling/bypass capacitors and junction capacitances | G |
| A4 | Inverting op-amp (VCVS macro, gain 1e6) with feedback RC | G |

### Transient (M4)

| ID | Circuit | Check |
|---|---|---|
| T1 | RC step response | A, G |
| T2 | Underdamped series RLC ringing | A, G |
| T3 | Half-wave rectifier with smoothing capacitor, sine drive | G |
| T4 | CMOS inverter with load capacitor, pulse drive | G |
| T5 | NPN saturating switch driven by PWL | G |
| T6 | Voltage-controlled switch with hysteresis, triangular PWL control, RC load | G |

Every transient circuit runs with `method=trap` and `method=gear`.

## 5. Jacobian tests

For each nonlinear device, in each operating region (diode: reverse, weak and strong forward; BJT: cutoff, active, saturation, reverse; MOSFET: cutoff, triode, saturation, for $V_{ds} < 0$ too):

- Evaluate the analytic conductances at a bias point.
- Compare them with central differences of the device current, step $h = 10^{-6}\,\text{V}$ (scaled by $V_t$ for junctions).
- Pass if the relative error is ≤ 1e-5, or the absolute error is ≤ 1e-15 S when the conductance is near zero.

The step is 1e-6 V (1e-6·Vt for junction voltages). A test may use a larger step, up to 1e-3·Vt, when a conductance near gmin would otherwise be lost in rounding; the 1e-5 and 1e-15 S pass criteria are unchanged.

## 6. What CI runs

- `cargo test`: device unit tests, Jacobian tests, analytic circuits.
- `nodal-cli validate validation/`: all golden comparisons. Prints a table of worst error per circuit and analysis, and exits non-zero on any failure.
- The worst-error table is uploaded as a CI artifact, so tolerance tightening can be based on data.
