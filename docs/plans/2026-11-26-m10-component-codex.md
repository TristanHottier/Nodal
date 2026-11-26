# M10: Component codex (v1.2.0), implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a codex to the web app: one entry for each part type and for net labels, the four analyses and four core concepts. Each entry has prose for students, the equations Nodal uses (rendered as maths), parameter tables generated from the specs, and a "Try it" circuit. Entries open in a drawer next to the schematic or as full pages with their own URLs. Ship as `v1.2.0`.

**Architecture:** Entries are Markdown files in `apps/web/src/codex/entries/`. A Vite plugin turns each one into HTML at build time, with marked for the Markdown and KaTeX for the maths (HTML + MathML output). No Markdown or TeX parser runs in the browser. Entry metadata (id, kind, aliases, linked part type, "Try it" circuit) lives in a typed catalog, and parameter tables are built from `PARAM_SPECS`, `PARAM_FIELDS` and the symbol defaults, so defaults can't drift. The codex is code-split: the editor's entry chunk never imports it. Hash routing (`/Nodal/#/codex/<id>`) gives each entry a URL that survives a reload on GitHub Pages, which has no SPA fallback. The App keeps one editor store and one simulation store across routes, so going to a codex page and back loses nothing.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Zustand, Vitest, Playwright, `@axe-core/playwright`, `lighthouse` (CI). New: `katex` 0.19.1 (MIT, released 2026-10-23) as a dependency, because its CSS and fonts ship with the codex chunk, and `marked` 18.2.1 (MIT, released 2026-11-16) as a devDependency, used only at build time. Both were more than 7 days old on 2026-11-26.

