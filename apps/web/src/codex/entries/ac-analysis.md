# AC analysis

## What it does

AC analysis computes how the circuit responds to a small sinusoidal signal at each frequency in a range. The result is a complex voltage at every node and a complex current at every branch, from which you read gain and phase against frequency. Use it for filters, amplifier bandwidth and loop gain.

The signal is small by assumption. The circuit is linearised around its operating point, so the answer does not depend on the signal size and does not show distortion. See [Small-signal models](#/codex/small-signal).

## How Nodal solves it

1. Nodal solves the [operating point](#/codex/operating-point).
2. Each part is linearised at that point. Its conductances go into a real matrix $G$, and its capacitances $dQ/dV$ go into a real matrix $C$. Inductors put $-L$ on their branch row of $C$. A switch keeps the on or off state it had at the operating point.
3. For each frequency, Nodal solves one complex linear system. $G$ and $C$ are built once, and only the sum and its factorisation change per frequency.

Only sources that have an AC value excite the circuit. A source with no AC value contributes zero, so a DC supply behaves as a short circuit (voltage source) or an open circuit (current source) for the signal. To set an AC magnitude and phase on a source, see [Voltage source](#/codex/vsource) and [Current source](#/codex/isource).

### Frequency grid

Nodal builds the grid as ngspice does.

- `dec`: `points` frequencies per decade, starting at `fstart`. Each frequency is the previous one times a ratio $\delta$. For a whole number of decades $\delta = 10^{1/\text{points}}$. In general

$$
\delta = \exp\!\left(\dfrac{\ln(f_{stop}/f_{start})}{\left\lfloor \text{points}\cdot\log_{10}(f_{stop}/f_{start}) \right\rfloor}\right)
$$

  so the grid lands on `fstop` when the range is not a whole number of decades.
- `oct`: `points` frequencies per octave. The ratio is $2^{1/\text{points}}$.
- `lin`: `points` frequencies evenly spaced from `fstart` to `fstop`, endpoints included.

The log grids stop at the first frequency above `fstop`, with a tolerance of `reltol` on the last point. A sweep is limited to 1000000 frequencies.

For `lin` with 2 points, ngspice produces a single point at `fstart`. Nodal returns both `fstart` and `fstop`.

## Equations

With angular frequency $\omega = 2\pi f$, Nodal solves

$$
(G + j\omega C)\, x = b_{ac}
$$

for the complex unknowns $x$. The vector $b_{ac}$ holds one phasor per source with an AC value: $\text{mag}\,e^{j\varphi}$ on the branch row of a voltage source, and the same value with opposite signs on the two node rows of a current source. The phase $\varphi$ is entered in degrees.

For an inductor the branch row becomes

$$
v_{n^+} - v_{n^-} - j\omega L\, i_k = 0
$$

and a capacitor behaves as an admittance $j\omega C$. Gain in decibels is $20\log_{10}|V_{out}/V_{in}|$.

## Settings

- `sweep`: the grid type, `lin`, `dec` or `oct`.
- `points`: points per decade or octave for `dec` and `oct`, and the total number of points for `lin`. A whole number, 1 or more.
- `fstart`: first frequency, in Hz.
- `fstop`: last frequency, in Hz.

The solver option `reltol` affects only the end of the log grids. The operating point step uses all solver options.

## Common problems

`analysis ac: fstart must be > 0 for dec` (or `oct`)

A log grid cannot start at 0 Hz. Use a small positive `fstart`, or choose `lin`.

`analysis ac: fstop ... is below fstart ...`

Swap the two values.

`analysis ac: lin with one point needs fstart equal to fstop`

One point covers only a single frequency. Set `fstop` equal to `fstart`, or use more points.

`analysis ac: sweep has more than 1000000 points`

Lower `points`, or narrow the frequency range.

`ac analysis failed at ... Hz: <cause>`

The solve failed at that frequency. A singular system at one frequency often means a resonance with no loss, for example an ideal LC pair, or a node connected only through reactive parts. Add a small series or parallel resistance.

If the response is zero everywhere, no source has an AC value. Set one on the input source.

Any operating point error also appears here, because AC analysis starts with the operating point.
