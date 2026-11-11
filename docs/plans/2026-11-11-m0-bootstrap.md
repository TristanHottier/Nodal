# M0 Repository Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An empty but fully wired Nodal repo. Three Rust crates, a TS schema package and a Vite app all build, lint and test in CI. `main` deploys to GitHub Pages, and the deployed page shows a version string that comes from WASM running in a Web Worker.

**Architecture:** A Cargo workspace holds `nodal-engine` (pure lib), `nodal-cli` (native binary) and `nodal-wasm` (wasm-bindgen wrapper). wasm-pack builds `nodal-wasm` into `crates/nodal-wasm/pkg/`, which is gitignored. The pnpm workspace holds `packages/schema` and `apps/web`. The web app imports the wasm package through the `@nodal/wasm` alias, inside a module worker. A single GitHub Actions workflow runs the checks, and on `main` it deploys `apps/web/dist` to Pages.

**Tech Stack:** Rust 1.97.0 (edition 2024), wasm-bindgen 0.2.130, wasm-pack 0.15.1, Node 24 LTS, pnpm 12.18.0, Vite 8, React 19, TypeScript 6.0 (not 7: typescript-eslint 8.72 needs `<6.1`), Vitest 5, Zod 4, ESLint 10 flat config, Prettier 3, Playwright 1.65.

