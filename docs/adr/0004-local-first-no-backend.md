# 0004. Local-first with no backend

- Status: Accepted; hosting amended by [0010](0010-github-pages-hosting.md)
- Date: 2026-11-11

## Context
Nodal is a personal project with no budget for a hosted service. Its intended users are students and hobbyists, some of whom will not want to create an account. Projects must still be shareable.

## Decision
- The application has no server component.
- Projects are stored in the browser's IndexedDB.
- Projects are exported and imported as `.nodal.json` files. Each file carries a `formatVersion` field, and the importer applies forward migrations from older versions.
- The site is a static build. Hosting: see ADR 0010 (GitHub Pages).

## Consequences
Positive:
- There is no backend to operate, secure, or pay for.
- No project data leaves the browser unless a user exports a file.
- Users keep their data as files they control.

Negative:
- Projects live in one browser profile. Clearing site data removes any project that was not exported to a file.
- There are no accounts, sharing links, or cloud sync in v1. Sharing is by file.
- Every format change must ship a migration, or older files stop loading.

## Alternatives considered
- Accounts with a hosted database: rejected, because it requires a backend and ongoing operation.
- Saving to a cloud drive through vendor APIs: rejected, because it adds OAuth and vendor dependence to v1.
- localStorage instead of IndexedDB: rejected, because its storage quota is small and its API is synchronous.
