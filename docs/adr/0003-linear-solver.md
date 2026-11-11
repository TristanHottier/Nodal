# 0003. Linear solver behind a trait, dense LU first

- Status: Accepted
- Date: 2026-11-11

## Context
Every analysis reduces to solving linear systems: real-valued systems for DC and transient steps, and a complex-valued system for AC small-signal analysis. v1 circuits are small: the roadmap's performance budget uses a 50-node case, and typical v1 circuits stay under about 200 unknowns. The solver must build for the wasm32 target.

## Decision
- All linear solves go through a `LinearSolver` trait.
- The first backend is dense LU decomposition with partial pivoting, from the faer crate, which is pure Rust and builds for wasm32.
- A sparse LU backend (faer sparse) is added only if the performance budget in the roadmap is missed.
- AC analysis uses the same trait, instantiated over complex f64.

## Consequences
Positive:
- The simplest correct backend ships first and is straightforward to verify.
- Adding a sparse backend requires no change to the analyses.
- One trait covers both real (DC, transient) and complex (AC) solves.

Negative:
- Dense storage grows with the square of the unknown count, and factorization cost grows with its cube. Circuits well above 200 unknowns will be slow until a sparse backend exists.
- The trait must accommodate both dense and sparse matrix types, which adds some abstraction.

## Alternatives considered
- Sparse LU from the start: rejected, because at under 200 unknowns the added complexity does not yet pay off.
- Solver code called directly from each analysis, without a trait: rejected, because replacing the backend later would touch every analysis.
- Native BLAS or LAPACK bindings: rejected, because native libraries need extra work to build for wasm32.
