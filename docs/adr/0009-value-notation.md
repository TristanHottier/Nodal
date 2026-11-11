# 0009. Value notation with SPICE-style suffixes, case-sensitive

- Status: Accepted
- Date: 2026-11-11

## Context
Users enter component values such as 4.7k, 10u, or 1meg. SPICE reads these suffixes case-insensitively, so in SPICE `M` means milli. Nodal departs from that reading so that `m` and `M` are distinct.

## Decision
- UI values use SPICE-style suffixes, parsed case-sensitively: f, p, n, u, µ, m, k, M, G, T, plus `meg` or `Meg` for 1e6.
- `m` means milli (1e-3) and `M` means mega (1e6). This differs from SPICE, where `M` means milli.
- The SPICE exporter always writes plain exponent notation (for example `1e6`), so the difference never reaches ngspice.
- The engine works internally in SI base units, using f64.

## Consequences
Positive:
- `m` and `M` are unambiguous within Nodal.
- The exporter removes suffix differences, so ngspice receives identical values (see ADR 0008).
- Internal computation uses one unit system.

Negative:
- Users who copy values from SPICE netlists will find that `M` reads differently.
- The parser must treat `µ` and `u` as the same suffix, which is extra work and a possible source of input bugs.
- Values copied from SPICE netlists need conversion before use.

## Alternatives considered
- Case-insensitive SPICE suffixes: rejected, because `M` would mean milli, which conflicts with the intended reading.
- Plain exponent notation only: rejected, because values such as 4.7e3 are harder to read and type.
- Engine storing values in prefixed units: rejected, because mixed units make the solver error-prone.
