# M10 draft: component codex (v1.2.0)

> **Status: draft, not an implementation plan.** A planning session turns this into a full task-by-task plan in the usual format (`docs/plans/<date>-m10-*.md`, with a header, Global Constraints, Review Focus, and tasks with steps). Tristan approves that plan before any code is written.

**Spec:** [`docs/ROADMAP.md`](../ROADMAP.md) §M10.

## Why

Tristan asked on 2026-11-26 for "some sort of dictionary/codex of the various components, explaining how they work, what they do, some equations".

Nodal already holds this knowledge, but only for developers. `docs/reference/devices.md` and `docs/reference/mna.md` have the model equations, and the parameter specs live in a JSON fixture. A user in the app sees part names and parameter fields, and nothing explains what a BJT's `VAF` does or why a capacitor is open in DC. The codex brings that knowledge into the app, written for a student or hobbyist, while staying exact enough for an engineer.

## What exists today (checked at `3f58ad6`)

- **Part types:** 17, in `packages/schema/src/schematic.ts` (`PART_TYPES`): resistor, capacitor, inductor, vsource, isource, vcvs, vccs, ccvs, cccs, diode, npn, pnp, nmos, pmos, switch, opamp, ground. Net labels are a separate document item.
- **Symbols:** `apps/web/src/symbols/`, one file per part. `SYMBOLS` holds `prefix`, `pins`, `bounds`, `defaultParams` and `Body`.
- **Editor fields per part:** `apps/web/src/editor/params.ts`.
- **Model parameters:** names, units and defaults are in `packages/schema/fixtures/param-specs.json`. Rust and TS share it, and drift tests guard it on both sides.
- **Equations and conventions:**
  - `docs/reference/devices.md` covers the diode, BJT (Gummel–Poon subset), MOSFET Level 1 and switch, plus the known deviations from ngspice.
  - `docs/reference/mna.md` covers the stamps, companion models and the AC analysis.
  - `docs/reference/numerical-methods.md` covers Newton and integration.
  - Constants are CODATA 2014 values, confirmed against ngspice-42 (M2).
- **Shell:** the top bar, tool rail, grouped parts panel and inspector (ADR 0013). Tooltips live in `editor/Tooltip.tsx`.
- **Examples:** 8 example circuits in `apps/web/src/examples/`. Every part type appears in at least the reference schematics (`validation/schematics/`, 31).
- **Constraints already in force:**
  - The token-only CSS rule.
  - Dark-mode screenshots.
  - Lighthouse limits (mobile TBT was 61 to 235 ms in M9, so close to the 200 ms limit).
  - The main JS chunk is 537 kB (M9 finding A10).

## Scope

**In:**
- One codex entry per part type and for net labels. Possibly also short entries for the four analyses and for core concepts such as ground, MNA, small-signal and gmin, if Tristan wants them (see Decisions).
- Entry points:
  - a "?" or "About" action on each parts-panel item;
  - a link in the inspector for the selected part;
  - a browsable, searchable codex view.
- Maths rendering that works offline and adds nothing to the editor's first load.
- Tests that tie entries to the specs, so they can't drift.

**Out:** engine changes, new devices, new parameters, editing parameters from the codex, translations (all docs and UI stay English).

## Decisions for the planning session

The planning session should put each of these to Tristan grill-me style, with a recommended answer, and record the outcome in the plan or a new ADR.

1. **Where the codex lives.** Options:
   - (a) A panel or drawer inside the editor.
   - (b) A separate route or page in the same app (for example `/Nodal/codex/…`), linkable and indexable.
   - (c) Both: a drawer that opens the entry, plus a full page.

   Recommended: (c). Each entry has its own URL, so the README and issues can link to it.
2. **Content source.** Options:
   - (a) Markdown or MDX files per entry, with frontmatter that a test checks against `param-specs.json`.
   - (b) TS data objects.
   - (c) Generate parameter tables from the specs and hand-write the prose.

   Recommended: (c), with hand-written prose in Markdown per entry.
3. **Maths rendering.** Options:
   - KaTeX (MIT), pre-rendered at build time to HTML + MathML, which needs no runtime JS and only a lazy-loaded font/CSS.
   - Native MathML, which browsers now render but which is plainer.

   Check the Lighthouse cost and the self-hosted fonts. Recommended: KaTeX at build time. The `\dfrac` house rule applies.
