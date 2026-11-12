# Device models (v1)

Equations for every nonlinear device in v1. Parameter names and defaults follow ngspice, so a model card gives the same result in both simulators, except for the deviations listed in §5. Only the listed parameters are supported; the engine rejects any other parameter rather than ignoring it.

Constants. Nodal uses the values ngspice has used since its `const.h` moved off the SPICE2 numbers: CODATA 2014. The SPICE2 values ($k$ = 1.3806226e-23, $q$ = 1.6021918e-19) give $V_t$ = 0.0258641864 V, which is 2.8e-5 relative below the CODATA 2014 value and shifts a forward-biased diode current by about 7e-4: enough to fail the golden tolerances. Each golden header records the ngspice version, and M2 re-checks these values against that version. The constants live in `crates/nodal-engine/src/devices/constants.rs`.

| Symbol | Value |
|---|---|
| $k$ | 1.38064852e-23 J/K |
| $q$ | 1.6021766208e-19 C |
| $T$ | 300.15 K (27 °C, fixed in v1) |
| $V_t = kT/q$ | 0.025864917007 V |

## 1. Diode (`D`)

| Parameter | Default | Unit | Meaning |
|---|---|---|---|
| `IS` | 1e-14 | A | Saturation current |
| `N` | 1 | — | Emission coefficient |
| `RS` | 0 | Ω | Series resistance (adds an internal node when > 0) |
| `CJO` | 0 | F | Zero-bias junction capacitance |
| `VJ` | 1 | V | Junction potential |
| `M` | 0.5 | — | Grading coefficient |
| `FC` | 0.5 | — | Forward-bias depletion capacitance coefficient |
| `TT` | 0 | s | Transit time |
| `BV`, `IBV` | ∞, 1e-3 | V, A | Reverse breakdown — **post-v1**; rejected if set |

**DC current** ($V_d$ = anode − cathode, $nV_t = N\,V_t$):

$$
I_d = I_S\left(e^{V_d / nV_t} - 1\right) + g_{min} V_d,
\qquad
g_d = \dfrac{I_S}{nV_t}\, e^{V_d / nV_t} + g_{min}
$$

This formula holds for $V_d \ge -3\,nV_t$. Below that, ngspice (`dioload.c`) switches to a cubic form that tends to $-I_S$:

$$
a = \left(\dfrac{3\,nV_t}{e\,V_d}\right)^3,\qquad
I_d = -I_S\,(1 + a) + g_{min} V_d,\qquad
g_d = \dfrac{3\,I_S\,a}{V_d} + g_{min}
$$

The Jacobian tests cover both regions and the boundary between them.

**Charge** (used for transient; its derivative gives the AC capacitance):

$$
Q_d = T_T\, I_{d,\text{diode}} + Q_j(V_d)
$$

Depletion charge for $V_d < F_C V_J$:

$$
Q_j = \dfrac{C_{J0}\,V_J}{1-M}\left[1 - \left(1 - \dfrac{V_d}{V_J}\right)^{1-M}\right],
\qquad
C_j = \dfrac{C_{J0}}{\left(1 - V_d/V_J\right)^{M}}
$$

For $V_d \ge F_C V_J$, $C_j$ continues linearly, as in SPICE:

$$
C_j = \dfrac{C_{J0}}{F_2}\left(F_3 + \dfrac{M\,V_d}{V_J}\right),\quad
F_2 = (1-F_C)^{1+M},\quad F_3 = 1 - F_C(1+M)
$$

$Q_j$ is the integral of that expression, continuous at $V_d = F_C V_J$.

**Integrate charge, not capacitance.** The transient companion is built from $Q(V)$ and $C = dQ/dV$, not from $C\,dV/dt$, so that charge is conserved ([numerical-methods.md](numerical-methods.md) §2.4).

**Limiting (pnjlim).** This is SPICE3's `DEVpnjlim` from `devsup.c`, ported exactly. With $v_t = nV_t$ and $V_{crit} = v_t \ln\!\left(\dfrac{v_t}{\sqrt{2}\,I_S}\right)$:

- If $V_{new} > V_{crit}$ and $|V_{new} - V_{old}| > 2 v_t$:
  - if $V_{old} > 0$, let $a = (V_{new} - V_{old})/v_t$. If $a > 0$, set $V_{new} \leftarrow V_{old} + v_t\,(2 + \ln(a - 2))$. Otherwise set $V_{new} \leftarrow V_{old} - v_t\,(2 + \ln(2 - a))$.
  - if $V_{old} \le 0$, set $V_{new} \leftarrow v_t \ln(V_{new}/v_t)$.
- Otherwise, if $V_{new} < 0$: let $a = -V_{old} - 1$ when $V_{old} > 0$, else $a = 2V_{old} - 1$. If $V_{new} < a$, set $V_{new} \leftarrow a$.

Whenever $V_{new}$ changes, the device flags the iteration as limited, so it cannot count as converged ([numerical-methods.md](numerical-methods.md) §1.2).

## 2. BJT (`NPN`, `PNP`) — Gummel–Poon subset

