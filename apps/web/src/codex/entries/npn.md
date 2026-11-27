# NPN transistor

## What it is

An NPN bipolar junction transistor has three terminals: collector, base and emitter. A small current into the base controls a much larger current into the collector, so the part works as an amplifier or as a switch. Nodal implements a subset of the Gummel–Poon model, in its transport form.

## Typical uses

- Common-emitter and emitter-follower amplifier stages.
- Differential pairs and current mirrors.
- Low-side switches that drive relays, LEDs or other loads from a logic signal.
- Simple logic gates and level shifters.
- Bias circuits that rely on the exponential base-emitter law, such as bandgap-style references.

## How it works

The base-emitter junction behaves like a diode. When it is forward biased by about 0.6 V to 0.7 V, electrons flow from the emitter into the base. The base is thin, so most of them are swept across the reverse-biased base-collector junction and become collector current. Only a small fraction recombines in the base and appears as base current. The ratio of the two is the current gain, set by `BF`.

Nodal describes this with two junction currents, a forward one controlled by $V_{be}$ and a reverse one controlled by $V_{bc}$. Their difference is the transport current from collector to emitter, and each junction also leaks a base current scaled by `BF` or `BR`. The model has four regions:

- Forward active: base-emitter forward biased, base-collector reverse biased. The collector current is about $\beta_F$ times the base current. This is the amplifier region.
- Saturation: both junctions forward biased. The collector current no longer follows the base current. This is the closed-switch state.
- Cutoff: both junctions reverse biased. Only leakage flows.
- Reverse active: base-collector forward biased, base-emitter reverse biased. The roles of collector and emitter swap, with the gain set by `BR`.

As the collector voltage rises, the neutral base gets narrower and the collector current creeps up. The Early voltage `VAF` models this as a straight-line increase of current with $V_{ce}$ in forward active operation. Charge storage adds capacitances that limit speed.

The model leaves out several effects. There are no base, collector or emitter series resistances, no high-injection roll-off, no recombination currents, no reverse Early effect, no breakdown and no quasi-saturation. A model card that sets those parameters is rejected. Temperature is fixed at 27 °C.

## Equations

The junction voltages are $V_{be} = V_b - V_e$ and $V_{bc} = V_b - V_c$. The thermal voltage is $V_t = kT/q$, which is 0.025864917007 V at 300.15 K.

$$
I_F = I_S\left(e^{V_{be}/(N_F V_t)} - 1\right),\qquad
I_R = I_S\left(e^{V_{bc}/(N_R V_t)} - 1\right)
$$

