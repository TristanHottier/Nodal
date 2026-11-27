# Operating point

## What it does

The operating point is the DC solution of the circuit: every node voltage and every branch current when all sources are constant, capacitors are open circuits and inductors are short circuits. It is the starting point for the other analyses. [AC analysis](#/codex/ac-analysis) linearises the circuit around it, and [transient analysis](#/codex/transient) starts from it unless `uic` is set.

Nodal reports node voltages for every named node and branch currents for voltage sources, [VCVS](#/codex/vcvs), [CCVS](#/codex/ccvs) and inductors.

## How Nodal solves it

For a circuit with only linear parts, one linear solve gives the answer. With diodes, transistors or other nonlinear parts, Nodal uses Newton iteration (see [Newton and convergence aids](#/codex/convergence)). Each pass replaces every nonlinear part by its tangent line at the current guess, solves the resulting linear system, and repeats until the guess stops changing.

Before any iteration, Nodal checks the topology. A node with no DC path to ground, or a loop made only of voltage sources, VCVS or CCVS outputs and inductors, is reported as an error without running the solver.

Nodal tries three stages in this order. The second and third run only if the stage before fails.

1. Plain Newton from all unknowns at zero. If the netlist carries a `nodeset`, the listed nodes are held near their given values during the first iterations, and the hold is then released. A nodeset picks among several valid solutions, such as the two states of a latch. It does not constrain the final answer. The analysis editor has no field for it.
2. gmin stepping. A large conductance (start at 0.01 S) is added from every node to ground. The circuit is solved, the conductance is divided by 10, and the previous solution is the next starting guess. This continues until it reaches the `gmin` option. If a step fails, the factor is made smaller, and it can grow back up to 10 after steps that succeed.
3. Source stepping. All independent sources are scaled by a factor that ramps from 0 to 1. Each step starts from the previous solution, and the increment shrinks if a step fails.

A singular matrix in any of these runs counts as a failed run, and the next fallback is tried. If all three fail, Nodal reports the failure with the unknowns that changed most and the nodes with the largest current imbalance. If plain Newton ended on a singular matrix, that error is reported instead.

## Equations

Each Newton pass solves the linear system

$$
A(x^{(k)})\, x^{(k+1)} = b(x^{(k)})
$$

where $x$ holds the node voltages and branch currents, and $A$ and $b$ come from stamping each part's linearised model at $x^{(k)}$.

The iteration has converged when every unknown satisfies

$$
|x_j^{(k+1)} - x_j^{(k)}| \le \text{reltol}\cdot\max\!\left(|x_j^{(k+1)}|, |x_j^{(k)}|\right) + \text{tol}_j
$$

with $\text{tol}_j$ equal to `vntol` for a node voltage and `abstol` for a branch current. The current of each nonlinear part, predicted by its tangent, must also agree with the current recomputed at the new voltages within $\text{reltol}\cdot\max(|I_{pred}|, |I_{new}|) + \text{abstol}$. No part may have limited its voltage step during the pass. Plain Newton gives up after 100 passes.

## Settings

The operating point has no fields of its own. The solver options below apply to it, and they are shared with the other analyses.

- `reltol`: relative tolerance in the convergence test.
- `vntol`: absolute tolerance for node voltages.
- `abstol`: absolute tolerance for currents.
- `gmin`: the conductance placed across every pn junction, the value gmin stepping ends at, and the default of the switch off resistance (1/gmin).

Leave an option empty to use the engine default, which the field shows as a hint.

## Common problems

`DC operating point did not converge after gmin and source stepping; largest updates: ...; largest KCL residuals: ...`

All three stages failed. The lists name up to five unknowns that were still changing and up to five nodes where the currents did not balance. Look at the parts around the first names. Causes can include a feedback loop with no stable DC state, an ideal switch or diode with no resistance in series, or a source value far outside what a model allows.

`floating nodes with no DC path to ground: ... (connected elements: ...)`

A node reaches ground only through capacitors or current sources, so its DC voltage is undefined. Add a resistor to ground, or a DC path through some other part.

`loop of voltage sources and inductors: ...`

The listed elements form a closed loop with no resistance, so their currents cannot be determined. Add a series resistance to break the loop.

`singular system: no unique solution for ...`

The matrix has no unique solution at the named unknown. This is reported only after the fallbacks also failed. Check the connections of the named node or branch.
