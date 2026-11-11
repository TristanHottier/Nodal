# 0001. v1 scope: analog simulation only

- Status: Accepted
- Date: 2026-11-11

## Context
Nodal is a personal, portfolio-grade project for v1, and it is intended to become a public tool for students and hobbyists after v1. The scope of the first release determines whether it can be finished. MCU emulation alone would exceed all other v1 work combined.

## Decision
v1 consists of a schematic editor, analog simulation, and a waveform viewer. The analyses are DC operating point, DC sweep, AC small-signal, and transient.

Devices in v1:
- Passive: resistor (R), inductor (L), capacitor (C).
- Independent voltage and current sources with DC, AC, pulse, sine, and piecewise-linear (PWL) waveforms.
- Controlled sources: VCVS, VCCS, CCVS, CCCS.
- Ideal op-amp, modeled as a high-gain VCVS macro.
- Diode.
- BJT NPN and PNP, using a Gummel-Poon subset.
- MOSFET N and P, SPICE Level 1.
- Voltage-controlled switch.

Out of scope for v1: digital logic, MCU emulation, sensors, accounts and sharing, and PCB layout.

## Consequences
Positive:
- The v1 feature set is bounded and can be finished.
- Solver and validation work (ADRs 0002, 0003, 0008) concentrates on one analysis family.
- Each device model can be checked individually against ngspice (ADR 0008).

Negative:
- Users who need digital or mixed-signal simulation cannot use v1.
- The Gummel-Poon subset and the Level 1 MOSFET are approximations of the full SPICE models, which limits accuracy for some circuits.
- Sensor and MCU features that users may expect are deferred to post-v1.

## Alternatives considered
- MCU emulation in v1: rejected, because it alone would exceed all other v1 work.
- Digital logic in v1: rejected, because it needs event-driven semantics in addition to the analog engine.
- PCB layout in v1: rejected, because it is a separate domain with its own tooling.
