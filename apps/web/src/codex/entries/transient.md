# Transient analysis

## What it does

Transient analysis computes node voltages and branch currents as functions of time, from a start state until `tstop`. It handles switching, charging and discharging, oscillation, and any waveform from a [voltage source](#/codex/vsource) or [current source](#/codex/isource).

## How Nodal solves it

Time is divided into steps. At every step, each capacitor and inductor is replaced by a companion model that depends on the previous values, and the circuit is solved with Newton iteration. The companion models are described in [Integration and time-step control](#/codex/integration).

### Starting point

Without `uic`, the run starts from the [operating point](#/codex/operating-point), computed with each waveform source at its value at $t = 0$. A pulse source that is high at $t = 0$ therefore starts the run in the high state.

With `uic`, no operating point is solved. All unknowns start at zero, and the initial conditions `ic` of capacitors and inductors fill in the stored charge and flux. Nodal then takes one very short backward Euler step at $t = 0$, so the first reported point shows the initial voltages and currents. If that step does not converge, the run stops with a time step error at $t = 0$.

### Integration

The integration method is `method`: trapezoidal by default, or Gear (BDF2). Trapezoidal is more accurate but can ring after a sudden change. Gear damps that ringing. For both, the first step and the first step after every breakpoint is backward Euler.

### Step control

After each converged step, Nodal estimates the local truncation error of every capacitor and inductor charge. If the proposed next step is less than 0.9 of the step just taken, the step is rejected and repeated with the smaller step. Otherwise it is accepted, and the next step is at most twice as large. If Newton fails within 10 iterations, the step is divided by 8 and retried from the last accepted solution.

### Breakpoints

Pulse corners, PWL vertices and the start of a sine delay are breakpoints. Nodal never steps across one. It shortens the step to land exactly on it, then restarts at order 1 with a small step. The last point is always exactly `tstop`.

Switch threshold crossings are not breakpoints, since their time is not known in advance. Nodal finds them by rejecting a step in which a switch changes state and retrying just past the crossing.

### Step size limits

The step never exceeds `tmax`. If you leave `tmax` empty, it is the smaller of `tstep` and $(\text{tstop} - \text{tstart})/50$. The smallest allowed step is $10^{-11}\,\text{tmax}$. `tstep` is not the output spacing. Accepted points are reported as computed, with uneven spacing, and the points before `tstart` are computed but not reported.

### Known limitation

If the Newton matrix is singular during a transient run, the run stops with an error. ngspice-42 (`dctran.c`) cuts the step to one eighth and tries again after any iteration failure, a singular matrix included. Nodal does this for the operating point and DC sweep, but not inside the transient loop.

## Equations

For a charge state $q$ with current $i = dq/dt$ and step $h = t_{n+1} - t_n$, the trapezoidal rule is

$$
q_{n+1} - q_n = \dfrac{h}{2}\left(i_{n+1} + i_n\right)
$$

and backward Euler is $q_{n+1} - q_n = h\, i_{n+1}$. A capacitor $C$ then becomes a conductance in parallel with a current source,

$$
G_{eq} = \dfrac{2C}{h},\qquad I_{eq} = -\left(\dfrac{2C}{h}\,v_n + i_n\right)
$$

for the trapezoidal rule, and $G_{eq} = C/h$ with $I_{eq} = -(C/h)\,v_n$ for backward Euler.

The step proposed by the error estimate is

$$
h_{prop} = \left(\dfrac{\text{trtol}\cdot\text{tol}}{\max\big(\text{abstol},\; c_p\,|\text{DD}_{p+1}(q)|\big)}\right)^{1/p}
$$

where $p$ is the method order, $\text{DD}_{p+1}$ is the divided difference of the charge over the last time points, and $c_p$ depends on the method. The new step is the smaller of $2h$ and the smallest $h_{prop}$ over all charge states. See [Integration and time-step control](#/codex/integration) for $\text{tol}$ and the constants.

## Settings

- `tstep`: a nominal step. It sets the default `tmax` and the size of the first step. With `uic` it is also a breakpoint. It is not the spacing of the output.
- `tstop`: the end time, in s.
- `tstart`: the time from which results are reported, in s. The simulation still runs from 0.
- `tmax`: the largest allowed step, in s. Optional.
- `uic`: start from the initial conditions instead of an operating point.

The options `method`, `reltol`, `abstol`, `vntol`, `chgtol`, `trtol` and `gmin` apply. `method` selects trapezoidal or Gear, and `trtol` scales how large an error the step control accepts.

## Common problems

`time step too small at t = ... s (smallest proposed step: C1)`

The error estimate forced the step to its minimum. The named part has a charge that changes too fast. Look for an ideal discontinuity at that time, such as a source edge with a very short rise time, or a switch with a very small on resistance. Lengthen the edge time, or add a series resistance.

`time step too small at t = ... s (Newton did not converge; largest update at V(a))`

Newton failed even at the smallest step. The named unknown was still changing. Check the part connected to that node for a model that has no smooth solution, such as an ideal switch driving a loop of capacitors. With `uic`, at t = 0, check that the initial conditions `ic` are consistent with each other.

`singular system: no unique solution for ...`

The matrix was singular during the run, which stops it. Check for a node that loses its DC path when a switch opens, and add a resistor to ground.

`tran analysis: need tstep > 0 and 0 <= tstart < tstop`

Fix the time fields so that `tstop` is larger than `tstart`.

`tran analysis: more than 1000000 time points`

The run needs too many steps. Raise `tmax`, shorten `tstop`, or remove very fast edges.

Any error from the operating point also appears here when `uic` is off. Use `uic` only when you give `ic` values to the capacitors and inductors.