v1 implements the transport form of Gummel–Poon, with Early effect on the forward path and no high-injection or recombination terms. These are the ngspice equations with `IKF = IKR = ∞`, `ISE = ISC = 0`, `VAR = ∞`, and `RB = RC = RE = 0`.

| Parameter | Default | Meaning |
|---|---|---|
| `IS` | 1e-16 A | Transport saturation current |
| `BF` | 100 | Ideal forward beta |
| `BR` | 1 | Ideal reverse beta |
| `NF`, `NR` | 1, 1 | Forward / reverse emission coefficients |
| `VAF` | ∞ | Forward Early voltage |
| `CJE`, `VJE`, `MJE` | 0, 0.75 V, 0.33 | B–E depletion capacitance |
| `CJC`, `VJC`, `MJC` | 0, 0.75 V, 0.33 | B–C depletion capacitance |
| `TF`, `TR` | 0, 0 | Forward / reverse transit times |
| `FC` | 0.5 | Depletion capacitance coefficient |

NPN, with $V_{be}$ and $V_{bc}$ as junction voltages:

$$
I_F = I_S\left(e^{V_{be}/(N_F V_t)} - 1\right),\qquad
I_R = I_S\left(e^{V_{bc}/(N_R V_t)} - 1\right)
$$

$$
q_b = \dfrac{1}{1 - V_{bc}/V_{AF}}\quad(\text{with } q_b = 1 \text{ when } V_{AF} = \infty)
$$

$$
I_C = \dfrac{I_F - I_R}{q_b} - \dfrac{I_R}{B_R},\qquad
I_B = \dfrac{I_F}{B_F} + \dfrac{I_R}{B_R},\qquad
I_E = -(I_C + I_B)
$$

Here $I_C$ and $I_B$ flow into the collector and base terminals.

**Reverse region.** Each junction current uses the diode's two regions (§1), with $V_t$ replaced by $N_F V_t$ or $N_R V_t$: the exponential above $-3 N V_t$, and below it the cubic form $-I_S(1 + \text{arg})$ with $\text{arg} = (3 N V_t / (V\,\mathrm{e}))^3$, as in `bjtload.c`.

**Where gmin enters.** With $I_{SE} = I_{SC} = 0$ the leakage terms of `bjtload.c` reduce to $g_{min} V_{be}$ and $g_{min} V_{bc}$. They are added to the base current and, through the $-I_{CN}$ term, subtracted from the collector current, so $I_C = (I_F - I_R)/q_b - I_R/B_R - g_{min} V_{bc}$ and $I_B = I_F/B_F + I_R/B_R + g_{min}(V_{be} + V_{bc})$. The Jacobian carries $g_{min}$ in the same places.

**Substrate.** As for the default vertical device in `bjtload.c`, the substrate node is ground and the substrate junction contributes only $g_{min}$ between the collector and ground. It is linear, so it adds $g_{min}$ to the collector diagonal and nothing to the right-hand side.

**PNP:** evaluate the same equations with $V_{be} \to -V_{be}$ and $V_{bc} \to -V_{bc}$, then negate all terminal currents. Conductances keep their sign.

**Conductances for the companion model:** the Jacobian is $\partial(I_C, I_B)/\partial(V_{be}, V_{bc})$, and terminal stamps follow from $I_E = -(I_C + I_B)$. Derive it symbolically in code comments. If this document and the Jacobian tests disagree, the tests win.

**Charges:** $Q_{be} = T_F\, I_F + Q_{j,be}$ and $Q_{bc} = T_R\, I_R + Q_{j,bc}$. $Q_j$ uses the diode depletion formula with the junction's own $C_J$, $V_J$, $M_J$.

**Limiting:** pnjlim on $V_{be}$ and $V_{bc}$ separately.

## 3. MOSFET Level 1 (`NMOS`, `PMOS`) — Shichman–Hodges

| Parameter | Default | Meaning |
|---|---|---|
| `VTO` | 0 V | Zero-bias threshold |
| `KP` | 2e-5 A/V² | Transconductance parameter |
| `GAMMA` | 0 √V | Body-effect coefficient |
| `PHI` | 0.6 V | Surface potential |
| `LAMBDA` | 0 1/V | Channel-length modulation |
| `CGSO`, `CGDO`, `CGBO` | 0 F/m | Overlap capacitances per unit width |
| instance `W`, `L` | 100 µm, 100 µm | Channel width and length (ngspice defaults) |

Without `TOX`, ngspice Level 1 has no intrinsic Meyer capacitances. v1 matches that: `TOX` is rejected, and only the constant overlap capacitances are modelled. Junction diodes to bulk (`CBD`, `CBS`, `IS`, `JS`) are post-v1. This is a known deviation from ngspice (§5).

NMOS. If $V_{ds} < 0$, swap drain and source, evaluate, and swap back. With $\beta = K_P\, W / L$:

