# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: electrical-engineering students who prepare and check lab and coursework circuits on a laptop, often in short sessions between classes. They draw a schematic, run an analysis, and read node voltages, Bode plots and transient waveforms against what theory predicts.

Secondary: people who look at Nodal as a portfolio project (recruiters, engineers), and hobbyists who check a circuit before building it.

## Product Purpose

Nodal is a schematic editor and analog circuit simulator that runs entirely in the browser. It exists so a student can open a tab and get SPICE-grade results without installing anything or creating an account. Success means the student trusts the numbers enough to compare them with a lab measurement or a hand calculation.

## Positioning

Serious SPICE in a tab. The engine is a Rust port of ngspice algorithms compiled to WebAssembly, and every analysis is compared against ngspice-42 goldens in CI. Unlike animation-first simulators, Nodal gives SPICE results (operating point, DC sweep, AC, transient) that are checked against the reference tool. Unlike desktop SPICE, it needs no install and keeps work local in the browser.

## Operating Context

- Laptop screens, 1024 to 1280 px wide and up; mouse or trackpad plus keyboard shortcuts.
- Workflow: open an example or start blank, place parts, wires and net labels, edit values in the inspector and fix problems. Then pick an analysis, run it, probe signals, read the cursors and the op values on the schematic, and save a `.nodal.json` file.
- Work autosaves to IndexedDB. Files are `.nodal.json`. ngspice decks come from the CLI, not the web app.

## Capabilities and Constraints

- Devices: R, L, C, independent sources (DC, AC, pulse, sine, PWL), E/G/H/F, ideal op-amp, diode, BJT, MOSFET Level 1, voltage-controlled switch.
- Analyses: DC operating point, DC sweep, AC (lin/dec/oct), transient (trap and Gear).
- Symbols are hand-drawn in IEC 60617 style and are part of the product.
- Stack: Vite, React, TypeScript, Zustand, SVG editor, uPlot. Static site on GitHub Pages. No backend, no accounts.
- Performance budget (M7) must keep holding: editor pan/zoom at 60 fps with 500 parts.
- Not in v1: digital logic, accounts and sharing, PCB layout.

## Brand Commitments

- Name: Nodal.
- IEC-style symbols drawn from scratch.
- Voice: plain, factual English. No claim of accuracy, performance or features that a test does not show.
- Tone: a modern engineering tool, dense and quiet, in the spirit of current developer tools (ADR 0013). The audience is unchanged.
- No other brand constraints.

## Evidence on Hand

- Validation table (30 ngspice-42 goldens, all passing) and the perf table in `README.md`.
- Eight example projects in `src/examples/`.
- User guide and screenshots in `docs/user-guide.md` and `docs/user-guide/`.
- No testimonials, users or adoption figures exist. Do not invent them.

## Product Principles

1. Numbers first: every value is readable, precise and unambiguous, with units.
2. Trust is earned by checks, not by claims.
3. Nothing to install, nothing to sign up for; the work stays on the user's machine.
4. The schematic is the center of attention; the chrome stays out of its way.

## Accessibility & Inclusion

WCAG 2.2 AA (axe-core clean in both themes). Every action reachable by keyboard with a visible focus ring. Waveform traces and schematic highlights distinguishable under protanopia, deuteranopia and tritanopia, and never conveyed by color alone. Respect `prefers-reduced-motion` and `prefers-color-scheme`.
