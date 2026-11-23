# Changelog

All notable changes to Nodal are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Community files: contributing guide, code of conduct, security policy, citation metadata, issue and pull request templates, CODEOWNERS, CodeQL analysis and Dependabot updates.
- README badges and screenshots in `docs/assets/`.

## [1.1.0] - 2026-11-23

### Added

- Waveform cursor B can be placed without reading the guide. The first plain click places A, the second places B, and later clicks move the nearer cursor. Both cursors can be dragged, and Shift+click still places B.
- Keyboard control of the cursors: Tab to the plot, `A` or `B` picks the active cursor, the arrow keys move it one sample (Shift: ten), `Home` and `End` jump to the ends, and `Delete` removes it.
- A "Clear cursors" button, a hint line under the plot, and an "Active" marker for the current cursor.

### Changed

- Modern redesign ([ADR 0013](docs/adr/0013-modern-visual-design.md)): top bar, icon tool rail, grouped parts panel, mono numbers, Inter and JetBrains Mono fonts, Lucide icons, and refreshed light and dark themes. Probed nets are drawn in their trace colour.
- The theme follows the operating system by default.
- With nothing selected, the inspector shows Analyses first and Models collapsed below it.
- Design tokens, accessibility, contrast, colour-share and Lighthouse checks from 1.0.0 still pass. Visual baselines and the user-guide screenshots were regenerated.

## [1.0.0] - 2026-11-22

### Added

- **Repository and CI (M0):** Cargo and pnpm workspaces, CI on GitHub Actions, and a GitHub Pages deploy served under `/Nodal/`.
- **Linear DC engine (M1):** netlist IR with Rust and Zod schemas, MNA assembly with a dense LU solver, topology checks, `nodal-cli run` and `export-spice`, and the ngspice validation harness.
- **Nonlinear DC (M2):** diode, BJT, MOSFET Level 1 and voltage-controlled switch, Newton-Raphson with junction limiting, gmin and source stepping, and DC sweep.
- **AC analysis (M3):** complex MNA with small-signal models of all devices, including junction and overlap capacitances, and linear, decade and octave sweeps.
- **Transient analysis (M4):** trapezoidal and Gear integration, pulse, sine and PWL sources with breakpoints, LTE step control, `uic`, and switch hysteresis.
- **Schematic editor (M5a, M5b):** SVG canvas with IEC symbols, orthogonal wires and junction dots, undo and redo, a parameter inspector with value notation, a netlister with diagnostics, IndexedDB autosave, and `.nodal.json` import and export.
- **Simulation in the browser (M6):** the engine as WebAssembly in a Web Worker with progress and cancel, the analysis panel, operating-point values on the schematic, a waveform viewer with probes, cursors and a Bode view, and engine errors shown on the schematic.
- **Content and performance (M7):** eight example projects, the user guide, and a performance budget measured in CI.
- **Design and release (M8):** one coherent visual design from a single token file, light and dark themes, a read-only schematic view below 1024 px, WCAG 2.2 AA checks with axe-core, contrast tests, visual regression screenshots, and Lighthouse limits on the deployed app.

[Unreleased]: https://github.com/TristanHottier/Nodal/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/TristanHottier/Nodal/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/TristanHottier/Nodal/releases/tag/v1.0.0
