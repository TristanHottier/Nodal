# 0011. Absolute floor on the transient tolerance

- Status: Accepted
- Date: 2026-11-20
- Amends: [0008](0008-ngspice-golden-validation.md) (the transient tolerance in `docs/VALIDATION.md` section 3)

## Context
`docs/VALIDATION.md` section 3 compared a transient signal with ngspice using only a range-normalized bound: a sample passes if $|x - x_{\text{ref}}| \le 10^{-3}\,p2p(x_{\text{ref}})$, where $p2p$ is the peak-to-peak value of the reference signal over the run.

A constant signal has $p2p = 0$. A supply node held by an ideal source is constant, so the rule alone demands bit-exact equality with ngspice. Two simulators that agree to the last printed digit can still differ by rounding in the final bits. The same holds for a branch current that is zero for the whole run.

## Decision
A transient sample passes if

$$|x - x_{\text{ref}}| \le 10^{-3}\,p2p(x_{\text{ref}}) + a_{\text{op}},$$

where $a_{\text{op}}$ is the absolute tolerance of the operating-point comparison: 1e-8 V for voltages and 1e-13 A for currents. The relative part is unchanged.

## Consequences
Positive:
- A constant signal is compared with the same absolute floor as an operating point, so rounding does not fail it.
- The tolerance still scales with the signal, so a real waveform is held to 0.1% of its swing.

Negative:
- The tolerance is slightly looser than the section 3 rule alone, by at most 1e-8 V or 1e-13 A. For a voltage with a swing above 10 mV the floor is below 0.1% of the bound.
- The floor is not scaled to the signal. A signal with a very small swing, such as a current of a few nanoamperes, is compared mostly through the floor.

## Alternatives considered
- Keep the rule and special-case constant signals: rejected, because it needs a second rule and still fails a signal that is constant to within rounding but not exactly.
- Use a floor relative to the largest signal in the circuit: rejected, because it hides errors in small signals, and the choice of that scale is arbitrary.
