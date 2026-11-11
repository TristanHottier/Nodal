# 0000. Record architecture decisions

- Status: Accepted
- Date: 2026-11-11

## Context
Nodal is a browser-based schematic editor and analog circuit simulator. Several early choices (engine language, linear solver, validation method, file format) constrain everything built after them. Without a written record, the reasons behind these choices are lost, and later contributors may reverse them without knowing the trade-offs.

## Decision
We record architecture decisions as Architecture Decision Records (ADRs) in `docs/adr/`, using the Michael Nygard format: title, status, date, Context, Decision, Consequences, and Alternatives considered.

- Files are named `NNNN-short-slug.md` with a four-digit sequence number.
- Each ADR is short, targeting 25 to 60 lines.
- An ADR is not edited to change its decision. A new ADR supersedes the old one, and the old ADR's status is changed to `Superseded by NNNN`.
- `docs/adr/README.md` holds the index of all ADRs, with their titles and statuses.

## Consequences
Positive:
- The reasons for each major choice are kept in the repository, next to the code and docs.
- Reversing a decision is an explicit, reviewable change.
- Status changes are visible in the index.

Negative:
- Each non-trivial decision needs a written ADR, which adds a small cost to making a change.
- Superseded ADRs accumulate, and the index must be kept current by hand.

## Alternatives considered
- Decisions in one long design document: rejected, because a single file is hard to change and to link to individual decisions.
- Decisions kept only in the issue tracker: rejected, because issues are not versioned with the repository.
- Editing ADRs in place when a decision changes: rejected, because the history of the decision would be lost.
