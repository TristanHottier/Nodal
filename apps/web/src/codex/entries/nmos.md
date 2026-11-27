# NMOS transistor

## What it is

An n-channel MOSFET is a four-terminal switch and amplifier: drain, gate, source and bulk. A voltage between gate and source controls how much current flows from drain to source. The gate itself carries no DC current.

Nodal uses the Level 1 (Shichman–Hodges) model, the simplest SPICE MOSFET. It captures the threshold, the square-law current and the first-order body and channel-length effects.

## Typical uses

- Logic and switching: an NMOS pulls a node toward ground when its gate is high.
- Common-source and source-follower amplifier stages.
- Current mirrors and active loads.
- Pass gates and analog switches.
- Textbook exercises on threshold, saturation and body effect.

## How it works

With the gate at or below the threshold voltage $V_{th}$ there is no channel and the drain current is zero (cutoff). Above it, a channel of electrons forms under the gate. For a small drain-source voltage the channel acts like a voltage-controlled resistor (linear or triode region). Once $V_{ds}$ reaches the overdrive $V_{gs} - V_{th}$ the channel pinches off at the drain end and the current stops growing with $V_{ds}$ (saturation). Channel-length modulation, set by `LAMBDA`, gives saturation a gentle upward slope.

The threshold depends on the source-bulk voltage. A reverse-biased bulk raises $V_{th}$, scaled by `GAMMA` and `PHI`. This is the body effect.

The device gain is $\beta = K_P\,W/L$. `KP` is a model parameter. The channel width $W$ and length $L$ are instance fields in the inspector.

The drain and source of a MOSFET are symmetric. If $V_{ds}$ goes negative, Nodal swaps the two roles, evaluates the device, and swaps back, as ngspice does.

Nodal leaves out the intrinsic gate capacitance (the Meyer model needs the oxide thickness TOX, which is rejected), series resistances, subthreshold conduction, mobility degradation and velocity saturation. The only capacitances are the constant overlap capacitances. The bulk junctions are diodes with no capacitance.

## Equations

Write the NMOS equations with $V_{gs}$, $V_{ds}$ and $V_{bs}$ referenced to the source. The threshold is

$$
s(V_{bs}) =
\begin{cases}
\sqrt{\phi - V_{bs}} & V_{bs} \le 0 \\
\max\!\left(0,\; \sqrt{\phi} - \dfrac{V_{bs}}{2\sqrt{\phi}}\right) & V_{bs} > 0
\end{cases}
\qquad
V_{th} = V_{TO} + \gamma\,\big(s(V_{bs}) - \sqrt{\phi}\big)
$$

Here $\gamma$ is `GAMMA` and $\phi$ is `PHI`. The $V_{bs} > 0$ branch is a straight-line continuation that keeps $V_{th}$ defined when the source-bulk junction is forward biased.

With $V_{ov} = V_{gs} - V_{th}$ and $V_{ds} \ge 0$, the drain current is

| Region | Condition | $I_d$ |
|---|---|---|
| Cutoff | $V_{ov} \le 0$ | $0$ |
| Triode | $0 < V_{ds} < V_{ov}$ | $\beta\left(V_{ov} - \dfrac{V_{ds}}{2}\right) V_{ds}\,(1 + \lambda V_{ds})$ |
| Saturation | $V_{ds} \ge V_{ov}$ | $\dfrac{\beta}{2}\,V_{ov}^2\,(1 + \lambda V_{ds})$ |

Both expressions agree at $V_{ds} = V_{ov}$, so the current is continuous across the boundary. Here $\lambda$ is `LAMBDA`.

For $V_{ds} < 0$ the drain and source swap: Nodal evaluates the table at $(V_{gd},\, -V_{ds},\, V_{bd})$ and negates the current.

The small-signal parameters are the partial derivatives $g_m = \partial I_d/\partial V_{gs}$, $g_{ds} = \partial I_d/\partial V_{ds}$ and $g_{mbs} = \partial I_d/\partial V_{bs}$. In saturation

$$
g_m = \beta\,V_{ov}\,(1 + \lambda V_{ds}),
\qquad
g_{ds} = \dfrac{\beta}{2}\,V_{ov}^2\,\lambda
$$

and in triode

$$
g_m = \beta\,V_{ds}\,(1 + \lambda V_{ds}),
\qquad
g_{ds} = \beta\,(V_{ov} - V_{ds})(1 + \lambda V_{ds}) + \beta\lambda\left(V_{ov} - \dfrac{V_{ds}}{2}\right)V_{ds}
$$

The body transconductance follows from the threshold shift:

$$
g_{mbs} = g_m \cdot \gamma \cdot \left(-\dfrac{\partial s}{\partial V_{bs}}\right),
\qquad
-\dfrac{\partial s}{\partial V_{bs}} = \dfrac{1}{2\,s(V_{bs})} \;(V_{bs} \le 0),
\quad
\dfrac{1}{2\sqrt{\phi}} \;(V_{bs} > 0)
$$

