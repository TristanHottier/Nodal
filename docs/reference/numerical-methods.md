# Numerical methods

How `nodal-engine` solves the systems assembled from [mna.md](mna.md). Option names and defaults are in [ARCHITECTURE.md](../ARCHITECTURE.md) §4.4. Where this page says "as ngspice", the source file is cited, and the behaviour is ported exactly.

## 1. Nonlinear solve: Newton–Raphson

### 1.1 Iteration

Each iteration stamps every device's linearized companion model at $x^{(k)}$ and solves the linear system directly for the next iterate:

$$
A(x^{(k)})\, x^{(k+1)} = b(x^{(k)})
$$

This is Newton–Raphson written in companion form, as SPICE does it. It is equivalent to $J\,\Delta x = -F$, but the stamps stay in the same shape as the linear case.

After each solve, devices apply voltage limiting (pnjlim, fetlim; see [devices.md](devices.md)) to $x^{(k+1)}$ before the next load.

### 1.2 Convergence test (SPICE style)

Iteration $k+1$ converges when **both** tests hold.

1. Every unknown has settled:

$$
|x_j^{(k+1)} - x_j^{(k)}| \le \text{reltol}\cdot\max\!\left(|x_j^{(k+1)}|, |x_j^{(k)}|\right) + \text{tol}_j
$$

with $\text{tol}_j$ = `vntol` for node voltages and `abstol` for branch currents.

2. Every nonlinear device's current predicted by the linearization agrees with its current recomputed at the new voltages, within $\text{reltol}\cdot\max(|I_{pred}|, |I_{new}|) + \text{abstol}$.

In addition, no device may have applied limiting during this iteration.

### 1.3 Iteration limits

- DC: `itl1` (100) iterations, then fall back (§1.4).
- Transient: `itl4` (10) iterations per time point. If it fails, cut the step by 8 and retry.

### 1.4 DC fallbacks, tried in order

1. **Plain Newton** from $x = 0$, or from the user's nodeset.
2. **gmin stepping:** add a large conductance (start at $10^{-2}$ S) from every node to ground. Solve, then divide it by 10, reusing the previous solution as the starting point, until it reaches `gmin`. If a step fails, backtrack with a smaller factor.
3. **Source stepping:** scale all independent sources by $\alpha$, ramping $\alpha$ from 0 to 1. Solve at each $\alpha$ from the previous solution; shrink the $\alpha$ increment on failure.

If all three fail, report non-convergence. Name the five unknowns with the largest last Newton update, and the five nodes with the largest KCL residual.

## 2. Time integration

### 2.1 Integration formulas for $\dot q = f$

For a charge (capacitor) or flux (inductor) state $q$ with current $i = dq/dt$, step $h_n = t_{n+1} - t_n$:

| Method | Formula | Order | Stability |
|---|---|---|---|
| Backward Euler | $q_{n+1} - q_n = h_n\, i_{n+1}$ | 1 | L-stable |
| Trapezoidal | $q_{n+1} - q_n = \dfrac{h_n}{2}\left(i_{n+1} + i_n\right)$ | 2 | A-stable, not L-stable |
| BDF2 (Gear 2) | see §2.2 | 2 | A-stable and L-stable |

Trapezoidal is the default: it is accurate, but undamped, so it can ring ("trap ringing") after a discontinuity. Gear damps that ringing. The engine takes one backward Euler step at $t = 0$ and right after every breakpoint, for both methods, which removes trap ringing at those points.

### 2.2 Variable-step BDF2

With $h = h_n$, $h_{p} = h_{n-1}$ and $\rho = h / h_{p}$:

$$
i_{n+1} = \dfrac{1}{h}\left[\dfrac{1+2\rho}{1+\rho}\, q_{n+1} - (1+\rho)\, q_n + \dfrac{\rho^2}{1+\rho}\, q_{n-1}\right]
$$

For constant step ($\rho = 1$) this reduces to $i_{n+1} = \dfrac{1}{h}\left(\tfrac{3}{2} q_{n+1} - 2 q_n + \tfrac{1}{2} q_{n-1}\right)$. The unit tests check both forms.

### 2.3 Companion model from a formula

Every formula has the form $i_{n+1} = \alpha_0\, q_{n+1} + \text{(history terms)}$. With $q = q(v)$ and $C = dq/dv$ at the Newton iterate:

$$
G_{eq} = \alpha_0\, C,\qquad I_{eq} = i_{n+1}^{(k)} - G_{eq}\, v^{(k)}
$$

For a linear capacitor ($q = Cv$) this reduces to the closed forms in [mna.md](mna.md) §3. The inductor uses the same formulas with flux $\phi = L\, i$ in its branch row.

### 2.4 Charge conservation

