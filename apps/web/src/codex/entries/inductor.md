# Inductor

## What it is

An inductor stores energy in a magnetic field. Its voltage is proportional to how fast its current changes, so it passes steady DC freely and resists fast changes. It is the counterpart of the [capacitor](#/codex/capacitor).

## Typical uses

- Energy storage in switching converters.
- LC filters and resonant tanks.
- Chokes that block high-frequency noise on a supply line.
- Loads such as motor windings and relay coils, together with a resistance.
- Impedance matching.

## How it works

Current through a coil builds a magnetic flux $\lambda = L\,i$. A voltage appears across the coil only while that flux is changing. With a steady current the voltage is zero, so at DC an inductor is a short circuit. When the current tries to change quickly, the coil pushes back with a large voltage, so at high frequency it looks like an open circuit.

Nodal gives the inductor its own unknown, the branch current $i_k$. This costs one extra row, and it makes the inductor current directly probeable. The branch row depends on the analysis. In DC it forces the two node voltages to be equal. In AC it carries $j\omega L$. In a transient step it carries a companion term built from the integration formula.

Because a DC inductor is a short, a loop made only of inductors and voltage sources has no unique current, and the circuit check rejects it (see [ground](#/codex/ground)).

The model is an ideal, linear inductor. It has no winding resistance, no core saturation, no parasitic capacitance and no coupling to other inductors.

## Equations

With $v = v_{n^+} - v_{n^-}$ and $i_k$ the branch current from $n^+$ through the coil to $n^-$:

$$
v = L\,\dfrac{di_k}{dt}
$$

The voltage across the coil is the inductance times the rate of change of its current.

In AC analysis the impedance is

$$
Z = j\omega L
$$

so the voltage leads the current by 90 degrees and grows with frequency.

In a transient step of length $h$, with $i_{k,n}$ and $v_n$ the current and voltage at the previous accepted point, trapezoidal integration gives the branch row

$$
v_{n^+} - v_{n^-} - \dfrac{2L}{h}\,i_{k,n+1} = -\dfrac{2L}{h}\,i_{k,n} - v_n
$$

and backward Euler gives

$$
v_{n^+} - v_{n^-} - \dfrac{L}{h}\,i_{k,n+1} = -\dfrac{L}{h}\,i_{k,n}
$$

Nodal integrates the flux $L\,i_k$. See [integration](#/codex/integration) for the formulas, the Gear option and the step control.

The initial condition `ic` is the coil current from $n^+$ to $n^-$ at the start of a transient run, and it is used only with `uic`. Without `uic` the run starts from the operating point, where the inductor current is whatever the circuit gives it. With `uic` all unknowns start at zero and the stored flux starts at $L$ times `ic`, or zero if `ic` is empty.

{{parameters}}

## In the MNA system

The inductor adds the unknown $i_k$. Its KCL columns are those of a voltage source, $+1$ in row $n^+$ and $-1$ in row $n^-$, and its branch row $k$ is:

| Analysis | $n^+$ | $n^-$ | $i_k$ | $b_k$ |
|---|---|---|---|---|
| DC | $+1$ | $-1$ | $0$ | $0$ |
| AC | $+1$ | $-1$ | $-j\omega L$ | $0$ |
| Transient, trapezoidal | $+1$ | $-1$ | $-\dfrac{2L}{h}$ | $-\dfrac{2L}{h}\,i_{k,n} - v_n$ |
| Transient, backward Euler | $+1$ | $-1$ | $-\dfrac{L}{h}$ | $-\dfrac{L}{h}\,i_{k,n}$ |

In AC the reactive matrix holds $-L$ on the diagonal entry of row $k$, so that $G + j\omega C$ reproduces the row above.

## Differences from ngspice

Nodal follows ngspice-42 `indload.c` for the transient row and `indacld.c` for AC. The element takes only an inductance and an initial current. Mutual inductance, temperature coefficients and the instance multiplier are not supported. As in ngspice, `ic` matters only with `uic`. With `uic`, Nodal also reports a $t = 0$ point, which ngspice does not.
