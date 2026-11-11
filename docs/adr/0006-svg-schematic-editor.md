# 0006. Schematic rendered as SVG DOM

- Status: Accepted
- Date: 2026-11-11

## Context
The editor draws symbols, wires, labels, and selection handles. v1 targets circuits of a few hundred parts; the performance budget in the roadmap tests 500. The rendering approach determines how hit-testing, styling, zoom, and accessibility are implemented.

## Decision
The schematic is rendered as an SVG DOM tree, not with Canvas or WebGL.

This decision is revisited if the editor does not hold 60 fps while panning a schematic with 500 parts.

## Consequences
Positive:
- The browser provides hit-testing on each element, without custom geometry code.
- Styling uses CSS, and selection states are simple to express.
- Vector content stays crisp at any zoom level.
- Elements are standard DOM nodes, which supports accessibility work.

Negative:
- A large number of DOM nodes slows layout and painting as the part count grows.
- Pan and zoom performance depends on browser SVG handling, which may limit the target at high part counts.
- Effects that Canvas or WebGL handle easily are harder to build in SVG.

## Alternatives considered
- Canvas 2D: rejected for v1, because hit-testing and accessibility would have to be implemented by hand.
- WebGL: rejected for v1, because the target part counts do not need GPU rendering and the complexity is higher.
