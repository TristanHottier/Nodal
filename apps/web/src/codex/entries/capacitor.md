# Capacitor

## What it is

A capacitor stores energy in an electric field. Its current is proportional to how fast the voltage across it changes, so it passes fast changes and blocks steady DC. It is one of the two reactive elements, together with the [inductor](#/codex/inductor).

## Typical uses

- Decoupling a supply so that fast load changes do not move the rail.
- AC coupling, which blocks a DC level and passes the signal.
- RC filters and timing circuits.
- Compensation and bandwidth limiting around amplifiers.
- Storing charge, as in a sample-and-hold or a charge pump.

## How it works

Put charge $q$ on a capacitor and a voltage $v = q/C$ appears across it. A current can only flow while that charge is changing. With a steady voltage the current is zero, so at DC a capacitor looks like an open circuit. With a fast-changing voltage the current is large, so at high frequency it looks more and more like a short.

Nodal handles the three analyses differently. In a DC analysis the capacitor is left out of the matrix. That is why a node connected to the rest of the circuit only through capacitors has no DC path to ground and is reported as a floating node (see [ground](#/codex/ground)). In AC analysis it contributes the admittance $j\omega C$. In a transient run it is replaced at every time step by a conductance in parallel with a current source, a companion model built from the integration formula.

The model is an ideal, linear capacitor. It has no leakage, no series resistance or inductance and no voltage or temperature dependence.

## Equations

With $v = v_{n^+} - v_{n^-}$ and $q = C\,v$ (pin `1` is $n^+$ and pin `2` is $n^-$):

$$
i = \dfrac{dq}{dt} = C\,\dfrac{dv}{dt}
$$

The current into the $n^+$ pin is the rate of change of stored charge.

In AC analysis the admittance is

$$
Y = j\omega C
$$

so the current leads the voltage by 90 degrees and grows with frequency.

In a transient step of length $h$, with $v_n$ and $i_n$ the voltage and current at the previous accepted point, the trapezoidal companion is

$$
i_{n+1} = G_{eq}\,v_{n+1} + I_{eq}, \qquad
G_{eq} = \dfrac{2C}{h}, \qquad
I_{eq} = -\left(\dfrac{2C}{h}\,v_n + i_n\right)
$$

and backward Euler gives

$$
G_{eq} = \dfrac{C}{h}, \qquad I_{eq} = -\dfrac{C}{h}\,v_n
$$

Either way the capacitor becomes a resistor of conductance $G_{eq}$ in parallel with a constant current. Nodal integrates the charge $q$, not $C\,dv/dt$, which is the form [integration](#/codex/integration) describes. That entry also covers the Gear formula and the choice of step.

The initial condition `ic` is the voltage of pin `1` minus pin `2`, $v_{n^+} - v_{n^-}$, at the start of a transient run. It is used only when the run uses `uic`. Without `uic` the run starts from the operating point, and a capacitor there carries the voltage the circuit gives it, so `ic` is ignored. With `uic` all unknowns start at zero and the stored charge starts at $C$ times `ic`, or zero if `ic` is empty.

{{parameters}}

## In the MNA system

In a transient step the capacitor stamps the resistor pattern with $G_{eq}$ and adds $I_{eq}$ to the right-hand side as an independent current from $n^+$ to $n^-$:

$$
\begin{bmatrix}
 & n^+ & n^- \\
n^+ & +G_{eq} & -G_{eq} \\
n^- & -G_{eq} & +G_{eq}
\end{bmatrix},
\qquad
b_{n^+} \mathrel{-}= I_{eq}, \quad b_{n^-} \mathrel{+}= I_{eq}
$$

There is no branch current. In a DC analysis nothing is stamped. In AC analysis the capacitor puts $+C$ and $-C$ in the same pattern of the reactive matrix, so the system $G + j\omega C$ has $j\omega C$ where the resistor has $g$.

## Differences from ngspice

Nodal follows ngspice-42 `capload.c` for the transient companion and its charge history. The element takes only a capacitance and an initial voltage. Capacitor model cards, temperature coefficients and the instance multiplier are not supported. As in ngspice, `ic` matters only with `uic`. A capacitance of zero or less is rejected; ngspice accepts a negative value.

One difference in output: with `uic`, Nodal solves a backward Euler step at $t = 0$ so that the first reported point shows the initial voltages, and ngspice does not report $t = 0$ in that case.
