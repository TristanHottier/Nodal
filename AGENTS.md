# AGENTS.md

Rules for anyone, human or AI agent, writing code in this repository.

## Before you start

1. Read [`docs/ROADMAP.md`](docs/ROADMAP.md) and work on the current milestone only. The one exception is M5, which may run in parallel with M3 or M4. Don't add features that no milestone asks for.
2. Read the ADRs in [`docs/adr/`](docs/adr/). If your change contradicts one, stop: write a new ADR that supersedes it, and get it accepted before changing code.
3. For engine work, read [`docs/reference/`](docs/reference/). Sign conventions there are binding.
4. Each milestone has a task-by-task plan in [`docs/plans/`](docs/plans/) (for example `2026-11-11-m0-bootstrap.md`). Follow it in order. If the current milestone has no plan yet, write one and get it approved before writing code.

## Commands

Run these from the repository root.

| Task | Command |
|---|---|
| Rust tests | `cargo test --workspace` |
| Validation suite | n/a until M1 |
| WASM build | `pnpm build:wasm` |
| Web dev server | `pnpm --filter @nodal/web dev` |
| Web tests | `pnpm test` and `pnpm --filter @nodal/web e2e` |
| Lint and format | `cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && pnpm lint && pnpm format:check` |

## Engine rules (`crates/`)

- `nodal-engine` has no dependency on the browser, the filesystem or the clock. I/O belongs in `nodal-cli` and `nodal-wasm`.
- No `unwrap`, `expect` or `panic!` in library code paths. Return a typed error.
- f64 everywhere, in SI base units. No unit prefixes in identifiers (`capacitance`, not `capacitance_uf`).
- Every nonlinear device ships with a finite-difference Jacobian test for every operating region, in the same PR.
- Every device ships with at least one analytic or golden test, in the same PR.
- Model parameter names and defaults match ngspice. Reject unsupported parameters; never ignore them silently.
- Port SPICE algorithms (pnjlim, fetlim, step control) faithfully, and cite the ngspice source file in a comment.

## Validation rules

- Never loosen a tolerance in `docs/VALIDATION.md` or in the comparator without a new ADR.
- Never regenerate a golden just to make a test pass. The commit that changes a golden explains why.
- A failing golden is a bug until shown otherwise. Find out which side is wrong and write down the reason.

## Frontend rules (`apps/web`, `packages/schema`)

- TypeScript `strict`. No `any` without a comment explaining why.
- The netlister is a pure function with unit tests. React components never build netlists themselves.
- Validate every file read from disk or IndexedDB with Zod. Migrate old `formatVersion`s, and refuse unknown ones.
- Keep components small. If a file passes about 400 lines, split it.
- Symbols live one per file, drawn on the grid, in IEC 60617 style.

## Documentation rules

- Docs describe what exists, or are clearly marked as planned. Update `README.md` and the roadmap status in the same commit as the change that makes them true.
- Never claim accuracy, performance or features that no test or measurement shows.
- All docs and code comments are in English.

## Git

- Work on `main` (single developer). Small commits, each leaving CI green.
- Conventional Commits: `feat(engine): …`, `fix(web): …`, `docs: …`, `test(validation): …`.
- No generated files in git except `validation/golden/`. Lockfiles (`Cargo.lock`, `pnpm-lock.yaml`) are committed as source inputs.