It is zero when $\gamma = 0$ or $s = 0$.

The capacitances are constants, on the physical terminals in every operating region:

$$
C_{gs} = C_{GSO}\,W,
\qquad
C_{gd} = C_{GDO}\,W,
\qquad
C_{gb} = C_{GBO}\,L
$$

`CGSO` and `CGDO` are per unit width, and `CGBO` is per unit length. AC analysis stamps $j\omega C$ between the gate and each of source, drain and bulk. Transient analysis integrates the charge $q = C\,v$ of each one.

The two bulk junctions (bulk to source, bulk to drain) are diodes with saturation current $I_S$ and $g_{min}$ in parallel. With $v$ the junction voltage and $V_t = kT/q$:

$$
i_b(v) =
\begin{cases}
g_{min}\,v - I_S & v \le -3 V_t \\
I_S\left(e^{v/V_t} - 1\right) + g_{min}\,v & v > -3 V_t
\end{cases}
$$

The channel itself has no $g_{min}$ across it. The area-based JS and the junction capacitances CBD, CBS, CJ and CJSW are rejected.

### Limiting

Newton steps can overshoot, so Nodal limits how far each voltage moves per iteration, as ngspice does. In plain words, `fetlim` limits the gate-source step around the threshold: a rising or falling step is capped at $2\,|V_{gs,old} - V_{TO}| + 2$ V, a limit that grows with the distance from the threshold, and near the threshold the new voltage is kept within about half a volt below and four volts above the threshold. `limvds` caps the drain-source step: a rise is held to $4$ V, or to three times the old value plus $2$ V once $V_{ds}$ is already above $3.5$ V, and a fall is not allowed below a small negative value. The bulk junction voltages use the same junction limiter as the [diode](#/codex/diode). Limiting only shapes the iterations. The converged solution is the unlimited equations above.

{{parameters}}

## In the MNA system

Let $x$ hold the node voltages. Take the unknowns and sign conventions of [MNA](#/codex/mna). At each Newton iterate the channel is replaced by its tangent. With $g_m$, $g_{ds}$ and $g_{mbs}$ evaluated at the limited voltages, the drain current into the drain and out of the source is linearised as

$$
I_d \approx I_{eq} + g_m\,V_g + g_{ds}\,V_d + g_{mbs}\,V_b - (g_m + g_{ds} + g_{mbs})\,V_s,
\qquad
I_{eq} = I_d - g_m\,V_{gs} - g_{ds}\,V_{ds} - g_{mbs}\,V_{bs}
$$

Row $d$ of the matrix gets $\begin{bmatrix} g_{ds} & g_m & g_{mbs} & -(g_m + g_{ds} + g_{mbs}) \end{bmatrix}$ in the columns $\begin{bmatrix} d & g & b & s \end{bmatrix}$. Row $s$ gets the negation. The right-hand side gets $-I_{eq}$ on row $d$ and $+I_{eq}$ on row $s$. When $V_{ds} < 0$ the same stamp applies to the swapped evaluation, mapped back to the physical terminals.

Each bulk junction adds a conductance $g_b$ between the bulk and the source or drain, with equivalent current $i_{eq} = \sigma\,(i_b - g_b v)$ from the bulk to that terminal, where $\sigma = +1$ for an NMOS and $-1$ for a PMOS.

In transient analysis each overlap capacitance adds a companion conductance $g_{eq} = a_0 C$ between the gate and the other terminal, with its equivalent current on the right-hand side. For AC analysis, $G$ is the Jacobian above and the reactive matrix $C$ holds the three capacitances.

## Differences from ngspice

Nodal follows ngspice-42 `mos1load.c`, `mos1acld.c` and `mos1conv.c` for the Level 1 NMOS, with these differences.

- `gmbs` is the exact derivative of the clamped $s(V_{bs})$ for $V_{bs} > 0$. ngspice uses $g_m\gamma/(2s)$ in every branch. This changes the Newton matrix only, not the converged solution.
- Nodal reports a device as "limited" whenever `fetlim` or `limvds` changes a voltage, as well as for the junction limiter. ngspice-42 `mos1load.c` sets its limiting flag, and so non-convergence, only for the junction limiter.
- The convergence test compares the linear prediction of the drain current, and of the sum of the two bulk junction currents, with the value recomputed at the new voltages. `mos1conv.c` compares the prediction with the stored currents instead (see the Newton convergence entry, [convergence](#/codex/convergence)).
- Level 1 only. TOX (and with it the Meyer gate capacitances), CBD, CBS, CJ, CJSW and JS are rejected. Only `IS` sets the bulk junctions.
- Temperature is fixed at 27 °C.
- ngspice's first transient iteration extrapolates the overlap charges. Nodal seeds the history from the operating point and integrates from the first iteration.