**Spec:** [`docs/ROADMAP.md`](../ROADMAP.md) §M0, [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §1 and §5, [ADR 0010](../adr/0010-github-pages-hosting.md), [`AGENTS.md`](../../AGENTS.md).

## Global Constraints

- Pages URL: `https://tristanhottier.github.io/Nodal/`. Vite `base: '/Nodal/'`. Case matters: the repo is `Nodal`.
- `nodal-engine` has no I/O, browser or clock dependency. Clippy denies `unwrap_used`, `expect_used` and `panic` in it.
- TypeScript `strict: true` everywhere. No `any`.
- Crate and package names: `nodal-engine`, `nodal-cli`, `nodal-wasm`, `@nodal/schema`, `@nodal/web`. All crates and packages start at version `0.1.0`. Packages are `"private": true`.
- No generated files in git: `target/`, `node_modules/`, `dist/`, `crates/nodal-wasm/pkg/`, `test-results/`, `playwright-report/`.
- No `SharedArrayBuffer` and no custom-header requirements (ADR 0010).
- Commits use Conventional Commits and the author `TristanHottier <185231225+TristanHottier@users.noreply.github.com>`. No AI co-author trailers.
- M0 implements no simulation features. Anything from M1 is out of scope.

## Review Focus

1. **Sub-path assets.** Every asset in the deployed `/Nodal/` build resolves: JS, the worker script and the `.wasm` file. Root-relative URLs work on `localhost:5173` but 404 on Pages. Pinned by `scripts/check-base-path.mjs` (Task 5) and by the Playwright test running against `vite preview` with the base path (Task 6).
2. **WASM fails to load.** A missing or failed `.wasm` fetch must show a visible error state within 10 s, never an endless "Loading…". Pinned by the `getEngineVersion` timeout test (Task 5).
3. **Stale WASM in CI.** The web build must use WASM compiled from the commit under test, never a cached or committed `pkg/`. Pinned by the CI job order (Task 7): `pkg/` is built in the same job and is gitignored.
4. **Fresh clone.** `pnpm dev` on a clone with no `pkg/` must build WASM first or fail with a one-line message naming `pnpm build:wasm`. Pinned by the `predev`/`prebuild` hooks and `scripts/require-wasm.mjs` (Task 5).
5. **Version drift.** The version shown in the UI, by `nodal-cli --version`, and in `Cargo.toml` must be the same string. Pinned by the Rust test in Task 1 and the Playwright assertion of `0.1.0` (Task 6).

---

### Task 1: Cargo workspace and `nodal-engine` skeleton

**Files:**
- Create: `Cargo.toml` (workspace), `rust-toolchain.toml`, `rustfmt.toml`
- Create: `crates/nodal-engine/Cargo.toml`, `crates/nodal-engine/src/lib.rs`
- Modify: `.gitignore` (add `target/`)

**Interfaces:**
- Produces: `nodal_engine::VERSION: &str` (= `env!("CARGO_PKG_VERSION")`).

- [ ] **Step 1:** Write the workspace `Cargo.toml`: `resolver = "3"`, `members = ["crates/*"]`, and `[workspace.package]` with `version = "0.1.0"`, `edition = "2024"`, `license = "MIT"`, `rust-version = "1.97"`. Add `[workspace.lints.clippy]` with `unwrap_used`, `expect_used` and `panic` set to `"deny"`, and `[workspace.lints.rust]` with `unsafe_code = "forbid"`.
- [ ] **Step 2:** Write `rust-toolchain.toml`: `channel = "1.97.0"`, `components = ["rustfmt", "clippy"]`, `targets = ["wasm32-unknown-unknown"]`. Write `rustfmt.toml` with `edition = "2024"`.
- [ ] **Step 3: Write the failing test** in `crates/nodal-engine/src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn version_matches_manifest() {
        assert_eq!(super::VERSION, "0.1.0");
    }
}
```

- [ ] **Step 4:** Run `cargo test -p nodal-engine`. Expected: FAIL, `cannot find value VERSION`.
- [ ] **Step 5:** Add `pub const VERSION: &str = env!("CARGO_PKG_VERSION");` with a crate doc comment that states the no-I/O rule. In the crate manifest, inherit the workspace package fields and set `[lints] workspace = true`.
- [ ] **Step 6:** Run `cargo test -p nodal-engine && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`. Expected: all pass.
- [ ] **Step 7:** Commit `chore(engine): cargo workspace and nodal-engine skeleton`.

### Task 2: `nodal-cli` with `--version`

**Files:**
- Create: `crates/nodal-cli/Cargo.toml`, `crates/nodal-cli/src/main.rs`, `crates/nodal-cli/tests/cli.rs`

**Interfaces:**
- Consumes: `nodal_engine::VERSION`.
- Produces: the binary `nodal-cli`. `--version` prints `nodal-cli 0.1.0 (engine 0.1.0)` and exits 0. Any other input prints usage to stderr and exits 2.

- [ ] **Step 1: Write the failing tests** in `tests/cli.rs`, using `std::process::Command::new(env!("CARGO_BIN_EXE_nodal-cli"))`:
  - `version_flag`: args `["--version"]` → status code 0, stdout == `"nodal-cli 0.1.0 (engine 0.1.0)\n"`.
  - `no_args_is_usage_error`: no args → status code 2, stderr contains `"usage: nodal-cli --version"`.
  - `unknown_arg_is_usage_error`: args `["run"]` → status code 2, the same stderr text.
- [ ] **Step 2:** Run `cargo test -p nodal-cli`. Expected: FAIL (no binary).
- [ ] **Step 3:** Implement `fn main() -> std::process::ExitCode` with plain `std::env::args`. Don't add clap until M1 needs subcommands. The crate does not inherit the `panic` deny lint, but write no panics anyway.
- [ ] **Step 4:** Run `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(cli): nodal-cli --version`.

### Task 3: `nodal-wasm` wrapper

**Files:**
- Create: `crates/nodal-wasm/Cargo.toml`, `crates/nodal-wasm/src/lib.rs`, `crates/nodal-wasm/tests/node.rs`
- Modify: `.gitignore` (add `crates/nodal-wasm/pkg/`)

**Interfaces:**
- Consumes: `nodal_engine::VERSION`.
- Produces: `#[wasm_bindgen] pub fn engine_version() -> String`. Built with `wasm-pack build crates/nodal-wasm --target web --release`, which writes `crates/nodal-wasm/pkg/` (`nodal_wasm.js`, `nodal_wasm_bg.wasm`, `.d.ts`). The JS module's default export is `init(): Promise<…>`.

- [ ] **Step 1:** Write the manifest: `crate-type = ["cdylib", "rlib"]`, `wasm-bindgen = "=0.2.130"`, dev-dependency `wasm-bindgen-test = "0.3"`. Set `[profile.release]` in the workspace root to `opt-level = "s"`, `lto = true`.
- [ ] **Step 2: Write the failing test** `tests/node.rs`, using `wasm_bindgen_test` (node is the default runner):

```rust
#[wasm_bindgen_test::wasm_bindgen_test]
fn engine_version_is_crate_version() {
    assert_eq!(nodal_wasm::engine_version(), "0.1.0");
}
```

- [ ] **Step 3:** Run `wasm-pack test --node crates/nodal-wasm`. Expected: FAIL (`engine_version` not found).
- [ ] **Step 4:** Implement `engine_version()` as `nodal_engine::VERSION.to_string()`.
- [ ] **Step 5:** Run `wasm-pack test --node crates/nodal-wasm` (PASS), then `wasm-pack build crates/nodal-wasm --target web --release`. Expected: `pkg/nodal_wasm_bg.wasm` exists. Record its gzipped size with `gzip -c … | wc -c`; it must be under 1 MB.
- [ ] **Step 6:** Commit `feat(wasm): nodal-wasm wrapper exposing engine_version`.

### Task 4: pnpm workspace, tooling and `@nodal/schema`

**Files:**
- Create: `package.json` (root), `pnpm-workspace.yaml`, `.nvmrc` (`24`), `.npmrc` (`engine-strict=true`), `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`
- Create: `packages/schema/package.json`, `packages/schema/tsconfig.json`, `packages/schema/src/index.ts`, `packages/schema/src/index.test.ts`
- Modify: `.gitignore` (add `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`)

**Interfaces:**
- Produces: `@nodal/schema` exports `IR_VERSION: 1` (literal type) and `PROJECT_FORMAT: "nodal-project"`, both from ARCHITECTURE §3 and §7. Root scripts used by later tasks: `lint`, `format:check`, `typecheck`, `test`, `build:wasm` (`wasm-pack build crates/nodal-wasm --target web --release`).

- [ ] **Step 1:** Root `package.json`: `"private": true`, `"packageManager": "pnpm@12.18.0"`, `"engines": { "node": ">=24" }`. Scripts: `lint` (`eslint .`), `format:check` (`prettier --check .`), `typecheck` (`pnpm -r typecheck`), `test` (`pnpm -r test`), `build:wasm`. In `pnpm-workspace.yaml`, set `packages: ["packages/*", "apps/*"]`.
- [ ] **Step 2:** `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `target: "ES2022"`. `eslint.config.js` uses the typescript-eslint `strictTypeChecked` config, plus `@typescript-eslint/no-explicit-any: "error"`, and ignores `**/pkg/**` and `**/dist/**`.
- [ ] **Step 3: Write the failing test** `packages/schema/src/index.test.ts`:

```ts
import { expect, test } from "vitest";
import { IR_VERSION, PROJECT_FORMAT } from "./index";

test("format identifiers match ARCHITECTURE §3 and §7", () => {
  expect(IR_VERSION).toBe(1);
  expect(PROJECT_FORMAT).toBe("nodal-project");
});
```

- [ ] **Step 4:** Run `pnpm install && pnpm --filter @nodal/schema test`. Expected: FAIL (exports missing).
- [ ] **Step 5:** Implement the two `as const` exports. Add `zod@^4.6` as a dependency now, because M1 needs it here. Package scripts: `test` (`vitest run`), `typecheck` (`tsc --noEmit`).
- [ ] **Step 6:** Run `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 7:** Commit `chore: pnpm workspace, lint/format tooling, @nodal/schema skeleton`.

### Task 5: `apps/web` shell with engine worker

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`
- Create: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`
- Create: `apps/web/src/engine/engine.worker.ts`, `apps/web/src/engine/client.ts`, `apps/web/src/engine/client.test.ts`, `apps/web/src/engine/protocol.ts`
- Create: `scripts/require-wasm.mjs`, `scripts/check-base-path.mjs`

**Interfaces:**
- Consumes: `engine_version` and the default `init` from `@nodal/wasm` (Vite alias → `../../crates/nodal-wasm/pkg/nodal_wasm.js`).
- Produces:
  - `protocol.ts`: `type WorkerRequest = { type: "version" }` and `type WorkerResponse = { type: "version"; version: string } | { type: "error"; message: string }`.
  - `client.ts`: `getEngineVersion(opts?: { timeoutMs?: number; worker?: Worker }): Promise<string>`, with default timeout `10_000`. It rejects with `Error("engine worker timed out")` on timeout, and with `Error(message)` on an `error` response or a worker `error` event.
  - `App.tsx`: renders `<h1>Nodal</h1>`, then a status element with `data-testid="engine-status"` whose text is `Loading engine…`, then `Engine 0.1.0`, or `Engine failed to load: <message>`.

- [ ] **Step 1:** Scaffold `package.json` (`@nodal/web`; deps `react@^19.3`, `react-dom@^19.3`; dev deps `vite@^8.3`, `@vitejs/plugin-react@^6.3`, `vitest@^5.1`, `jsdom`, `@testing-library/react`). `vite.config.ts` sets `base: "/Nodal/"`, the `@nodal/wasm` alias, `worker: { format: "es" }`, and `test.environment: "jsdom"`. Hooks `predev` and `prebuild` both run `node ../../scripts/require-wasm.mjs`.
- [ ] **Step 2: Write the failing tests** `client.test.ts`, using a fake `Worker` object (`postMessage` spy plus manual dispatch of `message`/`error` events):
  - `resolves with version from worker`: fake replies `{ type: "version", version: "0.1.0" }` → resolves to `"0.1.0"`.
  - `rejects on error response`: fake replies `{ type: "error", message: "boom" }` → rejects with `"boom"`.
  - `rejects on timeout`: fake never replies, `timeoutMs: 50` → rejects with `"engine worker timed out"`.
  - `rejects on worker error event`: fake dispatches `error` → rejects.
- [ ] **Step 3: Write the failing tests** `App.test.tsx`, with `vi.mock("./engine/client")`:
  - Pending promise → status text is `Loading engine…`.
  - Resolves `"0.1.0"` → status text is `Engine 0.1.0`.
  - Rejects `Error("engine worker timed out")` → status text is `Engine failed to load: engine worker timed out`.
- [ ] **Step 4:** Run `pnpm --filter @nodal/web test`. Expected: FAIL.
- [ ] **Step 5:** Implement `protocol.ts`, `client.ts` (create the worker with `new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" })` unless `opts.worker` is given), `engine.worker.ts` (`await init()` once, answer `version` requests, post `error` if `init` throws) and `App.tsx`.
- [ ] **Step 6:** `scripts/require-wasm.mjs`: if `crates/nodal-wasm/pkg/nodal_wasm_bg.wasm` is missing, print `WASM not built. Run: pnpm build:wasm` and exit 1.
- [ ] **Step 7:** `scripts/check-base-path.mjs <distDir>`: scan every `.html`, `.js` and `.css` in `dist` for `src=`, `href=`, `url(` and `new URL(` targets that start with `/` but not `/Nodal/`. Exit 1 and list them if any are found.
- [ ] **Step 8:** Run `pnpm build:wasm && pnpm --filter @nodal/web test && pnpm --filter @nodal/web build && node scripts/check-base-path.mjs apps/web/dist`. Expected: all PASS, and `dist/assets/` contains one `.wasm` file and one worker chunk.
- [ ] **Step 9:** Commit `feat(web): app shell loading engine version from WASM worker`.

### Task 6: Playwright smoke test against the production build

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/shell.spec.ts`
- Modify: `apps/web/package.json` (script `e2e`), `.gitignore` (add `test-results/`, `playwright-report/`), `docs/ARCHITECTURE.md` §8 (Playwright now starts at M0)

**Interfaces:**
- Consumes: the `engine-status` test id from Task 5.

- [ ] **Step 1:** `playwright.config.ts`: `webServer` runs `pnpm build && pnpm vite preview --port 4173 --strictPort`. `baseURL` is `http://localhost:4173/Nodal/`. Projects: chromium and firefox.
- [ ] **Step 2: Write the test** `e2e/shell.spec.ts`:
  - `shell shows engine version from WASM worker`: `page.goto("./")`, then expect `getByTestId("engine-status")` to have text `Engine 0.1.0` within 10 s, and expect zero failed requests (collected from `page.on("requestfailed")`).
- [ ] **Step 3:** Run `pnpm --filter @nodal/web exec playwright install --with-deps chromium firefox && pnpm --filter @nodal/web e2e`. Expected: PASS in both browsers. To prove the test catches failures: temporarily set `base: "/"`, rebuild and rerun. Expected: FAIL. Revert.
- [ ] **Step 4:** Commit `test(web): Playwright smoke test of the deployed shell`.

### Task 7: CI and GitHub Pages deploy

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the commands from Tasks 1–6.

- [ ] **Step 1:** Write `ci.yml`. It triggers on `push` to `main` and on `pull_request`. Set `concurrency: { group: pages, cancel-in-progress: false }` on the deploy job only. Jobs:
  - `rust` (ubuntu-latest): `dtolnay/rust-toolchain` (it reads `rust-toolchain.toml`) and `Swatinem/rust-cache`, then `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo test --workspace`.
  - `web` (ubuntu-latest): Rust toolchain plus `taiki-e/install-action` with `wasm-pack@0.15.1`, `pnpm/action-setup`, and `actions/setup-node` (`node-version-file: .nvmrc`, `cache: pnpm`). Then `wasm-pack test --node crates/nodal-wasm`, `pnpm install --frozen-lockfile`, `pnpm build:wasm`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm test`. Then `pnpm --filter @nodal/web build`, `node scripts/check-base-path.mjs apps/web/dist`, the Playwright install and `pnpm --filter @nodal/web e2e`. Finally a gzip-size check that fails if the `.wasm` file is ≥ 1 MB gzipped, then `actions/upload-pages-artifact` with `path: apps/web/dist`.
  - `deploy`: `needs: [rust, web]`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, `permissions: { pages: write, id-token: write }`, `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`, using `actions/deploy-pages` with `id: deployment`.
  - Top-level `permissions: { contents: read }`.
- [ ] **Step 2 (manual, Tristan):** In GitHub, open repo Settings → Pages and set Source to **GitHub Actions**.
- [ ] **Step 3:** Push. Expected: all three jobs green. Then run `curl -sI https://tristanhottier.github.io/Nodal/`. Expected: `HTTP/2 200`.
- [ ] **Step 4:** Open the URL in a browser. Expected: `Engine 0.1.0`. In DevTools, the `.wasm` request returns 200 with `content-type: application/wasm`.

### Task 8: Close M0 in the docs

**Files:**
- Modify: `AGENTS.md` (Commands table), `README.md` (status line, Pages link), `docs/ROADMAP.md` (M0 status → done)

- [ ] **Step 1:** Fill the `AGENTS.md` table:
  - Rust tests: `cargo test --workspace`
  - Validation suite: `n/a until M1`
  - WASM build: `pnpm build:wasm`
  - Web dev server: `pnpm --filter @nodal/web dev`
  - Web tests: `pnpm test` and `pnpm --filter @nodal/web e2e`
  - Lint and format: `cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && pnpm lint && pnpm format:check`
- [ ] **Step 2:** README status reads: `pre-alpha: M0 done (empty app shell deployed); no simulation yet.` Add the Pages link. Mark M0 `done` in ROADMAP.
- [ ] **Step 3:** Check every M0 exit criterion against evidence: green CI run URL, Pages URL 200, `Engine 0.1.0` visible, command table filled. Missing evidence means M0 isn't done.
- [ ] **Step 4:** Commit `docs: close M0`.

## M0 → M1 handoff

Not part of M0, listed so nothing gets lost: `nodal-cli` gains `run` and `export-spice` (add clap then); `@nodal/schema` gains the IR Zod schemas; `validation/` is created.
