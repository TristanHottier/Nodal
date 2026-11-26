# Ground

## What it is

The ground symbol marks the reference node of the circuit, node `0`. Every voltage in a simulation is measured against it. A schematic needs at least one ground symbol before it can be simulated.

## Typical uses

- The common return of a single-supply circuit.
- The reference for the negative terminal of a source, so that a node voltage reads as a plain number.
- The midpoint of a split supply.
- Tying a signal source to the circuit it drives.

## How it works

A voltage is a difference between two points, so a set of node voltages is only defined once one node is chosen as the zero. That node is ground. It is a bookkeeping choice and needs no connection to the earth. You can pick any node, and the currents in the circuit do not change.

Nodal gives every ground symbol the net name `0`, and all ground symbols in a schematic are one net, even when no wire joins them. A ground symbol produces no circuit element. It only names the net it touches.

Ground is also what makes the equations solvable. The KCL equations of a circuit add up to zero, because each element current leaves one node and enters another. So they are not independent, and the voltages could all be shifted by the same amount without changing anything. Fixing node `0` at zero removes that freedom and removes its row and column from the matrix.

The engine checks the circuit before it solves anything, and reports two kinds of failure by name:

- A node with no DC path to ground. The DC paths are resistors, inductors, voltage sources, the output pair of a VCVS or CCVS, a diode, the base-emitter and base-collector pairs of a BJT, the drain and source of a MOSFET, and the output pair of a switch. Capacitors, current sources, controlled current outputs, all controlling ports, and a MOSFET gate or bulk are not DC paths. The error is "floating nodes with no DC path to ground" and lists the nodes.
- A loop made of voltage sources, VCVS or CCVS outputs and inductors. Its branch equations are linearly dependent, so the engine reports a "loop of voltage sources and inductors".

The netlister reports a schematic with no ground symbol as `no-ground`. The names `0` and `gnd` are reserved, so a net label cannot use them (see [net label](#/codex/label)).

## Equations

Ground fixes one node voltage:

$$
v_0 = 0
$$

Every other node voltage is the voltage from that node to ground. With $N$ nodes including ground, the KCL equations read

$$
\sum_{\text{elements at } n} i = 0, \qquad n = 0, 1, \dots, N-1
$$

and summing all $N$ of them gives $0 = 0$, so only $N - 1$ are independent. Nodal drops the equation of node `0` and keeps the other $N - 1$ rows.

{{parameters}}

## In the MNA system

Ground is not an unknown. Any stamp entry that names node `0` is skipped, in the row or in the column. A resistor from a node to ground adds $+g$ to one diagonal entry and nothing else. A voltage source with $n^+$ at node $n$ and $n^-$ at ground adds $+1$ in row $n$ of its branch column and $+1$ in column $n$ of its branch row, and its right-hand side $V$ sets $v_n = V$.

The unknown vector is therefore the $N - 1$ node voltages followed by the branch currents of the voltage sources, VCVS, CCVS and inductors, as described in [MNA](#/codex/mna). Without a reference the matrix would be singular, which is what the floating-node check detects in advance.

## Differences from ngspice

ngspice also uses node `0` as the reference and treats the name `gnd` as ground. Nodal reserves `gnd` in any case rather than treating it as a second spelling, so a label named `gnd` is rejected. Nodal has no separate analogue ground, chassis ground or earth symbol: every ground symbol is node `0`.