$$
s(V_{bs}) =
\begin{cases}
\sqrt{\phi - V_{bs}} & V_{bs} \le 0 \\
\max\!\left(0,\; \sqrt{\phi} - \dfrac{V_{bs}}{2\sqrt{\phi}}\right) & V_{bs} > 0
\end{cases}
\qquad
V_{th} = V_{TO} + \gamma\,\big(s(V_{bs}) - \sqrt{\phi}\big)
$$

The $V_{bs} > 0$ branch follows `mos1load.c` and keeps $V_{th}$ defined when the source–bulk junction is forward biased.

| Region | Condition | $I_d$ |
|---|---|---|
| Cutoff | $V_{gs} \le V_{th}$ | $0$ |
| Triode | $0 \le V_{ds} < V_{gs} - V_{th}$ | $\beta\left(V_{gs} - V_{th} - \dfrac{V_{ds}}{2}\right) V_{ds}\,(1 + \lambda V_{ds})$ |
| Saturation | $V_{ds} \ge V_{gs} - V_{th}$ | $\dfrac{\beta}{2}\,(V_{gs} - V_{th})^2\,(1 + \lambda V_{ds})$ |

The two expressions agree at $V_{ds} = V_{gs} - V_{th}$, so $I_d$ is continuous across the boundary.

Conductances, with $V_{ov} = V_{gs} - V_{th}$:

| Region | $g_m = \partial I_d/\partial V_{gs}$ | $g_{ds} = \partial I_d/\partial V_{ds}$ |
|---|---|---|
| Triode | $\beta\, V_{ds}\,(1+\lambda V_{ds})$ | $\beta\,(V_{ov} - V_{ds})(1+\lambda V_{ds}) + \beta\lambda\left(V_{ov} - \dfrac{V_{ds}}{2}\right)V_{ds}$ |
| Saturation | $\beta\, V_{ov}\,(1+\lambda V_{ds})$ | $\dfrac{\beta}{2}\, V_{ov}^2\,\lambda$ |

Body transconductance, when $\gamma > 0$ and $s > 0$: $g_{mbs} = g_m \cdot \dfrac{\gamma}{2\,s(V_{bs})}$ for $V_{bs} \le 0$, and $g_{mbs} = g_m \cdot \dfrac{\gamma}{2\sqrt{\phi}}$ for $V_{bs} > 0$; otherwise $0$. The $V_{bs} > 0$ value is the exact derivative of the clamped expression for $s$. It differs from `mos1load.c`, which uses $g_m\,\gamma / (2\,s)$ in every branch. This changes only the Newton matrix, not the converged solution. The Jacobian tests include a $V_{bs} > 0$ case.

**PMOS:** evaluate with all terminal voltages negated, $V_{TO} \to -V_{TO}$, then negate $I_d$.

**Limiting:** SPICE3 `DEVfetlim` on $V_{gs}$, and `DEVlimvds` on $V_{ds}$.

## 4. Voltage-controlled switch (`SW`)

| Parameter | Default | Meaning |
|---|---|---|
| `VT` | 0 V | Threshold |
| `VH` | 0 V | Hysteresis half-width |
| `RON` | 1 Ω | On resistance |
| `ROFF` | 1/gmin | Off resistance |

The state turns on when $v_c > V_T + V_H$ and off when $v_c < V_T - V_H$. In between, it keeps the previous state. The switch stamps as a resistor of `RON` or `ROFF`.

- **DC:** the state comes from $v_c$ alone. Inside the hysteresis band it starts off, unless an initial condition says otherwise. This matches ngspice.
- **Transient:** the state changes only at accepted time points. When $v_c$ crosses a threshold between two points, the step is rejected and retried with the crossing located to within `reltol` of the step. A crossing can't be known in advance, so it is not a breakpoint (numerical-methods §3.3). This bounds timing error but does not exactly reproduce ngspice's time points, which is why T6 uses the range-normalized tolerance.

## 5. Known deviations from ngspice in v1

| Device | ngspice | Nodal v1 | Effect |
|---|---|---|---|
| MOSFET | Bulk–drain and bulk–source diodes always present (`IS` defaults to 1e-14 A), each with `gmin` in parallel | No bulk diodes; `gmin` across drain–source instead | Currents differ by about 1e-14 A plus gmin·V. Below every DC tolerance in VALIDATION §3 except possibly the 1e-13 A one on source currents. Goldens for MOSFET circuits tie the bulk to the source, which removes most of the difference. |
| Diode, BJT | Reverse breakdown, high injection, recombination currents, parasitic resistances (BJT) | Not modelled | Model cards that set these parameters are rejected. |

## References

- L. W. Nagel, *SPICE2: A Computer Program to Simulate Semiconductor Circuits*, UC Berkeley ERL Memo M520, 1975.
- ngspice User's Manual (current release), chapters on diode, BJT, MOSFET and switch models.
- ngspice source: `src/spicelib/devices/{dio,bjt,mos1,sw}/`, and `DEVpnjlim`/`DEVfetlim`/`DEVlimvds` in `devsup.c`.
- G. Massobrio and P. Antognetti, *Semiconductor Device Modeling with SPICE*, 2nd ed., McGraw-Hill, 1993.
