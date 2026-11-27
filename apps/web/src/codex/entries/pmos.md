# PMOS transistor

## What it is

A p-channel MOSFET is the complement of the [NMOS](#/codex/nmos): four terminals (drain, gate, source, bulk) and a channel that conducts when the gate is sufficiently below the source. The drain current flows out of the drain terminal into the circuit, opposite to the NMOS.

Nodal uses the same Level 1 (Shichman–Hodges) model as for the NMOS. The page for the NMOS has the full derivation, so this page states the sign mirror and repeats the key equations in PMOS form.

## Typical uses

- The pull-up half of a CMOS inverter or gate.
- High-side switches that connect a load to the supply.
- Complementary source-follower and amplifier stages.
- PMOS current mirrors and active loads referenced to the positive rail.

## How it works

A PMOS behaves like an NMOS with every voltage and current reversed. Its source usually sits at the most positive node. The device is on when $V_{gs}$ is more negative than the threshold. For an ordinary enhancement PMOS the model card has a negative `VTO`.

Nodal does not keep a separate set of PMOS equations. It evaluates the NMOS equations at the negated terminal voltages, with the threshold $V_{TO}$ negated, then negates the drain current. The conductances $g_m$, $g_{ds}$ and $g_{mbs}$ keep their sign, because the two negations cancel.

The same limits apply as for the NMOS: no intrinsic gate capacitance, no series resistances, no subthreshold conduction. The drain and source swap when the drain becomes more positive than the source.

## Equations

With $V_{gs}$, $V_{ds}$ and $V_{bs}$ the physical voltages relative to the source, the PMOS uses the NMOS-oriented voltages $V'_{gs} = -V_{gs}$, $V'_{ds} = -V_{ds}$ and $V'_{bs} = -V_{bs}$, and the threshold parameter $V'_{TO} = -V_{TO}$. The threshold is

$$
V_{th}' = V'_{TO} + \gamma\,\big(s(V'_{bs}) - \sqrt{\phi}\big),
\qquad
s(V'_{bs}) = \sqrt{\phi - V'_{bs}} \;\; (V'_{bs} \le 0)
$$

with the same $V'_{bs} > 0$ branch as in the NMOS entry. With $V'_{ov} = V'_{gs} - V'_{th}$ and $V'_{ds} \ge 0$, the drain current into the drain terminal is $I_d = -I'_d$, where

$$
I'_d =
\begin{cases}
0 & V'_{ov} \le 0 \\
\beta\left(V'_{ov} - \dfrac{V'_{ds}}{2}\right) V'_{ds}\,(1 + \lambda V'_{ds}) & 0 < V'_{ds} < V'_{ov} \\
\dfrac{\beta}{2}\,V'^{\,2}_{ov}\,(1 + \lambda V'_{ds}) & V'_{ds} \ge V'_{ov}
\end{cases}
$$

with $\beta = K_P\,W/L$. In physical voltages, define the PMOS threshold $V_{th,p} = -V'_{th} = V_{TO} - \gamma\,\big(s(-V_{bs}) - \sqrt{\phi}\big)$, with $s(-V_{bs}) = \sqrt{\phi + V_{bs}}$ for $V_{bs} \ge 0$. The device conducts when $V_{gs} < V_{th,p}$, since $V'_{gs} > V'_{th}$ means $-V_{gs} > -V_{th,p}$. It is in saturation when $V_{ds} \le V_{gs} - V_{th,p}$, since $V'_{ds} \ge V'_{ov}$ means $-V_{ds} \ge -V_{gs} + V_{th,p}$. It is in cutoff when $V_{gs} \ge V_{th,p}$, and in triode in between.

The small-signal conductances are those of the NMOS evaluated at the primed voltages. For example, in saturation $g_m = \beta\,V'_{ov}(1 + \lambda V'_{ds})$ and $g_{ds} = \dfrac{\beta}{2}\,V'^{\,2}_{ov}\,\lambda$. For $V'_{ds} < 0$ the drain and source swap, as in the NMOS.

The overlap capacitances $C_{GSO}\,W$, $C_{GDO}\,W$ and $C_{GBO}\,L$ keep the same signs and sit on the physical terminals. In a PMOS the junction anodes are the p-type source and drain, and the n-type bulk is the cathode, so each junction conducts from the source or drain into the bulk. Use the junction law of the NMOS entry with $v = -V_{bs}$ or $v = -V_{bd}$. The physical current from the bulk to the terminal is $-i_b(v)$.

{{parameters}}

## In the MNA system

The stamp is the NMOS stamp of the NMOS entry with $\sigma = -1$ ($\sigma = +1$ for an NMOS) on the constant terms. The matrix entries are the same $\begin{bmatrix} g_{ds} & g_m & g_{mbs} & -(g_m + g_{ds} + g_{mbs}) \end{bmatrix}$ in the columns $\begin{bmatrix} d & g & b & s \end{bmatrix}$ of row $d$, and their negation in row $s$. The drain current is $I_d = \sigma\,I'_d$ and

$$
I_{eq} = I_d - g_m\,\sigma V'_{gs} - g_{ds}\,\sigma V'_{ds} - g_{mbs}\,\sigma V'_{bs}
$$

which equals $I_d - g_m V_{gs} - g_{ds} V_{ds} - g_{mbs} V_{bs}$ in physical voltages. The right-hand side gets $-I_{eq}$ on row $d$ and $+I_{eq}$ on row $s$. The bulk junction and capacitor companions have their equivalent currents multiplied by $\sigma = -1$.

## Differences from ngspice

The deviations are those of the [NMOS](#/codex/nmos), all of which apply: the exact `gmbs` derivative for $V'_{bs} > 0$, "limited" reported for `fetlim` and `limvds`, a convergence test against recomputed values, no TOX, Meyer capacitances, CBD, CBS, CJ, CJSW or JS, a fixed temperature of 27 °C, and history seeded from the operating point instead of the `MODEINITTRAN` extrapolation.
