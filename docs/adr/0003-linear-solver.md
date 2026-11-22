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

## Update (M7)
The performance budget was missed with the dense backend: the 50-node, 10,000-point transient fixture (`validation/perf/tran50.json`) took 1349 ms in Chromium with unoptimized WASM against a budget of 1000 ms, and about 1.1 s with the native release CLI. `SparseLu` (faer's simplicial sparse LU with a cached COLAMD column permutation) now backs the Newton and AC solves. The singular-pivot rule of the dense backend is kept per original column, and `DenseLu` stays as the test oracle. The decision is unchanged: all solves go through `LinearSolver`, and only the backend behind it changed. After the change, the same fixture takes about 0.5 s native and 655 ms (median of five) in Chromium with unoptimized WASM; the AC fixture takes 78 ms against a budget of 200 ms.
