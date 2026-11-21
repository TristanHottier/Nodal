# Validation

How Nodal proves its numbers are right. Policy: [ADR 0008](adr/0008-ngspice-golden-validation.md).

**Rule:** a document in this repo may claim an accuracy only if a test in CI demonstrates it. L1–L3 and L5 match ngspice within the §3 op tolerance, and L1–L4 match their closed-form values; both are checked in the [rust CI job](https://github.com/TristanHottier/Nodal/actions/runs/43115456912/job/130842158355). N1–N6 match ngspice within the §3 tolerances, and the Jacobian tests of §5 pass for the diode, BJT, MOSFET and switch; both are checked in the [rust CI job](https://github.com/TristanHottier/Nodal/actions/runs/43156593522/job/130977856325). A1–A6 match ngspice within the §3 AC tolerances, A1 and A2 also match their closed-form responses, and the diode and BJT capacitances match finite differences of their charges; all are checked in the [rust CI job](https://github.com/TristanHottier/Nodal/actions/runs/44826285994/job/136599600321). T1–T6 match ngspice within the §3 transient tolerance, for both `trap` and `gear`; this is checked by `nodal-cli validate` in the [rust CI job](https://github.com/TristanHottier/Nodal/actions/runs/44867024382/job/136732857420).

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
| Transient | every node voltage and voltage-source current; Nodal output linearly interpolated onto ngspice time points | — | 1e-3 × peak-to-peak of the reference signal, plus 1e-8 V · 1e-13 A (ADR 0011) |

Phase is not compared where $|x_{\text{ref}}| \le 10^{-12}$, because phase is undefined there.

Transient uses a range-normalized absolute bound because the two simulators choose different time points, so interpolation error is unavoidable. A constant signal has a peak-to-peak value of zero, so the op absolute tolerance is added to the bound ([ADR 0011](adr/0011-transient-absolute-floor.md)). A golden time point outside the time range of Nodal's output fails.

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
| L5 | Current source into a resistor network with an inductor (DC short) and a capacitor (DC open) | A, G |

### Nonlinear DC (M2)

| ID | Circuit | Check |
|---|---|---|
| N1 | Diode + resistor; DC sweep of the source −5 V to +5 V | G |
| N2 | NPN common-emitter, voltage-divider bias; operating point | G |
| N3 | NMOS output characteristic: Vds sweep at Vgs = 1, 2, 3 V, crossing triode/saturation. Three files: `N3-vgs1`, `N3-vgs2`, `N3-vgs3`. | G |
| N4 | CMOS inverter voltage transfer curve | G |
| N5 | Convergence stress: 10 series diodes driven from 100 V through 1 Ω | G |
| N6 | NMOS cascode with a 10 kΩ load; gate of the lower transistor swept 0 V to 3 V, so the middle node is reached only through an off transistor at first | G |

### AC (M3)

| ID | Circuit | Check |
|---|---|---|
| A1 | RC low-pass, 1 Hz–10 MHz | A, G |
| A2 | Series RLC band-pass (Q ≈ 10) | A, G |
| A3 | NPN common-emitter amplifier with coupling/bypass capacitors and junction capacitances | G |
| A4 | Inverting op-amp (VCVS macro, gain 1e6) with feedback RC | G |
| A5 | Forward-biased diode with series resistance and diffusion capacitance, and a reverse-biased diode with junction capacitance | G |
| A6 | NMOS and PMOS common-source stages with overlap capacitances | G |

### Transient (M4)

| ID | Circuit | Check |
|---|---|---|
| T1 | RC step response | A, G |
| T2 | Underdamped series RLC ringing | A, G |
| T3 | Half-wave rectifier with smoothing capacitor, sine drive | G |
| T4 | CMOS inverter with load capacitor, pulse drive | G |
| T5 | NPN saturating switch driven by PWL | G |
| T6 | Voltage-controlled switch with hysteresis, triangular PWL control, RC load | G |

Every transient circuit runs with `method=trap` and `method=gear`. Each ID therefore has two files, `<id>-trap` and `<id>-gear`, for example `T1-trap` and `T1-gear`, and two goldens, `<id>-trap.tran.csv` and `<id>-gear.tran.csv`. The golden header records the method.

T4 has a 1 kΩ gate resistor `RG` between the pulse source and the gates, and `tmax` = 1e-11 s. With an ideal pulse source driving the gate overlap capacitances, the source current is a true step at each pulse corner. Nodal and ngspice take slightly different first steps after a corner (1.51e-15 s and 1.32e-15 s), so a golden sample between the two is interpolated across the step and fails. The gate resistor makes the source current continuous. The smaller `tmax` keeps the interpolation error on the fast supply-current edge small; with the default `tmax`, the trap supply current reached 1.10 times the tolerance.

T6 uses `RON` = 100 Ω and `tmax` = 2e-7 s, not the defaults. ngspice-42 can switch a SW model early: `swload.c` reads the control voltage from the previous solution vector, which after a rejected trial step holds the rejected iterate. With the default `tmax`, the switch turned on at a control voltage of about 2.966 V, although `VT` + `VH` = 3.0 V. Nodal switches at the threshold. With `tmax` = 2e-7 s ngspice switches at 3.003 V, and `RON` = 100 Ω slows the on-edge to about 91 µs, so the remaining timing difference of under a microsecond stays inside the tolerance.

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
