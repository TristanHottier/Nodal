# 0002. Simulation engine in Rust, compiled to WASM

- Status: Accepted
- Date: 2026-11-11

## Context
The simulator runs in the browser. Transient analysis of larger circuits is compute-heavy, and the solver code benefits from strong numeric typing. The engine must also be testable without a browser, so that validation (ADR 0008) can run in CI.

## Decision
- The engine is a Rust library crate with no browser dependencies.
- A separate thin crate exposes the engine to JavaScript via wasm-bindgen, compiled to WebAssembly.
- The WASM module runs in a Web Worker, so the UI thread is not blocked by simulation.
- A native CLI crate uses the same library, so tests and validation run without a browser.

## Consequences
Positive:
- Numerical code is tested natively, without a browser.
- The library has no UI coupling and is reused unchanged by the CLI.
- Rust's type system and ownership rules apply to the solver code.

Negative:
- The build needs a Rust toolchain and a WASM build step in addition to the frontend toolchain.
- Data crossing the WASM boundary (netlists, waveforms) must be serialized, which adds overhead.
- Changing the engine requires Rust experience.

## Alternatives considered
- TypeScript solver: rejected, because it is slower on large transient runs and offers weaker numeric typing.
- C or C++ via Emscripten: rejected, because the toolchain is harder to use.
- Server-side ngspice: rejected, because it needs a backend, which conflicts with ADR 0004.
