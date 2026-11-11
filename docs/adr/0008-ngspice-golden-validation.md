# 0008. Solver validation against ngspice golden files

- Status: Accepted
- Date: 2026-11-11

## Context
A circuit simulator is only useful if its results are correct. Hand-checking results does not scale to the devices and analyses in v1. ngspice is a mature open-source SPICE implementation and serves as an external reference.

## Decision
- A fixed suite of reference circuits is defined once, in Nodal's netlist IR.
- Each reference circuit is exported to a SPICE deck.
- ngspice is run on each deck. Its results are committed as golden files, with the ngspice version recorded.
- CI compares Nodal's output with the golden files, using per-analysis tolerances. A failed comparison blocks the merge.
- Simple circuits (divider, RC, RLC) are also checked against closed-form solutions.
- Every nonlinear device model must pass a finite-difference Jacobian test.
- Documentation may claim only the accuracy that a passing test demonstrates.
- Details are in `docs/VALIDATION.md`.

## Consequences
Positive:
- Results are checked against an independent, widely used simulator.
- Golden files make regressions visible in CI.
- Closed-form checks do not depend on ngspice.
- Finite-difference checks catch Jacobian errors that would slow or break Newton convergence.

Negative:
- Golden files must be regenerated when ngspice changes, and each regeneration needs manual review.
- Tolerances are set per analysis. Tolerances set too loose can hide real errors.
- ngspice is needed to regenerate goldens, but not to run ordinary CI.

## Alternatives considered
- Hand-checked results only: rejected, because it does not scale across devices and analyses.
- Installing ngspice in CI on every run: rejected, because committed goldens make CI independent of an installed ngspice.
