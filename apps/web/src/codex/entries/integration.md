# Numerical integration and time-step control

## What it is

A transient simulation steps through time. Capacitors and inductors relate a current to the rate of change of a stored quantity, and the simulator has to turn that derivative into algebra at each time point. An integration method is the rule for doing so.

Time steps are not fixed. Nodal makes them small where the signals change quickly and large where they are smooth, by estimating the error of each step.

## Equations

### Integration methods

For a charge or flux state $q$ with current $i = \dfrac{dq}{dt}$ and step $h = t_{n+1} - t_n$, you pick `method` = trap or gear. Nodal itself uses backward Euler for the first step, after breakpoints and switch state changes, and on a retry after a Newton failure. The three formulas are below.

Backward Euler:

$$
q_{n+1} - q_n = h\, i_{n+1}
$$

It is first order and strongly damps fast transients.

Trapezoidal, the default:

$$
q_{n+1} - q_n = \dfrac{h}{2}\left(i_{n+1} + i_n\right)
$$

It is second order and accurate, but it does not damp a rapidly changing component. After a discontinuity this can show up as a sustained oscillation on alternate steps, called trap ringing. It comes from the method itself.

Gear, which is a second-order backward differentiation formula (BDF2) with variable step. With $\rho = h / h_{n-1}$:

$$
i_{n+1} = \dfrac{1}{h}\left[\dfrac{1+2\rho}{1+\rho}\, q_{n+1} - (1+\rho)\, q_n + \dfrac{\rho^2}{1+\rho}\, q_{n-1}\right]
$$

It is second order like the trapezoidal rule and it damps fast components, so it does not ring. The cost is a little more numerical damping of real oscillations. For both methods the first step at $t = 0$ and the first step after each breakpoint use backward Euler, which removes ringing at those points.

### Companion models

Each formula can be written $i_{n+1} = \alpha_0\, q_{n+1} + (\text{history terms})$. With $C = \dfrac{dq}{dv}$ at the current Newton iterate, a capacitor becomes a conductance in parallel with a current source:

$$
G_{eq} = \alpha_0\, C, \qquad I_{eq} = i_{n+1}^{(k)} - G_{eq}\, v^{(k)}
$$

For a linear capacitor with the trapezoidal rule this is $G_{eq} = \dfrac{2C}{h}$ and, with $v_n$ and $i_n$ from the previous point, $I_{eq} = -\left(\dfrac{2C}{h}\,v_n + i_n\right)$. For backward Euler, $G_{eq} = \dfrac{C}{h}$ and $I_{eq} = -\dfrac{C}{h}\,v_n$. An inductor uses the same formulas with flux $\phi = L\, i$ in its branch row. Nonlinear capacitances are integrated through their charge $Q(V)$ and not as $C(V)\,\dfrac{dV}{dt}$, which keeps charge conserved in switching circuits.

### Step control from truncation error

After each converged point, every charge state proposes a step. With $p$ the method order and $\text{DD}_{p+1}(q)$ the $(p+1)$-th divided difference of $q$ over recent points:

$$
h_{prop} = \left(\dfrac{\text{trtol}\cdot\text{tol}}{\max\big(\text{abstol},\; c_p\,|\text{DD}_{p+1}(q)|\big)}\right)^{1/p}
$$

The tolerance $\text{tol}$ combines `reltol` of the current and charge with the absolute limits `abstol` and `chgtol`. The constant $c_p$ depends on the method and the order. The divided difference estimates the local truncation error (LTE), the error one step would introduce, and the factor `trtol` allows for the estimate being low. The next step is the smaller of $2h$ and the smallest proposal. If it is less than $0.9\,h$, the point is rejected and retried with the smaller step. Otherwise the point is accepted. The step is also limited above by `tmax` and below by a minimum step, and a step that cannot shrink further stops the run with a "time step too small" error.

If Newton fails at a time point, the step is divided by 8 and retried from the last accepted point.

### Breakpoints

Pulse edges, piecewise-linear corners and the start of a sine delay are known in advance. The integrator shortens the step to land exactly on each one rather than stepping over it, then restarts at first order with a small step. Switch threshold crossings are not known in advance, and are found by rejecting a step that crosses them.

## Where Nodal uses it

[Transient analysis](#/codex/transient) uses all of this: integration formula, step control and breakpoints. The reactive elements that need companion models are the [capacitor](#/codex/capacitor) and the [inductor](#/codex/inductor), as well as the junction and gate charges of the semiconductor parts. Each time point is solved with the Newton iteration described in [convergence](#/codex/convergence), and the matrix layout is in [MNA](#/codex/mna).
