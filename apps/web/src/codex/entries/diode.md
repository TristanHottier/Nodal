# Diode

## What it is

A diode passes current easily from anode to cathode and almost blocks it the other way. Nodal models it as an ideal exponential junction with an optional series resistance, a voltage-dependent depletion capacitance and a diffusion charge. It follows the SPICE junction diode (ngspice `dioload.c`).

## Typical uses

- Rectifying an AC source into a pulsating DC voltage.
- Clamping or clipping a signal at a fixed forward drop.
- Freewheeling across an inductor or relay coil when the current is switched off.
- Isolating two supplies (diode-OR) so that current flows only one way.
- A varactor-like capacitance that changes with reverse voltage.

## How it works

A forward-biased junction injects carriers across the depletion region, and the current grows by a factor of $e$ for every $N V_t$ of extra voltage, about 26 mV at room temperature when $N = 1$. A reverse-biased junction passes only a tiny saturation current. Nodal fixes the temperature at 27 °C, so $V_t = 0.025864917007$ V.

Three effects are added to the bare exponential.

Series resistance. When `RS` is greater than zero, Nodal adds an internal node between the anode and the junction. The resistor `RS` sits between the anode and that node, and the exponential junction sits between the internal node and the cathode. When `RS` is zero no internal node exists.

Charge storage. The depletion region behaves like a capacitor whose value rises as forward bias approaches the junction potential `VJ`. The power law diverges at $V_d = V_J$, so above $F_C V_J$ Nodal continues it as a straight line in $C_j$ (the SPICE rule). Carriers stored in the neutral regions add a diffusion charge, proportional to the current through the transit time `TT`.

A small conductance gmin (see the circuit options) sits in parallel with the junction, as in SPICE. It keeps the matrix well conditioned when the diode is off.

Newton's method on an exponential can overshoot badly: one step may ask for a junction voltage of several volts, and the exponential then overflows. Nodal limits the junction voltage step with SPICE's pnjlim. If the new voltage is above a critical value and has jumped by more than $2 N V_t$, the step is replaced by a logarithmic compression of the jump, so the voltage creeps up instead of leaping. On the reverse side a very negative step is clamped to a floor: $2V_{old} - 1$ when the old voltage is zero or negative, and $-V_{old} - 1$ when it is positive. An iteration in which the voltage was limited cannot count as converged.

The model leaves out reverse breakdown (a model card that sets it is rejected), high-level injection, recombination current and temperature scaling.

## Equations

With $V_d$ = anode minus cathode, taken across the junction itself (internal node to cathode when `RS` is set):

$$I_d = I_S\left(e^{V_d/(N V_t)} - 1\right)$$

This is the textbook law. Nodal's current adds gmin and changes form below $-3\,nV_t$, as below.

Writing $nV_t = N V_t$, for $V_d \ge -3\,nV_t$:

$$I_d = I_S\left(e^{V_d / nV_t} - 1\right) + g_{min} V_d,\qquad g_d = \dfrac{I_S}{nV_t}\, e^{V_d / nV_t} + g_{min}$$

Here $g_d = dI_d/dV_d$ is the small-signal conductance of the junction. Below $-3\,nV_t$ the current follows a cubic form that also tends to $-I_S$, but more slowly than the exponential, and keeps a nonzero conductance:

$$a = \left(\dfrac{3\,nV_t}{e\,V_d}\right)^3,\qquad I_d = -I_S\,(1 + a) + g_{min} V_d,\qquad g_d = \dfrac{3\,I_S\,a}{V_d} + g_{min}$$

Here $e = 2.71828\ldots$ is Euler's number. Both pieces join continuously at $-3\,nV_t$, and the conductance stays positive.

The operating regions follow from this: forward (exponential growth), reverse (current close to $-I_S$) and the transition near zero bias.

Depletion charge for $V_d < F_C V_J$:

