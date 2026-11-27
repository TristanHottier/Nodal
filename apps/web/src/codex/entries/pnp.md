# PNP transistor

## What it is

A PNP bipolar transistor is the polarity mirror of the [NPN](#/codex/npn). Current flows out of the base and the emitter sits at the highest voltage of the three terminals. A small current leaving the base controls a larger current leaving the collector. Nodal models it with the same reduced Gummel–Poon model as the NPN.

## Typical uses

- High-side switches that connect a load to the positive supply.
- Complementary push-pull output stages paired with an NPN.
- Current sources and mirrors that source current from the positive rail.
- Level shifters that pull a node up toward the supply.

## How it works

Every junction voltage, every terminal current and every region condition of the NPN is reversed. In forward active operation the emitter-base junction is forward biased, so $V_{be}$ is negative, and the base-collector junction is reverse biased, so $V_{bc}$ is positive. The collector current leaves the collector terminal, which makes $I_C$ negative in the convention of the NPN entry.

Nodal does not keep a second set of equations. It evaluates the NPN equations at the negated junction voltages and negates the resulting terminal currents. The conductances come out unchanged, because two sign flips cancel. The same model limits as the NPN apply: no series resistances, no high injection, no reverse Early effect, no breakdown.

## Equations

Let $V_{be} = V_b - V_e$ and $V_{bc} = V_b - V_c$ be the physical junction voltages. The transistor is evaluated with $V_{eb} = -V_{be}$ and $V_{cb} = -V_{bc}$:

$$
I_F = I_S\left(e^{V_{eb}/(N_F V_t)} - 1\right),\qquad
I_R = I_S\left(e^{V_{cb}/(N_R V_t)} - 1\right),\qquad
q_b = \dfrac{1}{1 - V_{cb}/V_{AF}}
$$

These are the NPN junction currents and base-width factor, fed with the mirrored voltages.

$$
I_C = -\left[\dfrac{I_F - I_R}{q_b} - \dfrac{I_R}{B_R} - g_{min} V_{cb}\right],\qquad
I_B = -\left[\dfrac{I_F}{B_F} + \dfrac{I_R}{B_R} + g_{min}\left(V_{eb} + V_{cb}\right)\right],\qquad
I_E = -(I_C + I_B)
$$

$I_C$ and $I_B$ still mean the current flowing into the collector and base terminals, so in normal forward operation both are negative and $I_E$ is positive.

The small-signal parameters keep their NPN form and sign. In forward active operation, with $I_C$ now the magnitude of the collector current:

$$
g_m \approx \dfrac{I_C}{N_F V_t},\qquad
r_\pi \approx \dfrac{B_F}{g_m},\qquad
r_o \approx \dfrac{V_{AF} - V_{cb}}{I_C}
$$

Charges are computed in the NPN orientation from $V_{eb}$ and $V_{cb}$, using the depletion and transit-time terms of the [NPN](#/codex/npn) entry. The transient charge currents are negated like the DC currents, and the capacitances keep their sign.

The critical voltage for limiting is applied to the mirrored voltages, with the same per-junction values as the NPN:

$$
V_{crit,be} = N_F V_t \ln\!\left(\dfrac{N_F V_t}{\sqrt{2}\, I_S}\right),\qquad
V_{crit,bc} = N_R V_t \ln\!\left(\dfrac{N_R V_t}{\sqrt{2}\, I_S}\right)
$$

{{parameters}}

## In the MNA system

The node-voltage derivatives are the NPN ones. With $a$, $b$, $c$ and $d$ the partials $\partial I_C/\partial V_{be}$, $\partial I_C/\partial V_{bc}$, $\partial I_B/\partial V_{be}$ and $\partial I_B/\partial V_{bc}$ of the physical currents, the matrix is

$$
\begin{bmatrix} -b & a + b & -a \\ -d & c + d & -c \\ b + d & -(a + b + c + d) & a + c \end{bmatrix}
$$

on the collector, base and emitter rows and columns. The partials of the PNP currents with respect to the physical voltages equal those of the NPN at the mirrored voltages, so the stamp has the NPN form. The right-hand side uses the physical currents, $-I_{C,eq}$ at the collector row, $-I_{B,eq}$ at the base row and $I_{C,eq} + I_{B,eq}$ at the emitter row, with $I_{C,eq} = I_C - a V_{be} - b V_{bc}$ and the matching expression for the base.

The substrate is ground. A PNP defaults to the lateral substrate, so the substrate conductance $g_{min}$ goes from the base to ground. It adds $g_{min}$ to the base diagonal and nothing to the right-hand side. For the NPN it sits at the collector.

## Differences from ngspice

The differences are those of the [NPN](#/codex/npn) entry: no parasitic resistances, high injection, recombination, reverse Early voltage or breakdown, limiting with $N_F V_t$ and $N_R V_t$ per junction, a convergence test that recomputes the currents at the new voltages, and a fixed temperature of 27 °C. The PNP substrate follows the ngspice default of a lateral device, connected at the base.
