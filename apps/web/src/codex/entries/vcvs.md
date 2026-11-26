# Voltage-controlled voltage source

## What it is

A voltage-controlled voltage source (VCVS, SPICE element `E`) forces the voltage across its output pins to be a fixed multiple of a voltage measured somewhere else in the circuit. The measuring pair draws no current. The output can supply or absorb whatever current the rest of the circuit needs.

## Typical uses

- A buffer or amplifier stage in a block-level model, where only the gain matters.
- A behavioural stand-in for an op-amp or a comparator front end.
- Scaling a node voltage by a known factor.
- A difference amplifier, by taking the control voltage across two nodes.

## How it works

The part has four pins. `p` and `n` are the output pair. `cp` and `cn` are the control pair. Nodal measures $v_{c^+} - v_{c^-}$ across the control pair and drives the output so that $v_{n^+} - v_{n^-}$ equals $\mu$ times that value.

The control pair is an ideal voltmeter: no current flows into `cp` or `cn`. The output is an ideal voltage source: its terminal voltage does not depend on the current through it. So the model has no output resistance, no input capacitance, no bandwidth and no output limit.

Because the output is a voltage source, Nodal gives it a branch current as an extra unknown. The control pair is not a DC connection. A node touched only by `cp` or `cn` still needs a DC path to ground from other parts. The output pair counts as a DC edge, and a loop made only of voltage sources, VCVS and CCVS outputs, and inductors is reported as an error.

## Equations

$$
v_{n^+} - v_{n^-} = \mu\,(v_{c^+} - v_{c^-})
$$

The output voltage is the gain times the control voltage. The gain is dimensionless. The `Gain` field sets $\mu$.

The current $i_k$ through the source is positive when it flows from `p` through the source to `n`. The equation is the same in DC, AC and transient analysis, because the element is linear and has no memory. In AC analysis $\mu$ is real, so it adds no phase shift.

{{parameters}}

## In the MNA system

The source adds one unknown, the branch current $i_k$. The KCL rows get the same entries as an independent voltage source: $+1$ in row $n^+$ and $-1$ in row $n^-$, both in column $k$. Branch row $k$ is:

$$
\begin{array}{cccc|c}
n^+ & n^- & c^+ & c^- & b \\ \hline
+1 & -1 & -\mu & +\mu & 0
\end{array}
$$

Read as an equation, branch row $k$ is $v_{n^+} - v_{n^-} - \mu\,v_{c^+} + \mu\,v_{c^-} = 0$. Entries that name ground are skipped. The matrix is not symmetric, which is normal for controlled sources.

## Differences from ngspice

None known. Nodal follows the standard SPICE `E` definition, with a constant gain. Polynomial and other nonlinear forms of `E` are not supported.
