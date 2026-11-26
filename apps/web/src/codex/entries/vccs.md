# Voltage-controlled current source

## What it is

A voltage-controlled current source (VCCS, SPICE element `G`) pushes a current through its output pins that is proportional to a voltage measured elsewhere. The constant of proportionality is the transconductance $g_m$, in siemens. The measuring pair draws no current.

## Typical uses

- The small-signal core of a transistor model, where $g_m v_{gs}$ is the output current.
- A transconductance amplifier stage in a block diagram.
- A voltage-programmed current source.
- A synthetic resistor: connect the control pair across the output pair and the part behaves like a conductance $g_m$.

## How it works

The part has four pins. `p` and `n` are the output pair. `cp` and `cn` are the control pair. Nodal measures $v_{c^+} - v_{c^-}$ and forces a current of $g_m$ times that voltage to flow from `p` through the source to `n`.

The control pair is an ideal voltmeter. The output is an ideal current source: it delivers the same current whatever voltage appears across it. If the rest of the circuit gives that current nowhere to go, the node voltages grow without limit and the solver reports a singular matrix or a failure to converge.

The model has no output conductance, no capacitance and no limit on the current.

Neither the output pair nor the control pair is a DC connection for the topology check. Every node they touch needs a DC path to ground through other parts.

## Equations

$$
i = g_m\,(v_{c^+} - v_{c^-})
$$

The current from `p` through the source to `n` equals the transconductance times the control voltage. The `Gain` field sets $g_m$, in siemens.

The element is linear and memoryless, so the same equation holds in DC, AC and transient analysis. In AC analysis $g_m$ is real, so the current is in phase with the control voltage.

{{parameters}}

## In the MNA system

A VCCS needs no branch current. It adds to the KCL rows only:

$$
\begin{array}{c|cc}
 & c^+ & c^- \\ \hline
\text{row } n^+ & +g_m & -g_m \\
\text{row } n^- & -g_m & +g_m
\end{array}
$$

The right-hand side is unchanged. Entries that name ground are skipped. A current leaving node $n^+$ into the source appears as $+g_m(v_{c^+} - v_{c^-})$ in row $n^+$, in line with the SPICE convention that the KCL sum counts currents leaving the node.

## Differences from ngspice

None known. Nodal follows the standard SPICE `G` definition, with a constant transconductance. Nonlinear and polynomial forms of `G` are not supported.