Nonlinear capacitances (junctions) are integrated through their charge $Q(V)$, never as $C(V)\, dV/dt$. The latter does not conserve charge, and it drifts in switching circuits. Device code must provide $Q(V)$ and $dQ/dV$; the integrator never sees $C$ alone.

## 3. Time-step control

### 3.1 Step size from truncation error (ngspice `cktterr.c`)

After each converged point, every charge state proposes a step size. With $p$ the method order (1 or 2) and $\text{DD}_{p+1}(q)$ the $(p+1)$-th divided difference of $q$ over the last $p+2$ time points:

$$
\text{tol} = \max\!\Big(\text{abstol} + \text{reltol}\cdot\max(|i_{n+1}|,|i_n|),\;\;
\text{reltol}\cdot\dfrac{\max(|q_{n+1}|,|q_n|,\text{chgtol})}{h}\Big)
$$

$$
h_{prop} = \left(\dfrac{\text{trtol}\cdot\text{tol}}{\max\big(\text{abstol},\; c_p\,|\text{DD}_{p+1}(q)|\big)}\right)^{1/p}
$$

| Method | $c_1$ | $c_2$ |
|---|---|---|
| Trapezoidal | 1/2 | 1/12 |
| Gear (BDF) | 1/2 | 2/9 |

$c_p\,\text{DD}_{p+1}$ underestimates the true LTE by a factor $(p+1)!$, because the true LTE is $c_p\, h^{p+1} q^{(p+1)}$ and $q^{(p+1)} \approx (p+1)!\,\text{DD}_{p+1}$. The default `trtol = 7` compensates. Nodal copies this exactly, so its steps follow ngspice's.

### 3.2 Accept or reject

$h_{new} = \min\big(2h,\; \min_{\text{states}} h_{prop}\big)$.

- If $h_{new} < 0.9\,h$, reject the point and retry with $h_{new}$.
- Otherwise accept it, and use $h_{new}$ for the next step.

Clamps:
- $h \le$ `tmax`, which defaults to $\min(\text{tstep}, (\text{tstop} - \text{tstart})/50)$, as in ngspice.
- $h \ge h_{min} = 10^{-11} \cdot \text{tmax}$ (ngspice `delmin`). Below $h_{min}$: error "time step too small", naming the device with the smallest $h_{prop}$.

### 3.3 Breakpoints

Independent sources report the times where their waveform has a corner: pulse edges, PWL vertices, and the sine delay start. The integrator never steps across a breakpoint. It shortens the step to land exactly on it, then restarts at small $h$ with one backward Euler step (§2.1).

Switch threshold crossings are not breakpoints, because their time isn't known in advance. They are handled by step rejection ([devices.md](devices.md) §4).

### 3.4 Output points

Accepted points are returned as computed, with irregular spacing. The waveform viewer plots them directly. The validation comparator interpolates onto the reference grid ([VALIDATION.md](../VALIDATION.md) §3).

## 4. Linear solve

- `LinearSolver` trait: `factor(&A)`, then `solve(&mut b)`; refactor when values change. The sparsity pattern is fixed per circuit, so a sparse backend can reuse its symbolic analysis.
- v1 backend: dense LU with partial pivoting (faer), for both real and complex systems ([ADR 0003](../adr/0003-linear-solver.md)).
- A zero or tiny pivot during factorization becomes an error naming the node or branch of that row, not a silent NaN. A pivot $u_{kk}$ counts as tiny if $|u_{kk}| \le n\,\varepsilon\,\max_i|a_{ik}|$, the largest entry in its own column of the original matrix, so a circuit mixing milliohm and teraohm elements is not rejected.

## 5. AC small-signal

1. Solve the DC operating point.
2. Each device stamps its conductances at that point into $G$, and its capacitances $dQ/dV$ into $C$.
3. For each frequency $\omega$, solve $(G + j\omega C)\,x = b_{ac}$. Here $b_{ac}$ holds the AC magnitude and phase of each source, as phasors.

$G$ and $C$ are assembled once. Only the complex sum and its factorization change per frequency.

## References

- C. W. Ho, A. E. Ruehli, P. A. Brennan, "The modified nodal approach to network analysis," *IEEE Trans. Circuits Syst.*, 22(6), 1975.
- J. Vlach and K. Singhal, *Computer Methods for Circuit Analysis and Design*, 2nd ed., Van Nostrand Reinhold, 1994.
- F. N. Najm, *Circuit Simulation*, Wiley-IEEE Press, 2010.
- L. W. Nagel, SPICE2 thesis, UC Berkeley ERL Memo M520, 1975 (step control, breakpoints, limiting).
- ngspice source: `src/spicelib/analysis/` (`dctran.c`, `cktterr.c`, `niiter.c`).