**Spec:** `docs/ROADMAP.md` §M10. The drafts for M9 and M10 were deleted when this plan was committed (Tristan's request, 2026-11-26).

## Decisions (Tristan, 2026-11-26)

1. **Placement: a drawer and a full page.** A drawer in the editor shows an entry next to the schematic. Every entry also has a page at `#/codex/<id>`, and `#/codex` is the browsable index with search.
2. **Maths: KaTeX at build time,** output `htmlAndMathml`, so screen readers get MathML. The KaTeX CSS and fonts load only with the codex chunk. The `\dfrac` house rule applies, and a test rejects `\frac`.
3. **Scope: parts, analyses and concepts.** That makes 26 entries:
   - 18 parts: the 17 in `PART_TYPES` and the net label;
   - 4 analyses: operating point, DC sweep, AC, transient;
   - 4 concepts: modified nodal analysis, Newton iteration and convergence aids (limiting, gmin and source stepping), small-signal linearisation, numerical integration and time-step control.
4. **Figures: the symbol only,** drawn from `SYMBOLS[type].Body` with its pin names. No plots.
5. **Pin names on the drawing** (Tristan, later the same day): each pin's name is shown next to its end on the codex symbol, not only listed in text (Task 5b).

## Rulings made in planning (Tristan can override)

- **Sections per kind.** A test checks them (Task 3).
  - **Part:** "What it is", "Typical uses", "How it works", "Equations", the generated parameter table, "In the MNA system" (folded by default in a `<details>` titled "Advanced: MNA stamp"), "Differences from ngspice", then the generated "Try it" and related links.
  - **Analysis:** "What it does", "How Nodal solves it", "Equations", "Settings", "Common problems".
  - **Concept:** "What it is", "Equations", "Where Nodal uses it".
- **Search:** a plain client-side filter over title, aliases and keywords (case- and accent-insensitive). No index library.
- **Equation review:** an Opus subagent checks every entry against `docs/reference/` and the engine source (Task 11), and the review is recorded in this plan. Tristan may add his own review before the tag.
- **Try it:** every part entry links to a bundled example. Seven parts have none today (`isource`, `vcvs`, `vccs`, `ccvs`, `cccs`, `pnp`, `switch`), so Task 6 adds four examples:
  - three are copies of reference circuits already checked against ngspice goldens (L3, L5 and T6-trap);
  - one is a new NPN/PNP push-pull follower, compared with ngspice-42 before it is committed.
- **"Try it" from the codex** uses the existing `loadExample` (with its replace confirmation), then returns to the editor.
- **Drawer behaviour:** a non-modal `aside` with a close button. Esc closes it, focus moves into it on open and back to the opener on close. The drawer takes the inspector column's place while open, and the canvas keeps its size.
- **First-load guard:** a new script `scripts/check-first-load.mjs` walks the static imports from the built `index.html` and fails if any of them contains KaTeX or codex content. CI runs it next to `check-base-path.mjs`.

## Global Constraints

- **Scope:** the codex, its entry points and the four examples only. No engine, IR, file-format, device or parameter change. No translations.
- **Accuracy:** every equation, sign and default must match `docs/reference/devices.md`, `mna.md`, `numerical-methods.md` and the engine source. Use the same symbols and current directions as those docs. Defaults are never typed by hand in entries; tables come from the specs. No claim without a test, a reference or the engine source behind it.
- **LaTeX:** `\dfrac`, never `\frac` (enforced by a test).
- **Tokens:** colours and sizes only in `apps/web/src/theme/tokens.css`, dark values in both dark blocks, and `noRawValues.test.ts` stays green. The KaTeX stylesheet comes from `node_modules` and is exempt; it uses `currentColor`, so maths follows the theme.
- **First load:** the editor's entry chunk and its static imports contain no KaTeX and no codex content (`check-first-load.mjs`). Lighthouse limits on the Pages URL still hold on mobile and desktop: LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms. The M7 perf budget still holds (editor 60 fps with 500 parts, tran50, ac50).
- **Accessibility:** axe WCAG 2.2 AA in both themes on the codex index, an entry page and the open drawer. Every entry point works from the keyboard. Maths carries MathML.
- **Narrow screens:** the codex page is fully usable below 1024 px. The read-only editor rule doesn't apply to it.
- **Base path:** links use hash URLs under `/Nodal/`, and `check-base-path.mjs` still passes.
- **Screenshots:** every doc and README screenshot is taken in dark mode. Visual baselines come from CI renders (copy `*-actual.png` from the `playwright-report` artifact), and the commit says when they change on purpose.
- **Repo rules** (AGENTS.md and the session doc):
  - commits on `main` by `TristanHottier <185231225+TristanHottier@users.noreply.github.com>`, Conventional Commits, no co-author or "Generated with" lines;
  - humanizer on all prose, entry text included, and it must never change maths, numbers, code or links;
  - English only; files under about 400 lines;
  - never `minimumReleaseAgeExclude`; credit the new licences in the README.
- **Sandbox:** build with `NODAL_WASM_NO_OPT=1`. The sandbox can't push tags, so Tristan creates `v1.2.0`.

## Review Focus

1. **Drift:** changing a default or removing a key in `PARAM_SPECS`, `PARAM_FIELDS` or a symbol's `defaultParams` must fail `catalog.test.ts`. A backticked model key in an entry that no spec has must fail `entries.test.ts` (Tasks 2, 3).
2. **Sign conventions:** source, controlled-source, BJT and MOSFET current directions match `mna.md` and `devices.md`. A flipped sign is worse than no doc (Tasks 7 to 11).
3. **First load:** opening `/Nodal/` downloads neither KaTeX nor any entry. Pinned by `check-first-load.mjs` in CI and the Lighthouse job (Tasks 4, 12).
4. **Deep links:** a reload on `/Nodal/#/codex/diode` shows the diode entry on `vite preview` and on the Pages URL. Back and forward move between codex pages and the editor without losing the open project (Task 4).
5. **Focus and Esc:** the drawer's Esc must not also clear the editor selection or tool, and focus returns to the opener (Task 5).
6. **Untrusted HTML:** the plugin escapes raw HTML in Markdown, so only marked's and KaTeX's own output reaches `dangerouslySetInnerHTML`, and KaTeX runs with `trust: false` (Task 3).

## Exit-criteria map (ROADMAP §M10)

| Exit criterion | Evidence |
|---|---|
| Every part type has an entry; a test fails if a part type, parameter or default is missing or differs | `catalog.test.ts`, `entries.test.ts` (Tasks 2, 3, 7 to 10) |
| Reachable by mouse and keyboard from the parts panel, the inspector and the codex view; one e2e covers all three | `codex.spec.ts` on Chromium and Firefox (Task 5) |
| axe WCAG 2.2 AA in both themes; maths has accessible text | `codex.spec.ts` axe cases; MathML assertion in `codexMarkdown.test.ts` (Tasks 3, 5) |
| No regression: M8/M9 checks, Lighthouse on Pages, M7 budget | CI run URL incl. `lighthouse` and `e2e:perf` (Task 12) |
| An engineer reviews the equations | "Equation review" section below, filled in Task 11 |
| User guide and README mention it, dark screenshots; `1.2.0` everywhere; `v1.2.0` tag | Task 12; tag by Tristan |

---

### Task 1: ADR 0014 for the codex architecture

**Files:**
- Create: `docs/adr/0014-component-codex.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Write ADR 0014**, status Accepted (Tristan's decisions, 2026-11-26). Record:
  - content as Markdown plus a typed catalog, with parameter tables generated from the specs;
  - build-time KaTeX (HTML + MathML) with marked through a Vite plugin, and why not runtime rendering (first load, TBT) or native MathML alone (typesetting, `\dfrac`);
  - hash routing, because GitHub Pages has no SPA fallback (ADR 0010);
  - drawer and page sharing one entry component, and stores that live across routes;
  - code-splitting and the first-load guard;
  - the section list per kind;
  - the licences (KaTeX MIT, including its fonts; marked MIT).

  Check the KaTeX font licence in `node_modules/katex/LICENSE` before writing it. Run the humanizer.
- [ ] **Step 2: Commit** `docs: ADR 0014 component codex`. Push.

### Task 2: Codex catalog, parameter docs and drift tests (TDD)

**Files:**
- Create: `apps/web/src/codex/catalog.ts`, `apps/web/src/codex/paramDocs.ts`, `apps/web/src/codex/paramTable.ts`, `apps/web/src/codex/catalog.test.ts`, `apps/web/src/codex/paramTable.test.ts`

**Interfaces:**
- `type EntryKind = "part" | "analysis" | "concept"`.
- `interface CodexEntryMeta { id: string; kind: EntryKind; title: string; aliases: readonly string[]; keywords: readonly string[]; item?: PartType | "label"; model?: ModelKind; analysis?: "op" | "dc" | "ac" | "tran"; tryIt?: string /* EXAMPLES id */; related: readonly string[] }`.
- `CODEX: readonly CodexEntryMeta[]`, in reading order: parts by palette group, then analyses, then concepts. Ids are kebab-case, and part ids equal the palette item (`npn`, `label`, …).
- `entryForItem(item: PartType | "label"): CodexEntryMeta`.
- `paramDocs.ts`:
  - `MODEL_PARAM_DOCS: Record<ModelKind, Record<string, { meaning: string; unit: string }>>`, where `unit` is `""` for dimensionless values;
  - `FIELD_DOCS: Record<PartType, Record<string, string>>`, the meaning of each `PARAM_FIELDS` key.
- `paramTable.ts`:
  - `fieldRows(type: PartType): { key; label; unit; default; meaning; when? }[]` from `PARAM_FIELDS`, `SYMBOLS[type].defaultParams` and `FIELD_DOCS`;
  - `modelRows(kind: ModelKind): { key; unit; default /* "∞", "1/gmin" or formatValue */; meaning }[]` from `PARAM_SPECS` and `MODEL_PARAM_DOCS`.

  Both take their sources as optional arguments (defaulting to the real ones), so tests can pass mutated copies.

- [ ] **Step 1: Write the tests.**
  - `catalog.test.ts`:
    - every `PALETTE` item has exactly one part entry;
    - there are exactly 4 analysis entries (op, dc, ac, tran) and 4 concept entries;
    - ids are unique and kebab-case;
    - every `related` id exists;
    - every part entry's `tryIt` names an `EXAMPLES` id whose project contains that item. The net label needs a project with a label. `ground` may use any example;
    - `model` is set exactly for diode, npn, pnp, nmos, pmos and switch, and equals the `modelTypes` in `PARAM_FIELDS`;
    - `MODEL_PARAM_DOCS[kind]` keys equal `PARAM_SPECS[kind]` keys, in both directions;
    - `FIELD_DOCS[type]` keys equal the `PARAM_FIELDS[type]` keys (deduplicated: `td` appears twice);
    - meanings are non-empty.
  - `paramTable.test.ts`:
    - rows follow spec order;
    - defaults are formatted from the spec: VAF shows "∞" and ROFF "1/gmin";
    - a mutated spec copy (BF 100 → 50) changes the row;
    - a spec copy with an extra key makes `modelRows` throw "undocumented parameter";
    - a docs copy missing a key throws.

  `PARAM_SPECS` has no units, so units live in `MODEL_PARAM_DOCS`. Take them from `devices.md` and the ngspice manual, and the Task 11 review checks them.
- [ ] **Step 2: Run** `pnpm --filter @nodal/web exec vitest run src/codex`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement.** Write the 26 catalog entries without `tryIt` for the seven parts that Task 6 covers; mark those test cases `it.todo` until then. Write all parameter meanings in plain words, one sentence each.
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): codex catalog and generated parameter tables`. Push.

### Task 3: Markdown and KaTeX build pipeline (TDD)

**Files:**
- Create: `apps/web/build/codexMarkdown.ts` (pure `renderEntry(source: string, kind: EntryKind, id: string): { html: string; title: string }` plus the Vite plugin `codexMarkdown()` that handles `*.md?codex` imports), `apps/web/build/codexMarkdown.test.ts`, `apps/web/src/codex/entries/` (26 stub files with the required headings and one `TODO` line each), `apps/web/src/codex/entries.ts` (`loadEntry(id)` via `import.meta.glob("./entries/*.md", { query: "?codex", import: "default" })`), `apps/web/src/codex/entries.test.ts`, `apps/web/src/codex/md.d.ts`
- Modify: `apps/web/vite.config.ts` (plugin), `apps/web/tsconfig.node.json` (include `build/`), `apps/web/package.json` (`katex` 0.19.1 dependency, `marked` 18.2.1 devDependency, exact pins), `pnpm-lock.yaml`

**Rules the renderer enforces (each throws with the entry id and line):**
- The first line is `# <title>`, and the title must equal the catalog title (checked in `entries.test.ts`).
- Maths: `$…$` inline and `$$…$$` display, rendered with `katex.renderToString(tex, { displayMode, output: "htmlAndMathml", throwOnError: true, strict: "error", trust: false })`.
- `\frac` anywhere in TeX throws ("use \dfrac").
- Raw HTML in Markdown is escaped, not passed through.
- Required `## ` sections per kind, in the order of the rulings above. The part slot is a line `{{parameters}}`, which becomes `<div data-codex-slot="parameters"></div>`. The "In the MNA system" section is wrapped in `<details class="nodal-codex-advanced"><summary>Advanced: MNA stamp</summary>…</details>`.
- Headings get stable ids (`what-it-is`, …) so the page can link to sections.

- [ ] **Step 1: Write `codexMarkdown.test.ts`:**
  - inline and display maths produce `<math` (MathML) and `class="katex"`;
  - a `$` inside a code span is not maths;
  - `\frac{1}{2}` throws, `\dfrac{1}{2}` renders;
  - invalid TeX (`\dfrac{1}`) throws with the entry id;
  - `<script>` in Markdown is escaped;
  - a missing or out-of-order section throws;
  - the slot and the `<details>` wrapper appear;
  - heading ids are stable.
- [ ] **Step 2: Write `entries.test.ts`** (node environment):
  - every catalog id has a file and every file has a catalog id;
  - each file renders with `renderEntry`;
  - the title matches the catalog;
  - every backticked token that looks like a model key (`/^[A-Z][A-Z0-9]{1,5}$/`) in a part entry with a `model` is a key of `PARAM_SPECS[model]` or on a short allowlist (`NPN`, `PNP`, `NMOS`, `PMOS`, `DC`, `AC`, `MNA`);
  - no entry body still contains `TODO` once Task 10 is done. Until then the test runs that check as `it.todo`, and Task 10 turns it on.
- [ ] **Step 3: Run** both tests. Expected: FAIL.
- [ ] **Step 4: Implement** the renderer with marked's extension API (tokenizer for inline and block maths, run before code spans), the plugin, and the stubs. Add both packages with exact versions.
- [ ] **Step 5: Run** the tests, then `pnpm lint`, `pnpm typecheck` and `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web build`. Expected: PASS, and the build emits one chunk per entry plus a KaTeX CSS asset that nothing loads yet.
- [ ] **Step 6: Commit** `feat(web): build-time Markdown and KaTeX for codex entries`. Push.

### Task 4: Codex routes, page, search and first-load guard

**Files:**
- Create:
  - `apps/web/src/codex/route.ts` and `route.test.ts`: `parseRoute(hash): { view: "editor" } | { view: "codex"; id: string | null }`, `codexHref(id?)`, and `useRoute()`, which listens to `hashchange`;
  - `apps/web/src/codex/search.ts` and `search.test.ts`: `searchCodex(query, entries)`, ranked by title prefix, then title substring, then alias, then keyword. Case and accents are ignored. An empty query returns everything in catalog order;
  - `apps/web/src/codex/CodexPage.tsx` (default export, lazy): index and entry view, "Back to editor", search box, and entries grouped by kind;
  - `apps/web/src/codex/CodexEntry.tsx`, shared by the page and the drawer: header with the title, kind and aliases, the symbol SVG with pin names (reuse `Palette`'s preview approach, plus the `nodal-symbol` stroke rule), the HTML body split at the parameters slot, the parameter tables, "Try it" and related links;
  - `apps/web/src/codex/ParamTable.tsx`;
  - `apps/web/src/codex/Codex.css`;
  - `apps/web/src/codex/CodexPage.test.tsx`, `CodexEntry.test.tsx`;
  - `scripts/check-first-load.mjs` and `scripts/check-first-load.test.mjs`.
- Modify:
  - `apps/web/src/App.tsx`: `useRoute()`. The codex view renders `lazy(() => import("./codex/CodexPage"))` inside `Suspense`; the editor view renders `<Editor>`. The stores and engine are created once in App as today. `document.title` per route: "Nodal", "Codex · Nodal", "<title> · Codex · Nodal";
  - `App.test.tsx`;
  - `apps/web/src/theme/tokens.css` (codex layout tokens, both dark blocks);
  - `.github/workflows/ci.yml` (`node scripts/check-first-load.mjs apps/web/dist` after `check-base-path`).

- [ ] **Step 1: Tests first.**
  - `route.test.ts`: `""`, `#/`, `#/codex`, `#/codex/diode`, an unknown id (the page shows "No entry called …" with a link to the index), stray slashes.
  - `search.test.ts`: "transistor" finds npn, pnp, nmos and pmos; "BJT" finds npn and pnp; "Résistance" with accents finds resistor through an alias; ranking order; empty query.
  - `CodexEntry.test.tsx` (jsdom, mocked `loadEntry`): renders the title, pin names, the parameter table from `modelRows`, a "Try it" button and related links.
  - `App.test.tsx`: the hash route switches views and the store instance survives.
  - `check-first-load.test.mjs`: on a fixture dist, an entry that statically imports a chunk containing `katex` fails, and a dynamic `import()` passes.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `import "katex/dist/katex.min.css"` only in `CodexEntry.tsx`. "Try it" calls `loadExample(store, example)` and then sets `location.hash = "#/"`; it needs the editor store, which App passes down as a prop. Write `check-first-load.mjs`: read `dist/index.html`, collect `<script type="module" src>` and `modulepreload` hrefs, follow static `import … from "./x.js"` and bare `import "./x.js"` in each chunk (not `import(`), and fail if any reached file contains `katex` or `data-codex-slot`, or if any stylesheet linked from `index.html` contains `.katex`.
- [ ] **Step 4: Run** unit tests, the build, `node scripts/check-base-path.mjs apps/web/dist`, `node scripts/check-first-load.mjs apps/web/dist` and `node --test "scripts/*.test.mjs"`. Expected: PASS.
- [ ] **Step 5: Look at it.** Take Playwright screenshots of `vite preview` at `#/codex` and `#/codex/diode` (stub content), at 1280 and 600 px, in both themes. Reload the deep link and check it renders.
- [ ] **Step 6: Commit** `feat(web): codex page, hash routes and search`. Push; CI green.

### Task 5: Entry points, drawer, keyboard paths and e2e

**Files:**
- Create: `apps/web/src/codex/CodexDrawer.tsx` (lazy; `aside` labelled "Codex", heading with the entry title, close button, "Open full page" link to `codexHref(id)`, and `CodexEntry` inside), `CodexDrawer.test.tsx`, `apps/web/e2e/codex.spec.ts`
- Modify:
  - `apps/web/src/editor/store.ts`: `codexEntry: string | null`, `openCodex(id)`, `closeCodex()`, kept outside undo history, and its test;
  - `apps/web/src/editor/Palette.tsx` and its CSS: each item gets a small Lucide `Info` icon button, named `About <full name>`, with a tooltip. It is a separate tab stop after its place button;
  - `apps/web/src/editor/inspector/Inspector.tsx` (or `PartFields.tsx`): an "About this part" link button under the part name, plus an "About this analysis" button in the analysis editor;
  - `apps/web/src/editor/TopBar.tsx`: a "Codex" link to `#/codex`, with the Lucide `BookOpen` icon and a visible label;
  - `apps/web/src/editor/Editor.tsx` and `Editor.css`: when `codexEntry` is set, the lazy drawer replaces the inspector column;
  - the matching tests, and `apps/web/e2e/a11y.spec.ts`.

- [ ] **Step 1: Write `codex.spec.ts`** (Chromium and Firefox):
  - **Parts panel:** Tab to "About Diode" and press Enter. The drawer shows "Diode", focus is inside it, and the maths has a `math` element. Esc closes it, focus returns to the button, and the editor selection is unchanged. Then the same with a mouse click.
  - **Inspector:** place an NPN, select it, and activate "About this part". The drawer shows "NPN transistor"; "Open full page" goes to `#/codex/npn`.
  - **Codex view:** the top-bar "Codex" link, type "mosfet" in search, open NMOS by keyboard. Reload, and the entry is still shown. Browser back returns to the editor with the placed NPN still there.
  - **Try it:** on `#/codex/rc-lowpass`'s capacitor entry, "Try it" loads the example in the editor (accept the confirm dialog).
  - **Narrow:** at 600 px wide, `#/codex/diode` is readable and its search works.
  - **axe** WCAG 2.2 AA in light and dark on the index, an entry page and the open drawer.
- [ ] **Step 2: Run** `NODAL_WASM_NO_OPT=1 pnpm --filter @nodal/web e2e -- codex.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Esc handling: the drawer's `keydown` calls `stopPropagation` so the editor shortcuts don't see it (check `useShortcuts.ts`). Opening the drawer must not change the selection or the tool.
- [ ] **Step 4: Run** the unit tests and the full e2e suite (`a11y`, `responsive`, `shell`, `layout`, `editor`, `codex`) on both browsers. Run `colorShare.spec.ts` too. Expected: PASS.
- [ ] **Step 5: Look at it:** screenshots of the palette with info buttons and of the open drawer, at 1024 and 1280 px in both themes. Check that the palette still fits at 1024 px.
- [ ] **Step 6: Commit** `feat(web): open codex entries from the parts panel, inspector and top bar`. Push. The `visual` baselines will change because of the palette; take the new ones from this CI run's artifact and commit them as `test(web): visual baselines for the palette info buttons`.

### Task 5b: Pin names on the codex symbol

**Files:** Modify `apps/web/src/codex/CodexEntry.tsx` (or a new `codex/SymbolFigure.tsx`), `Codex.css`, `tokens.css`, their tests.

- [ ] **Step 1: Test first:** the codex symbol SVG has one text label per `SYMBOLS[type].pins` entry, placed at the pin end and pushed outward from the body, plus a dot at each pin end. Net label and ground included.
- [ ] **Step 2: Implement.** Labels in the mono font, sized from tokens, `currentColor`-based so both themes work. The SVG keeps a text alternative naming the pins.
- [ ] **Step 3: Look at it:** screenshots of every part entry's symbol (both themes) in one contact sheet; no label overlaps the body or another label.
- [ ] **Step 4: Commit** `feat(web): pin names on codex symbols`. Push.

### Task 6: Four examples so every part has a "Try it"

**Files:**
- Create in `apps/web/src/examples/`:
  - `controlled-sources.nodal.json` (from `validation/schematics/L3`);
  - `current-source-lc.nodal.json` (from L5);
  - `switch-hysteresis.nodal.json` (from T6-trap);
  - `push-pull.nodal.json` (new: an NPN/PNP complementary emitter follower with ±5 V rails, a 1 V 1 kHz sine and a 1 kΩ load; transient over 2 ms; models with only IS and BF).
- Modify: `apps/web/src/examples/index.ts`, `examples.test.ts`, `apps/web/src/codex/catalog.ts` (`tryIt` for the seven parts; turn the `it.todo`s on)

- [ ] **Step 1: Copy the three reference circuits.** Rename them for users, keep their analyses, and tidy the layout only if they look cramped on the canvas. Their `examples.test.ts` values come from the existing goldens: L3 one node voltage, L5 one node at op, T6-trap one point after the switch turns on.
- [ ] **Step 2: Draw the push-pull follower and preview it against ngspice-42.** Install it with `apt-get update && apt-get install ngspice`. Run `nodal-cli export-spice`, add `.control / run / wrdata`, and compare one output point (the peak near 0.25 ms) with interpolation. Expect a small mismatch, and record both values in the commit body.
- [ ] **Step 3: Run** `pnpm test` (the examples test needs the wasm pkg) and `examples.spec.ts`. Expected: PASS.
- [ ] **Step 4: Look at** each new example in Chromium: open it, run it, take a screenshot.
- [ ] **Step 5: Commit** `feat(web): examples for controlled sources, current source, switch and push-pull`. Push.

### Tasks 7 to 10: Entry content

Each content task follows the same steps:

1. Read the matching sections of `docs/reference/` and the engine source (`crates/nodal-engine/src/devices/*.rs`, `analysis/*.rs`). Write each entry in the section order for its kind. Write for a second-year student: intuition first, then the equations Nodal uses, with the same symbols and current directions as the reference docs. Use SI units, and refer to model keys as `` `KEY` ``.
2. Never type a default value in prose; point to the table. Equations in `\dfrac`.
3. Run the humanizer on the prose. Then diff the TeX before and after: the humanizer must not change a single character inside `$…$`.
4. Run `pnpm --filter @nodal/web exec vitest run src/codex` and the build. Expected: PASS.
5. Take a Chromium screenshot of each entry in dark mode, plus one in light mode for the task, at 1024 px. Check that no maths overflows, display maths scrolls horizontally rather than clipping, and the MNA fold opens.
6. A Sonnet reviewer checks the entries against the reference sections. The Opus pass comes in Task 11.
7. Commit `docs(web): codex entries for <group>`, then push.

- [ ] **Task 7: Passives, independent sources, ground and net label** (7 entries).
  - Resistor, capacitor and inductor: their companion models (`mna.md` §3, with trap and gear left to the integration concept), plus `ic`.
  - V and I sources: DC, AC magnitude and phase, and the pulse, sin and PWL formulas exactly as `tran_value` computes them, including the `td` and `theta` defaults, and the t = 0 operating-point rule (M4 facts).
  - Ground: node 0 as the reference, and why every circuit needs one (the topology checks, `mna.md` §6).
  - Net label: connection by name, which is a netlister rule; ARCHITECTURE §6.2 has the naming rules.
- [ ] **Task 8: Controlled sources, op-amp and switch** (6 entries).
  - The four controlled sources with their gain symbols ($\mu$, $g_m$, $r$, $\beta$) and the controlling-source rule for CCVS and CCCS.
  - The op-amp as the v1 VCVS macro: gain, the `E` prefix, and what it can't model (no rails, slew or bandwidth).
  - The switch: VT, VH, RON, ROFF and hysteresis, crossing location by step rejection, and the early-switch difference from ngspice (`devices.md` §4 and §5).
- [ ] **Task 9: Semiconductors** (5 entries; the heaviest task, so use one Sonnet builder per entry).
  - Diode: the exponential law with `N`, `RS` as an internal node, the depletion charge with `FC` linearisation, transit-time charge, pnjlim in plain words, and the `M` limit (`devices.md` §1).
  - NPN and PNP: the Gummel–Poon subset (transport form, `VAF` as Early, `BF` and `BR`), charges, substrate gmin placement, and the PNP sign mirror.
  - NMOS and PMOS: Level 1 regions (cutoff, linear, saturation) with `LAMBDA` and body effect, overlap capacitances only and no Meyer caps, bulk junction diodes with `IS`, source/drain swap, and the gmbs and limiting deviations.
- [ ] **Task 10: Analyses and concepts** (8 entries).
  - Op: Newton, then the fallbacks in order (`numerical-methods.md` §1.4).
  - DC sweep: the warm-start continuation and the cold-chain fallback.
  - AC: linearise at the op, the complex MNA, and the frequency grid. Include the `lin` 2-point deviation and the phase rule near zero magnitude.
  - Transient: integration, LTE step control, breakpoints, `uic`, and the "Transient treats a singular Newton matrix as fatal" limitation.
  - Concepts: MNA, Newton and convergence aids, small-signal, integration and time-step control.
  - Analysis "Settings" sections list the fields in `AnalysisEditor`. The test from Task 3 checks that each field label named there exists.
  - Turn on the no-`TODO` check in `entries.test.ts`.

### Task 11: Equation review (Opus) and fixes

- [ ] **Step 1: Dispatch an Opus reviewer.** Give it all 26 entries (Markdown source and a rendered screenshot of each), `docs/reference/*.md`, the engine device and analysis sources, `param-specs.json` and the units table in `paramDocs.ts`. It checks:
  - every equation symbol by symbol;
  - every sign and current direction;
  - every stated unit;
  - each "Differences from ngspice" item against `devices.md` §5 and the session's deviation list;
  - every claim in the prose against a test or the source.

  Findings come back as Critical, Important or Minor, with the entry, the line, and the reference that shows the problem.
- [ ] **Step 2: Fix** every Critical and Important finding (Sonnet builder, Sonnet re-review). Record Minors that aren't fixed in the "Equation review" section below.
- [ ] **Step 3: Fill in the "Equation review" section** below (date, reviewer model, counts, what was fixed, commit hashes). Run the humanizer.
- [ ] **Step 4: Commit** `docs(web): codex equation review fixes`, and `docs: record the M10 equation review` for the plan. Push.

### Task 12: Docs, version and close

**Files:**
- Modify:
  - `docs/user-guide.md`: a "Codex" section, and a dark screenshot added to `playwright.guide.config.ts`'s shots;
  - `docs/user-guide/*.png`, regenerated;
  - `README.md`: feature line, a codex screenshot in `docs/assets/`, and credits rows for KaTeX and marked;
  - `CHANGELOG.md` (`[1.2.0]`);
  - `docs/ROADMAP.md` (M10 status and evidence, at close);
  - `CITATION.cff`.
- Version `1.1.0` → `1.2.0` in every pinned place:
  - `Cargo.toml`, `crates/nodal-engine/src/lib.rs`, `crates/nodal-cli/tests/cli.rs`, `crates/nodal-wasm/tests/node.rs`;
  - `packages/schema/package.json`, `apps/web/package.json`;
  - `apps/web/src/App.test.tsx`, `apps/web/src/engine/client.test.ts`, `apps/web/e2e/shell.spec.ts`, `CITATION.cff`, plus `Cargo.lock`.

  Find them with `grep -rn "1\.1\.0"`, excluding lockfile noise.

- [ ] **Step 1: Docs and screenshots.** Run `pnpm --filter @nodal/web guide:screenshots`, take the README codex shot in dark mode, and run the humanizer on all prose.
- [ ] **Step 2: Bump the version** and run the full local check:
  - `cargo test --workspace`;
  - `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`;
  - the build, `check-base-path`, `check-first-load`;
  - `e2e`, and `e2e:perf` (local numbers are pessimistic; CI is the evidence).
- [ ] **Step 3: Commit** `docs: codex in the user guide and README` and `chore: version 1.2.0`. Push. Wait for CI: every job green, including `lighthouse` on the Pages URL and the perf table. Record the run URL, the Lighthouse numbers and the perf numbers.
- [ ] **Step 4: Opus final whole-milestone review** (Review Focus above). Fix what it finds, push, and wait for CI to go green again.
- [ ] **Step 5: Close** in a separate `docs: close M10` commit: ROADMAP status "done" with evidence, and this plan's boxes ticked.
- [ ] **Step 6 (manual, Tristan):** create the `v1.2.0` tag.

## Equation review

_To be filled in Task 11._
