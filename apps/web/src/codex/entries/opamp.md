# Operational amplifier

## What it is

The op-amp in Nodal is an ideal amplifier with very high gain and no supply pins. It measures the voltage between its two inputs and drives its output to that difference times the gain. It is the part to use when you want to study feedback networks and don't care about the amplifier's own limits.

## Typical uses

- Inverting and non-inverting amplifiers.
- Summing amplifiers, integrators and differentiators.
- Active filters.
- Buffers and difference amplifiers.

## How it works

The part has three pins: `inn` (inverting input), `inp` (non-inverting input) and `out`. There are no supply pins.

In the netlist the op-amp is a voltage-controlled voltage source, SPICE element `E`, named `E` followed by the part name. Its output pair is the `out` pin and node 0, ground. Its control pair is `inp` and `inn`. The output voltage is therefore always measured against ground, and the output current flows to ground through the source. Every circuit with an op-amp needs a ground part.

The inputs draw no current. With a large gain and negative feedback, the voltage between the inputs ends up close to zero. That is the usual "virtual short" rule, which is only the limit of a finite gain.

This is a macro, not a device model. It leaves out:

- supply rails: the output can reach any voltage, including values far beyond what a real op-amp could produce;
- slew rate, so the output can change at any speed;
- finite bandwidth: the gain is the same at every frequency and adds no phase shift;
- input offset voltage, input bias current, input and output resistance;
- output current limits.

## Equations

$$
v_{out} = A\,(v_{inp} - v_{inn})
$$

The output equals the gain $A$ times the voltage between the non-inverting and inverting inputs. The `Gain` field sets $A$. Its default is large, but finite: see the table.

For a non-inverting amplifier, let $R_f$ be the resistor from `out` to `inn` and $R_g$ the resistor from `inn` to ground, with the input applied at `inp`. The closed-loop gain is:

$$
\dfrac{v_{out}}{v_{in}} = \dfrac{1 + R_f/R_g}{1 + \dfrac{1 + R_f/R_g}{A}}
$$

For large $A$ this tends to $1 + R_f/R_g$. This is the textbook result, shown to indicate the size of the error caused by finite $A$. Nodal does not use this formula: it solves the circuit directly.

The equation holds in DC, AC and transient analysis. $A$ is real and constant, so AC analysis shows no gain roll-off.

{{parameters}}

## In the MNA system

The op-amp is a VCVS with output $(n_{out}, 0)$ and control pair $(n_{+in}, n_{-in})$, so $\mu = A$. It adds a branch current $i_k$. The KCL row gets $+1$ in row $n_{out}$, column $k$. There is no entry for ground. Branch row $k$:

$$
\begin{array}{cccc|c}
n_{out} & n_{+in} & n_{-in} & & b \\ \hline
+1 & -A & +A & & 0
\end{array}
$$

This encodes $v_{out} - A\,(v_{inp} - v_{inn}) = 0$. The input nodes get no entries in the KCL rows, which is how the inputs draw no current.

## Differences from ngspice

The op-amp is a VCVS with its output referenced to ground and no supply rails, so it maps to the standard SPICE `E` element. It differs from a real op-amp only in the limits listed under "How it works".