$$Q_j = \dfrac{C_{J0}\,V_J}{1-M}\left[1 - \left(1 - \dfrac{V_d}{V_J}\right)^{1-M}\right],\qquad C_j = \dfrac{C_{J0}}{\left(1 - V_d/V_J\right)^{M}}$$

The capacitance $C_j$ is $dQ_j/dV_d$ and equals `CJO` at zero bias. For $V_d \ge F_C V_J$ the capacitance is linearised:

$$C_j = \dfrac{C_{J0}}{F_2}\left(F_3 + \dfrac{M\,V_d}{V_J}\right),\qquad F_2 = (1-F_C)^{1+M},\quad F_3 = 1 - F_C(1+M)$$

$Q_j$ is the integral of this expression and is continuous at $V_d = F_C V_J$. The grading coefficient `M` must lie in [0, 0.9]; ngspice-42 limits it to 0.9, so Nodal rejects larger values.

Total charge and small-signal capacitance:

$$Q_d = T_T\, I_d + Q_j(V_d),\qquad C = \dfrac{dQ_d}{dV_d} = T_T\, g_d + C_j(V_d)$$

The diffusion term uses the same $I_d$ and $g_d$ as above, so it includes the gmin terms, as `cd` and `gd` do in `dioload.c`. In AC analysis $C$ is evaluated at the junction voltage stored by the last Newton load and appears as an admittance $j\omega C$ in parallel with $g_d$.

{{parameters}}

## In the MNA system

Let $p$ be the junction node (the internal node when $R_S > 0$, otherwise the anode $a$) and $c$ the cathode. At Newton iterate $k$, with $V_d^{(k)}$ the limited junction voltage, the diode is replaced by its tangent (see [linearised elements in MNA](#/codex/mna)):

$$I_{eq} = I_d - g_d V_d^{(k)}$$

$$\begin{bmatrix} \ddots & & \\ & g_d & -g_d \\ & -g_d & g_d \end{bmatrix}\begin{bmatrix} v_p \\ v_c \end{bmatrix} = \begin{bmatrix} -I_{eq} \\ +I_{eq} \end{bmatrix}$$

The matrix entries are added at $(p,p)$, $(c,c)$ with $+g_d$ and at $(p,c)$, $(c,p)$ with $-g_d$. The right-hand side gets $-I_{eq}$ at row $p$ and $+I_{eq}$ at row $c$.

With $R_S > 0$ the conductance $g_{RS} = 1/R_S$ is also stamped between $a$ and $p$: $+g_{RS}$ at $(a,a)$ and $(p,p)$, $-g_{RS}$ at $(a,p)$ and $(p,a)$, nothing on the right-hand side.

In a transient step the integrator adds to the junction stamp $g_{eq} = a_0 C$ and an equivalent current $i_q$ from the charge $Q_d$, so $g_d \leftarrow g_d + g_{eq}$ and $I_d \leftarrow I_d + i_q$. Integrating the charge, not the capacitance, conserves charge. In AC analysis $G$ takes $g_d$ and the reactive matrix takes $C$, in the same four positions as $g_d$.

## Differences from ngspice

Nodal follows ngspice-42 `dioload.c` for the junction current, the charge block and pnjlim, and `dioconv.c` for convergence, with these differences.

- Reverse breakdown (BV and IBV), high injection, recombination currents and temperature parameters are not supported. A model card that sets them is rejected instead of ignored.
- `M` is accepted only in [0, 0.9], the limit ngspice-42 applies after warning.
- In every analysis the convergence test compares the predicted current with the current recomputed at the new junction voltage, where `dioconv.c` compares it with the stored current. In a transient step the recomputed current includes the charge current, and the tolerance gains a rounding allowance for it, which would otherwise stop Newton at steps of a few $10^{-13}$ s after a sharp edge.
- The `MODEINITTRAN` copy of the charge into the history has no counterpart. The transient driver seeds the history with $Q_d$ at the operating point, which gives the same first step.
