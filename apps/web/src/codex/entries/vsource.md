# Voltage source

## What it is

An independent voltage source holds a fixed voltage between its two pins, whatever current the circuit draws from it. The voltage can be a constant, or a pulse, a sine or a piecewise linear waveform for transient runs. It can also carry a small-signal value for AC analysis.

## Typical uses

- A battery or a supply rail.
- A pulse or square-wave generator for transient tests.
- A sine generator.
- The input of an AC sweep, with a magnitude of 1 so that a result reads directly as a gain.
- A 0 V source as an ammeter, or as a short that you can probe for current.

## How it works

The source enforces $v_{n^+} - v_{n^-} = V$ and lets the current be whatever the rest of the circuit requires. Because the current is not known beforehand, it becomes an unknown of the system, the branch current $i_k$.

Which value $V$ takes depends on the analysis:

- In an operating point and in a DC sweep, $V$ is the DC value. The source can be scaled during source stepping, one of the fallbacks for hard operating points, but the final solution uses the full value. A DC sweep replaces the DC value of the swept source.
- In AC analysis the DC value is a bias only. The source drives the circuit with the phasor set by AC magnitude and AC phase. A source with no AC magnitude contributes nothing, so for small signals it is a short between its pins. A supply rail therefore has no small-signal response.
- In a transient run, the waveform replaces the DC value. With the Waveform field set to none, the source stays at its DC value.

Before a transient run without `uic` starts, Nodal solves the operating point with every waveform source at its value at $t = 0$, not at its DC value. With `uic` no operating point is solved, so the $t = 0$ value reaches the circuit only through the first time step.

The corners of a waveform are breakpoints: the time stepper lands exactly on pulse edges, PWL vertices and the start of a sine delay (see [transient](#/codex/transient) and [integration](#/codex/integration)).

## Equations

Write $\tau = t - t_d$, where $t_d$ is the Delay field. An empty Delay means no delay.

### Pulse

Let $T$ be the Period. If $\tau > T$, first reduce it with $\tau \leftarrow \tau - T\lfloor \tau / T \rfloor$. Then

$$
v(t) =
\begin{cases}
V_1 & \tau \le 0 \ \text{ or } \ \tau \ge t_r + t_w + t_f \\
V_1 + (V_2 - V_1)\,\dfrac{\tau}{t_r} & 0 < \tau < t_r \\
V_2 & t_r \le \tau \le t_r + t_w \\
V_2 + (V_1 - V_2)\,\dfrac{\tau - t_r - t_w}{t_f} & t_r + t_w < \tau < t_r + t_w + t_f
\end{cases}
$$

with $V_1$ the Initial value, $V_2$ the Pulsed value, $t_r$ the Rise time, $t_f$ the Fall time and $t_w$ the Pulse width. The waveform rests at $V_1$, rises linearly, holds $V_2$, falls linearly and rests again until the next period.

### Sine

With $V_O$ the Offset, $V_A$ the Amplitude, $f$ the Frequency, $\theta$ the Damping in 1/s and $\varphi$ the Phase in degrees:

$$
v(t) =
\begin{cases}
V_O + V_A \sin\varphi & \tau \le 0 \\
V_O + V_A \sin\left(2\pi f \tau + \varphi\right) e^{-\theta \tau} & \tau > 0
\end{cases}
$$

Before the delay the source sits at $V_O + V_A \sin\varphi$, not at $V_O$, as in ngspice. An empty Damping means no damping, and an empty Phase means zero.

### PWL

The points are pairs $(t_j, v_j)$ with strictly increasing times. Before the first point's time the value is the first point's value $v_0$ (points numbered from $j = 0$), after the last time it is the last value, and in between it is linear:

$$
v(t) = v_j + \dfrac{t - t_j}{t_{j+1} - t_j}\,(v_{j+1} - v_j), \qquad t_j < t \le t_{j+1}
$$

### AC

$$
V_{ac} = M\,e^{j\varphi_{ac}}
$$

with $M$ the AC magnitude and $\varphi_{ac}$ the AC phase in degrees. The Phase of a sine and the AC phase are separate fields: the first shifts the time waveform and the second shifts the small-signal phasor.

{{parameters}}

## In the MNA system

The source adds the unknown $i_k$, positive when it flows from $n^+$ through the source to $n^-$:

| | $n^+$ | $n^-$ | $i_k$ | $b$ |
|---|---|---|---|---|
| row $n^+$ | | | $+1$ | |
| row $n^-$ | | | $-1$ | |
| row $k$ | $+1$ | $-1$ | | $V$ |

Here $V$ is the DC value (times the source-stepping factor in a DC analysis) or the waveform value at the current time in a transient step. In AC analysis the right-hand side of row $k$ holds the phasor $M\,e^{j\varphi_{ac}}$, and zero when no AC magnitude is set.

With this sign convention a source that delivers power has a negative $i_k$. ngspice reports the same sign.

## Differences from ngspice

The pulse, sine and PWL values port the corresponding cases of ngspice-42 `vsrcload.c`, and the breakpoints follow `vsrcacct.c`. The supported waveforms are narrower: Nodal has no pulse phase or pulse count, and no PWL repeat or delay options. An exponential or AM source does not exist here. ngspice replaces a zero rise or fall time with tstep, a zero width or period with tstop and a zero sine frequency with 1/tstop. Nodal requires rise time, fall time, period and frequency to be greater than zero.

With `uic`, Nodal reports a point at $t = 0$, which ngspice does not.
