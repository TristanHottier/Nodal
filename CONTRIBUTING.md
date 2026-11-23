# Contributing to Nodal

Thanks for your interest. Nodal has a single maintainer, so small and focused contributions are the easiest to review. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Report a bug

Open an issue with the **Bug report** template. Include the Nodal version (shown in the status bar), your browser and operating system, the steps to reproduce, what you expected and what happened. If you can, attach the project as a `.nodal.json` file (Save as... in the top bar).

For security problems, don't open a public issue. Follow [`SECURITY.md`](SECURITY.md).

## Propose a feature

Open an issue with the **Feature request** template before writing code. Describe the problem first, then the change you have in mind. The scope of each milestone is in [`docs/ROADMAP.md`](docs/ROADMAP.md), and ideas after v1 are listed there too; none of them is a commitment.

## Set up

You need Node 24, pnpm 12.18, a Rust toolchain (pinned in `rust-toolchain.toml`) and wasm-pack 0.15.1.

```sh
pnpm install
pnpm build:wasm
pnpm --filter @nodal/web dev
```

Before sending a change, run the checks that apply:

| Task | Command |
|---|---|
| Rust tests | `cargo test --workspace` |
| Validation suite | `cargo run -p nodal-cli -- validate validation` |
| Web tests | `pnpm test` and `pnpm --filter @nodal/web e2e` |
| Lint and format | `cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && pnpm lint && pnpm format:check` |

## Rules that matter for contributors

The full list is in [`AGENTS.md`](AGENTS.md). In short:

- **Tests ship with the change.** Every device needs an analytic or golden test, and every nonlinear device needs a finite-difference Jacobian test.
- **Tokens only.** Colours and sizes live in `apps/web/src/theme/tokens.css`. No colour literal or `px`, `rem` or `em` value in other CSS or components. `pnpm --filter @nodal/web test` enforces it.
- **Validation is binding.** Don't loosen a tolerance in [`docs/VALIDATION.md`](docs/VALIDATION.md) or regenerate a golden to make a test pass. A change to a golden needs a stated reason.
- **Decisions are recorded.** If a change contradicts an [ADR](docs/adr/), write a superseding ADR first.
- **Docs match reality.** Update the README and the roadmap status in the same change. Don't claim accuracy, performance or features that no test shows.
- Code, comments and docs are in English.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(engine): ...`, `fix(web): ...`, `docs: ...`, `test(validation): ...`.
- Keep pull requests small and focused, and leave CI green.
- `main` is the only branch. Open pull requests against it.
- Fill in the pull request template, with screenshots for UI changes.
