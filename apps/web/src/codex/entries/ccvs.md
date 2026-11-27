# Current-controlled voltage source

## What it is

A current-controlled voltage source (CCVS, SPICE element `H`) forces the voltage across its output pins to be proportional to a current flowing somewhere else in the circuit. The constant is the transresistance $r$, in ohms. The current is measured in a named independent voltage source.

## Typical uses

- A current-to-voltage converter (a transimpedance stage) in a block model.
- A current sensor: put a 0 V source in a branch and read its current as a voltage.
- Modelling the output of a Hall-effect or shunt-style sensor at block level.
- Coupling two parts of a circuit that share no node other than ground.

## How it works

SPICE has no current-sensing pins. The control current is the branch current of a voltage source. In Nodal you pick that source by name in the `Controlling source` field. To sense the current in a wire, insert an independent voltage source of 0 V in that wire and name it here.

The name must belong to an independent voltage source in the schematic. Nodal's netlister reports an error if the field is empty, or if the name matches no voltage source. A name that differs only in letter case gets a hint that points at the source with the near-matching name.

The sign follows the SPICE convention. The control current $i_c$ is positive when it flows from the `+` pin of the controlling source through the source to its `-` pin. A source that delivers power therefore has a negative $i_c$.

The output is an ideal voltage source with no output resistance, so the model has no bandwidth limit and no output limit. Like any voltage source, it takes part in the check for loops of voltage sources, VCVS and CCVS outputs, and inductors.

## Equations

$$
v_{n^+} - v_{n^-} = r\,i_c
$$

The output voltage is the transresistance times the branch current of the controlling voltage source. The `Gain` field sets $r$, in ohms.

The element is linear and memoryless, so the same equation applies in DC, AC and transient analysis. In AC analysis $i_c$ is the phasor branch current of the controlling source and $r$ is real.

{{parameters}}

## In the MNA system

The CCVS has its own branch current $i_k$, and it reads the branch current $i_c$ of the controlling source, which is also an unknown. The KCL rows get $+1$ in row $n^+$ and $-1$ in row $n^-$, in column $k$. Branch row $k$ is:

$$
\begin{array}{cccc|c}
n^+ & n^- & \text{column } c & & b \\ \hline
+1 & -1 & -r & & 0
\end{array}
$$

This encodes $v_{n^+} - v_{n^-} - r\,i_c = 0$. Entries that name ground are skipped.

## Differences from ngspice

Nodal follows the standard SPICE `H` definition, with a constant gain. ngspice also accepts a VCVS or a CCVS as the controlling element. Nodal accepts only an independent voltage source and rejects any other name.
