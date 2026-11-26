# Small-signal linearisation

## What it is

Small-signal analysis asks how a circuit responds to a tiny signal on top of its steady DC state. For a tiny signal every smooth nonlinear device behaves like a linear one, so the circuit can be replaced by a linear network and solved for each frequency without simulating a waveform.

[AC analysis](#/codex/ac-analysis) is built on this. It gives gain, phase and impedance against frequency quickly and exactly, within the limits below.

## Equations

### Linearising at the operating point

First the [operating point](#/codex/operating-point) is solved. Around it a nonlinear branch current is approximated by its tangent:

$$
I(V_0 + v) \approx I(V_0) + g\,v, \qquad g = \left.\dfrac{\partial I}{\partial V}\right|_{V_0}
$$

Here $V_0$ is the DC voltage and $v$ the small deviation. The constant term belongs to the DC solution, so only the conductance $g$ remains for the small signal. A diode becomes a resistor whose value depends on its bias current, and a transistor becomes a set of transconductances and output conductances.

Charge storage is linearised the same way. A junction or gate charge $Q(V)$ gives a capacitance $C = \dfrac{\partial Q}{\partial V}$ at the operating point.

### The complex system

Collect the conductances in a matrix $G$ and the capacitances in a matrix $C$. For each angular frequency $\omega = 2\pi f$ Nodal solves

$$
(G + j\omega C)\,x = b_{ac}
$$

The matrix $G$ is the Jacobian at the operating point plus the linear conductances. The matrix $C$ also holds $-L$ on the branch row of each inductor, so that $G + j\omega C$ reproduces the inductor equation $v_{n^+} - v_{n^-} - j\omega L\, i_k = 0$. The right-hand side $b_{ac}$ holds one phasor $\text{mag}\, e^{j\varphi}$ for each source that has an AC value. A source without one contributes zero, so a DC supply has no small-signal response and acts like a short circuit for voltage sources and an open circuit for current sources. $G$ and $C$ are assembled once, and only the complex sum is refactored at each frequency.

The unknowns are phasors: complex numbers whose magnitude and angle give the amplitude and phase of a sinusoid at that frequency, relative to the source phasor.

### What the result means and does not mean

The output is the response to an excitation of the size you specify, scaled linearly. An AC source of 1 V magnitude does not mean a 1 V swing is applied to the circuit. The analysis assumes the real signal is small enough for the tangent to hold, and it never checks that.

Because the system is linear, an AC sweep shows no clipping, no distortion and no saturation. An amplifier biased near a rail shows its full small-signal gain even if a real signal of that size would clip. Harmonics are not computed. The result also depends on the operating point: change the bias and the gains change. Switches keep the state they had at the operating point.

## Where Nodal uses it

[AC analysis](#/codex/ac-analysis) solves the complex system over the frequency grid. The linearisation point comes from the [operating point](#/codex/operating-point), found with the aids in [convergence](#/codex/convergence). The elements that matter most are the [capacitor](#/codex/capacitor) and [inductor](#/codex/inductor), whose behaviour changes with frequency, and the nonlinear parts: [diode](#/codex/diode), [NPN](#/codex/npn), [PNP](#/codex/pnp), [NMOS](#/codex/nmos) and [PMOS](#/codex/pmos). The [MNA](#/codex/mna) entry gives the matrix layout.
