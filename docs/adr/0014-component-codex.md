# 0014. Component codex

- Status: Accepted
- Date: 2026-11-26

## Context

Nodal has no in-app reference. A student who places a diode or runs a transient analysis cannot see which equations the engine uses, which parameters it reads or where it differs from ngspice. M10 adds a codex: one entry for each part type and for net labels (18 entries), the four analyses (operating point, DC sweep, AC, transient) and four core concepts (modified nodal analysis, Newton iteration with its convergence aids, small-signal linearisation, numerical integration with time-step control). That makes 26 entries. Each has prose for students, the equations Nodal uses, parameter tables, and a "Try it" circuit.

Three constraints shape the design. The site is static on GitHub Pages (ADR 0010), which has no SPA fallback and sets no custom headers. The editor's first load is held to the Lighthouse limits in ADR 0013 (LCP at most 2.5 s, CLS at most 0.1, TBT at most 200 ms). The default tokens and the `\dfrac` house rule apply to everything, including maths.

## Decision

### Content: Markdown plus a typed catalog

- Each entry is a Markdown file in `apps/web/src/codex/entries/`. The prose and equations are written once, in one place, and read like a document.
- Entry metadata lives in a typed catalog: id, kind, title, aliases, search keywords, the linked part type and the "Try it" circuit. Related links and the index are built from it, and a test can check that every id has a file.
- Parameter tables are generated from `PARAM_SPECS`, `PARAM_FIELDS` and the symbol defaults, not typed into Markdown. A default changed in code then changes the table, and the two cannot drift.
- The figure for a part is its symbol only, drawn from `SYMBOLS[type].Body` with its pin names. There are no plots.

### Maths: KaTeX and marked at build time

- A Vite plugin turns each Markdown file into HTML during the build. `marked` renders the Markdown and `katex` renders the TeX with `output: 'htmlAndMathml'`. The browser receives finished HTML. No Markdown or TeX parser ships to it.
- `htmlAndMathml` gives sighted readers KaTeX's typesetting and gives screen readers the MathML. KaTeX's CSS and fonts load only with the codex chunk.
- A test rejects `\frac` in entries, so `\dfrac` stays the rule.

### Hash routing

- Entries have the URLs `/Nodal/#/codex/<id>`, and `#/codex` is the browsable index with search. GitHub Pages serves only files that exist, so a path such as `/Nodal/codex/resistor` would return 404 on reload. The fragment never reaches the server, so a reload or a pasted link resolves in the client (ADR 0010).
- Search is a plain client-side filter over title, aliases and keywords, case and accent insensitive. No index library.

### One entry component, two surfaces

- A drawer next to the schematic and a full page render the same entry component. The drawer is a non-modal `aside` that takes the inspector column's place while open, so the canvas keeps its size. It has a close button, Esc closes it, focus moves in on open and returns to the opener on close.
- The App keeps one editor store and one simulation store across routes. Opening a codex page and going back loses no circuit, selection or results, because the stores are never recreated by navigation.
- "Try it" uses the existing `loadExample`, with its replace confirmation, and then returns to the editor.

### Code splitting and the first-load guard

- The codex is a separate chunk behind a dynamic import. The editor's entry chunk never imports it, so the first screen pays nothing for KaTeX or the entry HTML.
- `scripts/check-first-load.mjs` walks the static imports from the built `index.html` and fails if any of them contains KaTeX or codex content. CI runs it next to `check-base-path.mjs`. The CI Lighthouse run remains the evidence for the limits above, and this ADR claims nothing beyond it.

### Sections per kind

A test checks that each entry has the sections for its kind.

- Part: "What it is", "Typical uses", "How it works", "Equations", the generated parameter table, "In the MNA system" (folded by default in a `<details>` titled "Advanced: MNA stamp"), "Differences from ngspice", then the generated "Try it" and related links.
- Analysis: "What it does", "How Nodal solves it", "Equations", "Settings", "Common problems".
- Concept: "What it is", "Equations", "Where Nodal uses it".

### Licences

- `katex` 0.19.1 is MIT. Its `package.json` declares `"license": "MIT"` and the package ships a single `LICENSE` file, the MIT text, with no separate font licence or notice. The README says "KaTeX is licensed under the MIT License". The fonts in `dist/fonts` are part of the same package, so the MIT licence covers them as distributed.
- `marked` 18.2.1 is MIT. It is a devDependency used only at build time and is not in the shipped bundle.
- The KaTeX copyright notice is kept with the shipped fonts and CSS.
- Both licences are credited in the README credits table (M10 Task 12).
## Consequences

Positive:

- Entries are plain Markdown, easy to review and diff, and the equations render without a runtime parser.
- Generated tables follow the specs, and the section and id tests catch structural drift.
- Every entry has a stable, shareable URL that survives a reload on GitHub Pages.
- Going between editor and codex keeps the user's work.

Negative:

- Two new dependencies to keep current, and the KaTeX fonts add weight to the codex chunk. They load only on codex routes.
- Hash URLs are less tidy than path URLs.
- The build now depends on a Vite plugin we maintain, and a malformed entry fails the build rather than the page.
- Equation text is written by hand, so it can be wrong. M10 includes a review of every entry against `docs/reference/` and the engine source.

## Alternatives considered

- KaTeX at runtime: rejected, because the first load would carry the parser and the fonts, and the TBT limit is the one most exposed to that cost. Build-time rendering keeps the browser work to inserting HTML.
- Native MathML alone: rejected, because browser typesetting of larger expressions is less consistent than KaTeX's, and `\dfrac` and the TeX source we already write would have to be hand-converted to MathML.
- Path routing with a `404.html` redirect trick: rejected, because it flashes a 404 response and depends on a workaround. Hash routing needs nothing from the host.
- Entries as TSX components: rejected, because prose and equations would sit inside JSX and be harder to write and review.
- A separate codex site or external docs: rejected, because the drawer next to the schematic and the "Try it" link need the app's stores.
- Hand-written parameter tables: rejected, because defaults would drift from the code.
