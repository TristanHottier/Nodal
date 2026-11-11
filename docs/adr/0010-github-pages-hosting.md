# 0010. Host on GitHub Pages

- Status: Accepted
- Date: 2026-11-11
- Amends: [0004](0004-local-first-no-backend.md) (hosting only; the no-backend decision stands)

## Context
ADR 0004 chose a static build deployed to Cloudflare Pages. The code and CI already live on GitHub, and the repository is public, so GitHub Pages is free and needs no second account.

## Decision
- The static build is deployed to GitHub Pages from `main` by a GitHub Actions workflow (`actions/upload-pages-artifact` and `actions/deploy-pages`).
- The site is served as a project site at `https://tristanhottier.github.io/Nodal/`. The Vite `base` is set to `/Nodal/`, and every asset URL, including the WASM module and the worker script, must resolve under that path.
- No custom domain in v1.

## Consequences
Positive:
- Hosting, code and CI sit in one place, with one set of credentials.
- Deploys are tied to CI runs on `main`.

Negative:
- GitHub Pages cannot set custom HTTP headers. Cross-origin isolation (COOP/COEP) is therefore unavailable, and with it `SharedArrayBuffer`. The worker design in ARCHITECTURE §5 already avoids both.
- No per-branch preview deploys.
- The `/Nodal/` sub-path has to be handled in the build. Root-relative URLs break.

## Alternatives considered
- Cloudflare Pages (ADR 0004's original choice): rejected, because it needs a second account. The only feature it adds that matters here is custom headers, which v1 does not need.
- Netlify or Vercel: rejected for the same reason.