These are the forward and reverse junction currents, with `NF` and `NR` scaling the thermal voltage. Below $-3 N_F V_t$ (forward junction) and $-3 N_R V_t$ (reverse junction) each junction uses the same cubic form as the [diode](#/codex/diode), which tends to $-I_S$, as `bjtload.c` does.

$$
q_b = \dfrac{1}{1 - V_{bc}/V_{AF}}
$$

This is the base-width factor, with $q_b = 1$ when `VAF` is not set.

$$
I_C = \dfrac{I_F - I_R}{q_b} - \dfrac{I_R}{B_R} - g_{min} V_{bc},\qquad
I_B = \dfrac{I_F}{B_F} + \dfrac{I_R}{B_R} + g_{min}\left(V_{be} + V_{bc}\right),\qquad
I_E = -(I_C + I_B)
$$

$I_C$ and $I_B$ are the currents flowing into the collector and base terminals, and $I_E$ is the current into the emitter, so the three sum to zero. In normal forward operation $I_C$ and $I_B$ are positive and $I_E$ is negative. The gmin terms are the leakage conductance placed across each junction, set by the circuit's `gmin` option (see [convergence](#/codex/convergence)).

Small-signal parameters follow from the partial derivatives of these currents. In forward active operation, with $I_C$ the collector current:

$$
g_m \approx \dfrac{I_C}{N_F V_t},\qquad
r_\pi \approx \dfrac{B_F}{g_m},\qquad
r_o \approx \dfrac{V_{AF} - V_{bc}}{I_C}
$$

These are the textbook hybrid-pi values. Nodal uses the exact derivatives, namely $\partial I_C/\partial V_{be}$ and $\partial I_B/\partial V_{be}$ for $g_m$ and $1/r_\pi$, and the $V_{bc}$ derivative of $I_C$ for $1/r_o$.

Charge storage has a depletion part and a diffusion part at each junction. With $C_J$, $V_J$ and $M_J$ the zero-bias capacitance, junction potential and grading coefficient of the junction, the depletion charge $Q_j$ follows the [diode](#/codex/diode) formula. Below $F_C V_J$ the capacitance is

$$
C_j = \dfrac{C_{J}}{\left(1 - V/V_J\right)^{M_J}}
$$

and above $F_C V_J$ it continues linearly as in SPICE. The base-collector charge adds the reverse transit time, and the base-emitter charge adds the forward transit time:

$$
Q_{bc} = T_R\, I_R + Q_{j,bc},\qquad
Q_{be} = \dfrac{T_F\, I_F}{q_b} + Q_{j,be}\quad(T_F \ne 0,\ V_{be} > 0)
$$

When $T_F = 0$ or $V_{be} \le 0$, the base-emitter diffusion term is $T_F I_F$ with no division by $q_b$. The charge in $Q_{be}$ depends on $V_{bc}$ through $q_b$, which gives a transcapacitance $\partial Q_{be}/\partial V_{bc} = -T_F I_F/V_{AF}$ that is zero without an Early voltage. Nodal integrates charge rather than capacitance, so the transient and AC results use the same $Q(V)$.

Newton iterations limit each junction voltage with pnjlim, which stops an exponential from overshooting. The critical voltage differs per junction:

$$
V_{crit,be} = N_F V_t \ln\!\left(\dfrac{N_F V_t}{\sqrt{2}\, I_S}\right),\qquad
V_{crit,bc} = N_R V_t \ln\!\left(\dfrac{N_R V_t}{\sqrt{2}\, I_S}\right)
$$

{{parameters}}

## In the MNA system

Let $a = \partial I_C/\partial V_{be}$, $b = \partial I_C/\partial V_{bc}$, $c = \partial I_B/\partial V_{be}$ and $d = \partial I_B/\partial V_{bc}$, all at the limited junction voltages of the Newton iterate. Since $V_{be} = V_b - V_e$ and $V_{bc} = V_b - V_c$, the terminal currents have these derivatives with respect to the node voltages:

$$
\begin{bmatrix} \partial I_C/\partial V_c & \partial I_C/\partial V_b & \partial I_C/\partial V_e \\
\partial I_B/\partial V_c & \partial I_B/\partial V_b & \partial I_B/\partial V_e \\
\partial I_E/\partial V_c & \partial I_E/\partial V_b & \partial I_E/\partial V_e \end{bmatrix}
=
\begin{bmatrix} -b & a + b & -a \\ -d & c + d & -c \\ b + d & -(a + b + c + d) & a + c \end{bmatrix}
$$

These nine entries are added to the rows and columns of the collector, base and emitter nodes. The constant parts move to the right-hand side:

$$
I_{C,eq} = I_C - a V_{be} - b V_{bc},\qquad I_{B,eq} = I_B - c V_{be} - d V_{bc}
$$

The right-hand side gets $-I_{C,eq}$ at the collector row, $-I_{B,eq}$ at the base row and $I_{C,eq} + I_{B,eq}$ at the emitter row. This is the Newton companion model described in [MNA](#/codex/mna), with one transconductance per controlling voltage.

The substrate is ground. For an NPN the substrate junction is the vertical one, so the only substrate term is a conductance $g_{min}$ from the collector to ground. It is linear, so it adds $g_{min}$ to the collector diagonal and nothing to the right-hand side.

In AC analysis the matrix $G$ holds the same conductances at the stored operating point. The charge Jacobian adds $C_{be} = \partial Q_{be}/\partial V_{be}$ between base and emitter, $C_{bc} = \partial Q_{bc}/\partial V_{bc}$ between base and collector, and the transcapacitance $C_x = \partial Q_{be}/\partial V_{bc}$ at base-base ($+$), base-collector ($-$), emitter-collector ($+$) and emitter-base ($-$). In a transient step, with $i_{q,be}$ and $i_{q,bc}$ the integrator currents of $Q_{be}$ and $Q_{bc}$, the base current gains $i_{q,be} + i_{q,bc}$ and the collector current loses $i_{q,bc}$. The partials change as $\partial I_B/\partial V_{be} \mathrel{+}= a_0 C_{be}$, $\partial I_B/\partial V_{bc} \mathrel{+}= a_0 (C_{bc} + C_x)$ and $\partial I_C/\partial V_{bc} \mathrel{-}= a_0 C_{bc}$, where $a_0$ is the integration coefficient and $C_x = \partial Q_{be}/\partial V_{bc}$ is the transcapacitance defined above.

## Differences from ngspice

Nodal follows `bjtload.c` and `bjtacld.c` for the equations above, with these differences.

- Parasitic series resistances, high injection, recombination currents, the reverse Early voltage, breakdown and quasi-saturation are not modelled. A model card that sets them is rejected.
- The limiting uses $N_F V_t$ and $N_R V_t$ in pnjlim and in the critical voltage of each junction. ngspice-42 (`bjtload.c`, `bjttemp.c`) uses one critical voltage, $V_t \ln(V_t/(\sqrt{2} I_S))$, for both junctions and passes the plain thermal voltage to pnjlim. The two agree when `NF` and `NR` are 1.
- In every analysis the convergence test compares the linear prediction of the currents with the currents recomputed at the new junction voltages, where `bjtconv.c` compares it with the stored currents. In a transient step the recomputed currents also include the charge currents. The diode follows the same rule.
- Temperature is fixed at 27 °C.
