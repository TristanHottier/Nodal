# DC sweep

## What it does

A DC sweep steps the DC value of one independent source from a start value to a stop value, and solves the [operating point](#/codex/operating-point) at every step. The result is a curve of every node voltage and branch current against the swept value. Typical results are a transfer characteristic, a diode curve, or the output curves of a transistor.

The swept source can be a voltage source or a current source. Its original value is restored after the run, also when a point fails.

## How Nodal solves it

The points are computed in order. The first point is solved exactly like an operating point, with the full fallback chain. Every later point is a warm start: Newton begins from the previous point's solution and device state instead of from zero. Neighbouring points are close, so this usually takes a few iterations and follows one branch of a curve smoothly.

If the warm start fails at a point, Nodal falls back to the cold chain for that point: plain Newton from zero, then gmin stepping, then source stepping, as for the operating point. The next point is warm-started from whatever that produced. A singular matrix in the warm start counts as a failure and also falls back to the cold chain.

The sweep stops at the first point where every stage fails, and the error names the source and the value.

Circuits with memory in their DC state, such as a latch, can show hysteresis, because each point starts from the previous one. Sweeping up and sweeping down can give different curves.

## Equations

The swept values are

$$
x_i = \text{start} + i\cdot\text{step},\qquad i = 0, 1, \dots, n-1,\qquad n = \mathrm{round}\!\left(\dfrac{\text{stop} - \text{start}}{\text{step}}\right) + 1
$$

The step may be negative to sweep downwards. The step must land on stop: a step that does not divide the range is rejected. At each point Nodal solves

$$
A(x^{(k)})\, x^{(k+1)} = b(x^{(k)})
$$

with the swept source set to $x_i$, using the convergence test given in [Operating point](#/codex/operating-point).

## Settings

- `source`: the independent voltage or current source to sweep.
- `start`: the first value.
- `stop`: the last value.
- `step`: the increment between points. It must not be 0, and the sign must point from `start` toward `stop`.

The solver options `reltol`, `vntol`, `abstol` and `gmin` apply as for the operating point.

## Common problems

`analysis dc: unknown source ...` and `analysis dc: source ... is not an independent source`

The `source` field must name a voltage or current source in the circuit. Select one from the list.

`analysis dc: step must not be zero`

Enter a nonzero `step`.

`analysis dc: step ... does not reach stop ... from start ...`

The range is not a whole number of steps, or the step points the wrong way. Change `step` so that `stop - start` is a whole multiple of it, with the same sign.

`analysis dc: sweep has more than 1000000 points`

Use a larger `step`.

`dc sweep of ... failed at ...: <cause>`

One point failed, and the cause follows the colon, for example a non-convergence message. Run an [operating point](#/codex/operating-point) with the source set to that value to see the same failure alone. A point that fails in a circuit with a sharp feature, such as a switch threshold or a latch that flips, often passes with a smaller `step`.
