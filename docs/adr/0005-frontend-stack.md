# 0005. Frontend stack

- Status: Accepted
- Date: 2026-11-11

## Context
The editor is an interactive single-page application with no server-rendered content. It needs typed state, undo and redo, plots of waveform data, and validation of imported files and of the netlist intermediate representation (IR) passed to the engine.

## Decision
- Build tool: Vite.
- UI: React with TypeScript in strict mode.
- State management: Zustand.
- Document model: an Immer-based immutable document, with snapshot-based undo and redo.
- Waveform plots: uPlot.
- Runtime validation: Zod, applied to imported files and to the netlist IR.

Next.js is not used, because the project needs no server-side features.

## Consequences
Positive:
- Vite produces a static bundle, which fits the local-first deployment (ADR 0004).
- Strict TypeScript and Zod reject malformed input at the boundary, not deep in the engine.
- Snapshot undo and redo follow directly from the immutable document model.
- uPlot handles large numbers of points with a small footprint.

Negative:
- Five runtime libraries (React, Zustand, Immer, Zod, uPlot) must be kept current and compatible.
- History keeps one Immer snapshot per edit. Structural sharing limits the growth, but history length is still capped.
- Zod validation runs at load time and adds a cost for large files.

## Alternatives considered
- Next.js: rejected, because it adds server-side features the project does not use.
