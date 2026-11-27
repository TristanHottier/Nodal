# Current-controlled current source

## What it is

A current-controlled current source (CCCS, SPICE element `F`) pushes a current through its output pins that is a fixed multiple of a current flowing somewhere else in the circuit. The multiplier is the current gain $\beta$ (dimensionless). The control current is measured in a named independent voltage source.

## Typical uses

- A current mirror or current amplifier in a block-level model.
- The collector current of a transistor model, where $\beta i_b$ is the output.
- Copying a branch current into another part of the circuit.
- Current-mode feedback in a behavioural model.

## How it works

SPICE has no current-sensing pins. The control current is the branch current of a voltage source, chosen by name in the `Controlling source` field. To sense the current in a wire, insert an independent voltage source of 0 V in that wire and name it here.

The name must belong to an independent voltage source in the schematic. The netlister reports an error if the field is empty or the name matches no voltage source. A name that differs only in letter case gets a hint that points at the near-matching source.

The control current $i_c$ is positive when it flows from the `+` pin of the controlling source through the source to its `-` pin. A source that delivers power has a negative $i_c$.

The output is an ideal current source. Whatever voltage appears across it, it delivers $\beta i_c$. If the rest of the circuit gives that current no path, the matrix is singular or the solver fails to converge. The output pair is not a DC connection for the topology check, so each node it touches needs a DC path to ground through other parts.

## Equations

$$
i = \beta\,i_c
$$

The current from `p` through the source to `n` is the gain times the controlling branch current. The `Gain` field sets $\beta$.

The element is linear and memoryless, so the same equation applies in DC, AC and transient analysis. In AC analysis $i_c$ is the phasor branch current of the controlling source and $\beta$ is real.

{{parameters}}

## In the MNA system

The CCCS adds no unknown of its own. It reads the branch current $i_c$, which is an unknown of the controlling source, and stamps the KCL rows:

$$
\begin{array}{c|c}
 & \text{column } c \\ \hline
\text{row } n^+ & +\beta \\
\text{row } n^- & -\beta
\end{array}
$$

The right-hand side is unchanged. Entries that name ground are skipped.

## Differences from ngspice

Nodal follows the standard SPICE `F` definition, with a constant gain. ngspice also accepts a VCVS or a CCVS as the controlling element. Nodal accepts only an independent voltage source and rejects any other name.
