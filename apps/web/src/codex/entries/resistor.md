# Resistor

## What it is

A resistor carries a current proportional to the voltage across it. It is the simplest element in the simulator: a fixed, linear conductance between two nodes. It has no memory, so it behaves the same in every analysis.

## Typical uses

- Voltage dividers that set a bias point or scale a signal.
- Current limiting, for example in series with an LED or a base.
- Pull-up and pull-down resistors that give a node a defined DC level.
- Load resistances, and the source resistance of a real signal source.
- Feedback networks around an op-amp.

## How it works

Ohm's law says the current through a resistor is proportional to the voltage across it. If you push twice the voltage across $10\ \text{k}\Omega$, twice the current flows, and the power turned into heat is the product of the two.

Nodal treats the resistor as a pure conductance $g = 1/R$ between its two pins. The same stamp is used for the operating point, for each Newton iteration, for AC and for every transient step, because nothing about the element depends on frequency, time or the solution.

The model leaves out everything a real resistor does besides resisting. There is no temperature coefficient (the simulation temperature is fixed), no voltage coefficient, no parasitic inductance or capacitance and no thermal noise. If you need a lead inductance, add an [inductor](#/codex/inductor) in series.

A resistance of zero or less is rejected when the circuit is checked, because it would need an infinite conductance. To model a short, use a 0 V [voltage source](#/codex/vsource).

## Equations

With $v = v_{n^+} - v_{n^-}$ and the current $i$ taken from $n^+$ through the element to $n^-$:

$$
i = g\,v, \qquad g = \dfrac{1}{R}
$$

The current is the conductance times the voltage, and it flows from the more positive pin to the less positive one.

The power dissipated is

$$
P = v\,i = \dfrac{v^2}{R}
$$

which is always positive for positive $R$.

In AC analysis the resistor has the same real admittance $g$, with no imaginary part.

{{parameters}}

## In the MNA system

A resistor needs no branch current. It adds its conductance to the four entries of the node-voltage block that join its two nodes:

$$
\begin{bmatrix}
 & n^+ & n^- \\
n^+ & +g & -g \\
n^- & -g & +g
\end{bmatrix}
$$

The right-hand side is untouched. Any entry that names ground is skipped, so a resistor to ground adds only $+g$ to one diagonal entry.

The same pattern is the template for every conductance in the system: the capacitor companion in transient, the switch, and the linearised junctions of the semiconductor models all use it.

## Differences from ngspice

Nodal rejects a resistance of zero or less. ngspice accepts a negative resistance and replaces a resistance of exactly zero with 1 mΩ (`resparam.c`), so such a netlist runs there but not here. The resistor takes only a value: there is no model card, no temperature coefficient and no instance multiplier.
