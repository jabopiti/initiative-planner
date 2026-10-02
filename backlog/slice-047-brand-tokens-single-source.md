---
slice_id: "047"
title: "Brand pack colours are the single source; contrast enforced in the build"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["046"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings: src/index.css is hand-copied and differs from defaultBrand.ts (text-muted, warning, alarm, met); nothing checks contrast."
recommended_model: "Claude Opus 5.5"
model_rationale: "Cross-cutting: runtime or build-time token injection, a contrast algorithm, and a decision on which values are authoritative; hard to verify by tests alone."
spec_sections: ["§2 Hosting & technology, Brand pack", "§9.1 Theming", "§9.5 Accessibility", "§9.8 Visual design", "§10.1 Framework and UI foundations", "§10.8 Testing"]
---

# Brand pack colours are the single source; contrast enforced in the build

## Intent

**Problem statement:** §2 says a fork changes only its brand pack, and §9.5
requires AA contrast with the build failing on a violation. `src/index.css`
carries a hand-kept copy of the colours that has drifted from
`src/brand/defaultBrand.ts` (e.g. `--text-muted` 0.534 vs 0.622 light, 0.635
vs 0.583 dark; `--warning-text`, `--alarm-text`, `--met-text`). A fork's
palette would not apply, and no check ensures any pair is readable.

**Outcome statement:** The brand pack alone defines the colours in both
themes, the CSS is derived from it, and the build refuses a pack with an
unreadable text/background pair, naming the token.

## Scope

- One mechanism turns the pack's tokens into the CSS custom properties
  (build-time generation or runtime injection in `BrandContext`; CSP forbids
  inline styles, so a generated stylesheet or `adoptedStyleSheets`).
- Correct the pack's values to the passing ones now in `index.css`.
- A contrast check over the pack's text-on-surface pairs in both themes, run
  in Vitest and in `build`, failing with the token name.
- Remove the hand-copied block and its "deferred" comment.

## Acceptance criteria

- [ ] Given a changed colour in the brand pack only, then the running app
      shows it in light and dark.
- [ ] Given a text token below 4.5:1 on its surface (3:1 for large text and
      UI), then `npm run build` and the unit test fail naming the token.
- [ ] Given the default pack, then it passes in both themes.
- [ ] Given `src/index.css`, then it holds no colour literals.
- [ ] Given the strict CSP in the production build, then the e2e CSP test
      still passes.

## Flags and compromises

None.

## Open decisions

- Build-time generation (simple, CSP-safe) versus runtime injection (fork
  needs no build step for colours). Recommended: build-time, since a fork
  already builds (§10.7).
- Which pairs the contrast check covers (recommended: every `--*-text` on
  every surface it is used on, plus focus ring and borders for UI contrast).
