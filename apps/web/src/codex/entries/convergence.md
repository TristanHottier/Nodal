# Newton iteration and convergence aids

## What it is

Circuits with diodes or transistors give nonlinear equations, which cannot be solved in one step. Nodal solves them with Newton iteration, the method every SPICE-class simulator uses. It guesses a solution, replaces each nonlinear device with a linear model valid near that guess, solves the resulting linear system, and repeats with the new answer as the guess.

Newton iteration can fail to converge, or run into a matrix it cannot solve. This entry describes how Nodal decides it has converged and what it does when it has not.

## Equations

### The iteration

At iterate $x^{(k)}$ every device stamps its linearised companion model, a conductance $g$ in parallel with a constant current $I_{eq}$. The solver then solves

$$
A(x^{(k)})\, x^{(k+1)} = b(x^{(k)})
$$

for the next iterate. This is Newton–Raphson written in the same shape as the linear system, so the stamps from [MNA](#/codex/mna) are reused unchanged.

### The convergence test

Iteration $k+1$ has converged when two tests hold. First, every unknown has settled:

$$
|x_j^{(k+1)} - x_j^{(k)}| \le \text{reltol}\cdot\max\!\left(|x_j^{(k+1)}|, |x_j^{(k)}|\right) + \text{tol}_j
$$

The absolute part $\text{tol}_j$ is `vntol` for a node voltage and `abstol` for a branch current. The relative part makes the test scale with the size of the signal.

Second, every nonlinear device's current as predicted by its linear model must match the current recomputed from the new voltages, within $\text{reltol}\cdot\max(|I_{pred}|, |I_{new}|) + \text{abstol}$. This catches a case where the voltages barely move but the device is still far from its true operating point. In addition, no device may have applied limiting during the iteration.

### Junction limiting

An exponential diode current is the main cause of trouble. If Newton proposes a forward voltage of several volts, the linear model predicts an enormous current and the next iterate overshoots. Nodal ports the SPICE limiting routines, which clamp the step a device is allowed to take between iterations.

`pnjlim` limits a pn-junction voltage. When the new voltage is above the junction's critical voltage and has jumped by more than two thermal voltages, the step is compressed logarithmically, so a large jump becomes a modest one. A large step towards reverse bias is also bounded. `fetlim` does the same for a MOSFET gate voltage around its threshold: the gate may not cross from off to well on in one iteration, and the allowed step depends on which region the old voltage was in. When a device limits, that iteration cannot count as converged, so limiting never hides a wrong answer.

### Iteration limits

A DC solve gets up to 100 iterations (`itl1`). In a transient run each time point gets 10 iterations (`itl4`). If that fails, the step is cut by a factor of 8 and tried again, restarting from the last accepted point.

### DC fallbacks

If plain Newton from zero does not converge, the operating point tries two further methods in order.

Gmin stepping adds a large conductance from every node to ground, starting at $10^{-2}$ S. This makes the circuit nearly linear, so Newton succeeds. The added conductance is then reduced, reusing each solution as the next starting point, until it reaches the circuit's `gmin`. The reduction factor is 10 at first and shrinks after a failed attempt.

Source stepping scales every independent source by a factor $\alpha$ and raises $\alpha$ from 0 to 1. At $\alpha = 0$ nothing is driven and the solution is trivial. Each solution is the starting point for the next, and the increment is reduced when a solve fails.

If a nodeset is given, it is held through the first solve as a strong conductance to the nodeset value and then released. It chooses between several valid solutions, for example the state of a latch, but it does not constrain the final answer.

### Singular systems

A singular matrix means the linear solve found a pivot that is zero or negligibly small compared with its column, so the equations do not determine the unknowns. The error names the node or branch of the offending row. A DC floating node or a source loop is caught before any iteration. A singular matrix can also appear in the middle of Newton iteration, for example when many transistor stages all sit at mid-rail and their gains multiply. Nodal treats that like any other failed run and moves on to gmin and source stepping. If every method fails, the message names the five unknowns with the largest last update and the five nodes with the largest KCL residual, which usually point to the part of the circuit that is misbehaving.

## Where Nodal uses it

The [operating point](#/codex/operating-point) runs the full sequence of plain Newton, gmin stepping and source stepping. The [DC sweep](#/codex/dc-sweep) starts each point from the previous solution and falls back to the same methods. [Transient analysis](#/codex/transient) uses the per-point limit and step cutting. The devices that need limiting are the [diode](#/codex/diode), the [NPN](#/codex/npn) and [PNP](#/codex/pnp) transistors, and the [NMOS](#/codex/nmos) and [PMOS](#/codex/pmos) transistors.
