## Summary

<!-- What changes, and why. Link the issue if there is one. -->

## Checks run

<!-- Tick what you ran, and note anything you skipped. -->

- [ ] `cargo test --workspace`
- [ ] `cargo run -p nodal-cli -- validate validation`
- [ ] `pnpm test` and `pnpm --filter @nodal/web e2e`
- [ ] `cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && pnpm lint && pnpm format:check`

## Screenshots

<!-- Required for UI changes, in light and dark. Otherwise write "none". -->

## Docs and roadmap

- [ ] I updated the README and the roadmap status in this PR, or nothing they describe changed.
- [ ] Commits follow Conventional Commits.