4. **Depth per entry.** Which sections are mandatory? The proposal is: what it is, how it works (intuition), equations, parameters table, MNA stamp, gotchas and deviations from ngspice, and a "try it" example. Decide whether MNA stamps belong in a user-facing codex or in an "Advanced" fold.
5. **Concept and analysis entries:** add entries for DC operating point, DC sweep, AC, transient, ground, gmin and convergence, or keep the codex to parts only?
6. **Illustrations:**
   - the symbol only;
   - the symbol plus a small characteristic plot (diode I–V, MOSFET output curves) generated from the engine at build time;
   - or static SVG.

   Plots computed by Nodal's own engine would double as a sanity check.
7. **Search:** plain client-side filter over names, aliases (for example "NPN", "BJT", "transistor") and keywords, or none in v1.2.
8. **Who reviews the equations:** an Opus reviewer against `docs/reference/` and the engine source (the plan's suggestion), and/or Tristan.
9. **Version:** this adds a feature, so `1.2.0` per SemVer.

## Suggested shape (the planning session refines it)

1. **Codex data model and drift tests (TDD).** An entry schema (Zod). One entry stub per part type. Tests that fail when a part type has no entry, or when a parameter, unit or default differs from `param-specs.json` and `params.ts`.
2. **Maths pipeline.** The chosen renderer, set up at build time. A test that every formula compiles. Lighthouse and bundle-size check, so the codex is code-split away from the editor's first load.
3. **Codex view and routing.** The browsable list, search if chosen, the entry page or drawer, and deep links under `/Nodal/`. `check-base-path.mjs` must still pass.
4. **Entry points.** The parts-panel action, the inspector link, keyboard paths, and a11y (axe both themes), plus an e2e test for all three paths.
5. **Content, passives and sources:** resistor, capacitor, inductor, V and I sources (DC, AC, pulse, sine, PWL waveforms), ground, net label.
6. **Content, controlled sources and op-amp:** VCVS, VCCS, CCVS, CCCS, and the op-amp macro.
7. **Content, semiconductors and switch:** diode, NPN, PNP, NMOS, PMOS, switch. This is the heaviest task: equations per operating region, charges and limiting, in plain words.
8. **Equation review:** an Opus subagent checks every formula against `docs/reference/` and the engine source, and its findings are fixed. Plus Tristan's review if decided.
9. **Close:** user guide section, README feature line and screenshots (dark), CHANGELOG `[1.2.0]`, version bump `1.1.0` → `1.2.0` everywhere it is pinned, CI green including Lighthouse, `docs: close M10`, and Tristan creates the `v1.2.0` tag.

## Constraints the full plan must carry

- Everything in `AGENTS.md`:
  - commits authored by `TristanHottier <185231225+TristanHottier@users.noreply.github.com>` on `main`, with no AI co-author lines;
  - the humanizer on all prose (entry text included);
  - Sonnet subagents for delegated work, with an Opus final review;
  - Dependabot updates re-committed under Tristan's name, never merged on GitHub;
  - dark-mode screenshots.
- Content accuracy follows the docs rule: no claim without a test, a reference or the engine source behind it. Equations use the same symbols, sign conventions and constants as `docs/reference/`. Use `\dfrac`, not `\frac`.
- No raw colour or size values outside `tokens.css`. Contrast is checked from tokens in both themes.
- The codex must not raise the editor's first load. Keep the Lighthouse limits (LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms on the Pages URL) and the M7 performance budget.
- New dependencies must be at least 7 days old, and their licences must be checked and credited.
- Visual baselines come from CI renders.
- Tags are created by Tristan, because the sandbox can't push them.

## Review Focus seeds

1. **Drift:** changing a default in `param-specs.json` must fail a codex test.
2. **Sign conventions:** the current direction for sources, controlled sources and BJT/MOSFET terminals must match `docs/reference/mna.md`. A flipped sign in a user-facing doc is worse than no doc.
3. **First load:** opening the editor must not download the maths renderer or the codex content.
4. **Deep links under `/Nodal/`:** a reload on a codex URL must not 404 on GitHub Pages, which has no SPA fallback. Use hash routing, `404.html` or pre-rendered pages.
5. **Narrow screens:** below 1024 px the editor is read-only, but the codex should stay fully usable there, since it is reading-only content.
