# Current source

## What it is

An independent current source forces a given current through its two pins, whatever voltage that takes. Like the [voltage source](#/codex/vsource), it can be constant, a pulse, a sine or a piecewise linear waveform, and it can carry a small-signal value for AC analysis.

## Typical uses

- Biasing a transistor or a reference with a known current.
- A test current into a node, to read the voltage it produces.
- The tail current of a differential pair.
- A current pulse into a capacitor, or a signal current for an AC sweep.
- A load that draws a set current.

## How it works

The source forces a current $I$ from $n^+$ through the source to $n^-$. Current leaves the circuit at $n^+$ and re-enters at $n^-$. A positive value therefore pulls current out of the node at the $n^+$ pin and pushes it into the node at the $n^-$ pin.

An ideal current source has an infinite output resistance, so it adds nothing to the matrix beyond known right-hand-side terms. A current source is not a DC path. A node that reaches ground only through current sources and capacitors has no DC path to ground, and the circuit check reports it as a floating node, because its voltage would be undetermined.

The value follows the same rules as for a voltage source. The operating point and a DC sweep use the DC value, scaled during source stepping. AC analysis uses the AC magnitude and phase, and a source with no AC magnitude contributes nothing, which makes it an open circuit for small signals. A transient run uses the waveform, or the DC value when the Waveform field is none. A run without `uic` starts from an operating point with every waveform at its value at $t = 0$. The corners of a waveform are breakpoints.

## Equations

The waveform formulas are the same as for the voltage source, with the values in amperes. Write $\tau = t - t_d$, with an empty Delay meaning no delay.

For a pulse with Period $T$, first reduce $\tau \leftarrow \tau - T\lfloor \tau / T \rfloor$ when $\tau > T$. Then

$$
i(t) =
\begin{cases}
I_1 & \tau \le 0 \ \text{ or } \ \tau \ge t_r + t_w + t_f \\
I_1 + (I_2 - I_1)\,\dfrac{\tau}{t_r} & 0 < \tau < t_r \\
I_2 & t_r \le \tau \le t_r + t_w \\
I_2 + (I_1 - I_2)\,\dfrac{\tau - t_r - t_w}{t_f} & t_r + t_w < \tau < t_r + t_w + t_f
\end{cases}
$$

with $I_1$ the Initial value, $I_2$ the Pulsed value, $t_r$ the Rise time, $t_f$ the Fall time and $t_w$ the Pulse width.

For a sine, with $I_O$ the Offset, $I_A$ the Amplitude, $f$ the Frequency, $\theta$ the Damping in 1/s and $\varphi$ the Phase in degrees:

$$
i(t) =
\begin{cases}
I_O + I_A \sin\varphi & \tau \le 0 \\
I_O + I_A \sin\left(2\pi f \tau + \varphi\right) e^{-\theta \tau} & \tau > 0
\end{cases}
$$

Before the delay the source sits at $I_O + I_A \sin\varphi$, as in ngspice. An empty Damping means no damping.

For PWL, the value is the first point's value before its time, the last point's value after its time, and linear in between.

For AC analysis the source drives the phasor $M\,e^{j\varphi_{ac}}$, with $M$ the AC magnitude and $\varphi_{ac}$ the AC phase in degrees.

{{parameters}}

## In the MNA system

A current source adds no unknown and no matrix entries. It only changes the right-hand side. The current leaves $n^+$, so it enters the right-hand side with the opposite sign there:

$$
b_{n^+} \mathrel{-}= I, \qquad b_{n^-} \mathrel{+}= I
$$

Here $I$ is the DC value (times the source-stepping factor in a DC analysis) or the waveform value at the current time in a transient step. In AC analysis the same two entries receive $M\,e^{j\varphi_{ac}}$ with the same signs, and nothing when no AC magnitude is set. Entries that name ground are skipped.

## Differences from ngspice

The value follows ngspice-42 `isrcload.c` and the AC load follows `isrcacld.c`. Waveforms are the same subset as for the [voltage source](#/codex/vsource): no pulse phase or count, and no PWL repeat or delay options. ngspice replaces a zero rise or fall time with tstep, a zero width or period with tstop and a zero sine frequency with 1/tstop. Nodal requires rise time, fall time, period and frequency to be greater than zero. With `uic`, Nodal reports a point at $t = 0$, which ngspice does not.
