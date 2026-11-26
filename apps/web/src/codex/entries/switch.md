# Voltage-controlled switch

## What it is

A voltage-controlled switch behaves as a resistor between its output pins. The resistor is small when the voltage across a separate control pair is high, and large when it is low. The control pair draws no current. The switch has no moving parts and no timing of its own: its state follows the control voltage.

## Typical uses

- A switching element in a buck or boost converter, driven by a pulse source.
- A comparator-like threshold element.
- A relay or analogue switch in a signal path.
- A Schmitt trigger, using the hysteresis.

## How it works

The part has four pins. `p` and `n` are the output pair. `cp` and `cn` are the control pair. The control voltage is $v_c = v_{cp} - v_{cn}$.

The switch is on when $v_c$ is above $V_T + V_H$ and off when it is below $V_T - V_H$. Between those two levels it keeps the state it had. This band is the hysteresis. With `VH` at zero the band has no width and the switch turns on and off at `VT`.

When on, the switch is a resistor of `RON`. When off, it is a resistor of `ROFF`. If `ROFF` is not set, the off conductance is the same as `gmin`. The control pair is not a DC connection, but the output pair is.

At the start of a DC solve the switch is off. A control voltage inside the hysteresis band therefore gives an off switch until the voltage leaves the band. In AC analysis the switch keeps the state that the operating point left, and acts as that fixed resistor.

In transient analysis the state is decided at each trial point from $v_c$ and the stored state. When a state changes, Nodal usually does not accept the point straight away, because the edge would be placed at the end of the step. It locates the crossing instead, as described below.

## Equations

$$
\text{on if } v_c > V_T + V_H, \qquad \text{off if } v_c < V_T - V_H
$$

Inside the band the state does not change. The model has two states, each a linear resistor, so the current is $i = (v_p - v_n)/R$ with $R$ equal to `RON` or `ROFF`.

### Locating the crossing

After a trial point converges, the solver asks each switch whose state changed for the fraction $\theta$ of the step at which $v_c$ crossed the threshold it passed ($V_T + V_H$ going on, $V_T - V_H$ going off). With $v_c$ at the start and end of the step called $v_0$ and $v_1$, the fraction by linear interpolation is:

$$
\theta = \dfrac{V_{th} - v_0}{v_1 - v_0}
$$

The smallest $\theta$ over all switches is used. If $(1 - \theta)\,h > \mathrm{reltol}\cdot h$ for the step $h$, the step is rejected and retried with $h' = \theta h + 0.5\,\mathrm{reltol}\cdot h$ at the same order, so the retried point lies just after the crossing. The retry is skipped, and the point accepted, when $h'$ is not above `delmin`. After an accepted point with a state change, integration restarts at order 1 with the short step used after a breakpoint. A crossing can't be known in advance, so it is not a breakpoint.

{{parameters}}

## In the MNA system

The switch stamps as a conductance $g$ between $n^+$ and $n^-$, with $g = 1/R_{on}$ or $1/R_{off}$ by state:

$$
\begin{array}{c|cc}
 & n^+ & n^- \\ \hline
\text{row } n^+ & +g & -g \\
\text{row } n^- & -g & +g
\end{array}
$$

The right-hand side is unchanged. The control pair adds no entries to the matrix: the state is decided from the current iterate when the switch is loaded. A state change forces another iteration.

## Differences from ngspice

The state rule follows ngspice `swload.c`, with one restriction: `VH` must be zero or positive.

In transient analysis, ngspice-42 does not reject a step at a switch edge. It limits the step in `swtrunc.c`, from the change of the control voltage over the last step. Nodal rejects the step and retries it just after the interpolated crossing, which bounds the timing error of the edge to `reltol` times the step. Time points near an edge differ.
