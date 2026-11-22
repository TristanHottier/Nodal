# Impeccable audit of the M8 design

Date: 2026-11-22. Target: the production build of `apps/web` under `/Nodal/`, at 1440x900, 1280, 1100 and 1024 px, light and dark. Evidence: Playwright screenshots, DOM measurements (bounding boxes, computed styles), token contrast computed from the rendered colors, the existing `a11y.spec.ts` and `responsive.spec.ts` (run, 8 of 8 passing in Chromium), and `impeccable detect --json apps/web/src` (clean, exit 0). Lighthouse was not run here; the CI job covers it. Findings carry the labels must-fix, should-fix and nice-to-have; the matching P-level is in brackets.

## Audit health

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | No WCAG 2.2 AA violation found by axe in the editor, inspector, analysis editor, waveform and read-only views. Focus ring clipped on the Examples select; 13 px checkbox. |
| 2 | Performance | 3 | One 515 kB JS chunk (157 kB gzip) triggers the Vite size warning. Not measured further here. |
| 3 | Theming | 4 | All colors come from tokens in both themes; contrast verified. |
| 4 | Responsive | 2 | Content clipped inside the inspector at 1024 to 1100 px; Examples select clipped at every width. |
| 5 | Implementation integrity | 3 | Detector clean. Tests miss inner overflow. |
| **Total** | | **15/20** | Good: fix the two layout defects. |

## Implementation integrity verdict

Pass with two gaps. The token file is the single source of raw values, the detector reports nothing, and the two themes share one set of roles. The gaps are layout defects the tests do not see (A1, A2) and the 1024 px inspector.

## Summary

- Counts: 2 must-fix, 4 should-fix, 4 nice-to-have.
- Must-fix: A1 (Examples select overflow), A2 (inspector fieldset overflow). Both repeat C1 and C2 in `critique.md` with measurements.

## Findings

### Must-fix

**A1. The Examples select is wider than its column.** [P1] Responsive. View: editor, both themes, every width from 1024 to 1440 px. Measured: palette 0 to 180 (160 at 1024); `.nodal-projectbar-examples` 229 px wide; select x 30 to 234. At 1280 px the overflow is 54 px, at 1024 it is 74 px. The select's own `min-width: 0` does not help, because the flex container around it has `min-width: auto`. The focus ring is clipped as well. Standard: WCAG 2.2 SC 1.4.10 spirit and the constraint "usable from 1280 px to 1024 px". Fix: `min-width: 0` on `.nodal-projectbar-examples`; add an e2e check that no control in `.nodal-palette` extends past it. Files: `apps/web/src/editor/Editor.css`, `apps/web/e2e/responsive.spec.ts`.

**A2. Fieldsets in the inspector overflow the 220 px panel by 10 px at 1024 to 1100 px.** [P1] Responsive. View: nothing selected, light and dark. Measured at 1024 and 1100 px: 35 controls past the right edge of the inspector, among them Name, Type and IS in the model card (inputs are 228 px in a 200 px content box); at 1280 px none. Cause: `fieldset` keeps `min-inline-size: min-content`. Fix: `min-width: 0` on `.nodal-model` (and `min-inline-size: 0` if needed). Files: `apps/web/src/editor/inspector/Inspector.css`, `ModelEditor.tsx`, `apps/web/src/simulation/AnalysisEditor.tsx`, `OptionsFields.tsx`.

### Should-fix

**A3. The "uic" checkbox is 13x13 px.** [P2] Accessibility. View: analysis editor, transient card, all widths. It is below the 24x24 px minimum of WCAG 2.2 SC 2.5.8 unless the label counts as the target; the label ("uic") sits next to the Remove button with no spacing, so the exception for spacing may not hold. Files: `apps/web/src/simulation/AnalysisEditor.tsx`, `Inspector.css`.

**A4. Axe best-practice rules fail on the page.** [P2] Accessibility. With the full ruleset (not only the WCAG tags the spec uses): `landmark-one-main`, `page-has-heading-one` and `region` (3 nodes). The page has no `main` landmark and no `h1`. These are not WCAG A or AA failures, so the CI spec passes. Files: `apps/web/src/App.tsx`, `apps/web/src/editor/Editor.tsx`.

**A5. The page-wide overflow check misses inner overflow.** [P2] Implementation integrity. `responsive.spec.ts` checks `scrollWidth` of the document and the boxes of the panels, not the controls inside them, so A1 and A2 pass the suite. Add a check that every `button`, `select` and `input` inside `.nodal-palette`, `.nodal-inspector` and `.nodal-waveform-side` lies within its panel at 1024 and 1280 px. File: `apps/web/e2e/responsive.spec.ts`.

