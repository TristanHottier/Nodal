# 0007. Component symbols drawn from scratch in IEC style

- Status: Accepted
- Date: 2026-11-11

## Context
The editor needs a symbol for each supported component. Existing symbol libraries, such as the KiCad libraries, carry license terms, and importing them requires a parser for their file format. Symbol conventions differ between IEC 60617 and ANSI.

## Decision
- All component symbols are drawn from scratch as SVG, in IEC 60617 style (for example, a rectangular resistor), on a fixed grid.
- No third-party symbol library is used in v1.
- An ANSI style toggle and KiCad symbol import are on the post-v1 roadmap.

## Consequences
Positive:
- No license attribution or share-alike obligations apply to the symbols.
- No parser for an external symbol format is needed in v1.
- A fixed grid keeps symbol geometry consistent across the editor.

Negative:
- Every symbol must be drawn and checked by hand.
- Users familiar with KiCad or ANSI symbols will see a different style until the post-v1 items are delivered.

## Alternatives considered
- Import KiCad symbol libraries: rejected for v1, because those libraries carry CC-BY-SA 4.0 terms with an exception, and the parser adds work.
- ANSI symbol set first: rejected for v1, because the project standardizes on IEC style first.