**A6. Warning text is under 4.5:1 on the light panel.** [P2] Accessibility. `--color-warning` (oklch 0.56 0.12 70) measures 4.18:1 on `--color-panel`; `Diagnostics.css` uses it for text. Success on panel is 4.53:1 (passes, narrowly). Fix: darken the light warning token and update `tokens.test.ts`. Files: `apps/web/src/theme/tokens.css`, `apps/web/src/editor/Diagnostics.css`.

### Nice-to-have

- **A7.** [P3] Theming. The disabled state in `base.css` uses `--color-text-muted` only. Muted text on the raised background is 6.6:1 or better, so it passes, but a disabled control and a muted label look the same. File: `base.css`.
- **A8.** [P3] Performance. One chunk of 515 kB (157 kB gzip). The M7 budget concerns runtime, and Lighthouse in CI covers load, so this is informational. File: `apps/web/vite.config.ts`.
- **A9.** [P3] Theming. A theme change runs a 120 ms background-color transition on buttons and selects, so a screenshot taken right after a theme switch shows mid-blend greys. The visual spec disables animations; a manual screenshot does not. Within the 150 ms limit and reduced to 0 ms under `prefers-reduced-motion`. File: `base.css`.
- **A10.** [P3] Responsive. Text hints are 11 px (`--text-xs`). The ADR sets the scale, so this is by design; check legibility on 1x displays. File: `tokens.css`.

## Systemic patterns

- Flex and fieldset items in the side panels lack `min-width: 0` (A1, A2). Fixing both at the CSS root, plus the test in A5, closes the class.
- Tests cover a11y and token contrast well but not content overflow inside panels.

## Positive findings

- Axe finds nothing under the WCAG 2.0, 2.1 and 2.2 A and AA tags in both themes for waveform, analysis editor, inspector and read-only views (a11y spec, 4 of 4 passing; keyboard tab test passing).
- Token contrast, measured from rendered colors: text on canvas and panel at least 14:1; muted text at least 5.9:1; accent and focus at least 5.4:1; control borders at least 3.4:1; traces at least 3.1:1 on the plot background.
- `prefers-reduced-motion` sets the one motion duration to 0 ms.
- Two type families, tabular numerals on readouts, panel widths in whole grid units.
- The detector finds nothing in `apps/web/src`.

## Recommended order

1. [P1] A1 and A2: `min-width: 0` fixes, plus A5 tests. Then run responsive, a11y and visual specs; update visual baselines only if the clipped regions change, and say so in the commit.
2. [P2] A3, A4, A6.
3. [P3] A7 to A10 if time allows.
4. Re-run the audit.

## Re-audit

Date: 2026-11-22, after the Task 10 fixes. Method: the same Playwright checks and DOM measurements as above, plus the new specs, axe with the WCAG tags and with the best-practice rules `landmark-one-main`, `page-has-heading-one`, `region` and `heading-order`, and `impeccable detect --json apps/web/src` (`[]`, exit 0).

**Must-fix: 0.** The audit health score is 18 of 20 (responsive 2 to 4, accessibility 3 to 4, performance still 3 for the single chunk).

| Finding | Result |
|---------|--------|
| A1 Examples select overflow | Fixed. The select now ends inside the palette at 1024 and 1280 px, and its focus ring shows in full. |
| A2 Inspector fieldset overflow | Fixed. `min-width: 0` on `.nodal-model`; no control passes the panel edge with a part selected or with the analysis editor open. |
| A3 13 px checkbox | Fixed. The label row is at least 25x25 px, with a gap before Remove. A new spec measures it. |
| A4 Landmarks and h1 | Fixed. One `main`, one hidden `h1`, a hidden `h2` for the empty inspector, a footer and a labelled Results section. All four axe rules pass at 1280 and 800 px. |
| A5 Test gap | Fixed. `responsive.spec.ts` now checks every button, select, input and textarea against its panel at 1024 and 1280 px. Before the fixes it failed in Chromium and Firefox. |
| A6 Warning contrast | Fixed. Light warning is oklch 0.52 0.1 70 and sits in the 4.5:1 group of `tokens.test.ts`. |
| A7 to A10 | Not fixed; reasons in the plan's "Findings not fixed" list. |

Tests after the fixes: 615 unit tests, 58 of 58 e2e (Chromium and Firefox), lint and typecheck clean. The locally rendered visual baselines differ from the CI renders and were already failing before these changes; the editor and analysis baselines were re-rendered locally for the intended changes and the CI renders will replace them.
