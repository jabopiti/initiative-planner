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
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings: src/index.css is hand-copied and differs from defaultBrand.ts (text-muted, warning, alarm, met); nothing checks contrast. Pre-implementation review (2026-10-03): build-time Vite plugin chosen; form-control borders checked at 3:1 on a new border-input role (border-strong unchanged); destructive button moved onto brand tokens."
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

### Decided in review (pre-implementation)

- **Mechanism: build-time.** A Vite plugin generates the colour stylesheet
  (`:root` and `.dark` custom properties) from the brand pack and serves it
  as a virtual CSS module imported by `main.tsx`; nothing generated is
  committed. The same plugin runs the contrast check at build start and
  fails the build; the dev server shows the same error in its overlay.
  Runtime injection and a committed generated file were rejected.
- **Contrast maths:** in-repo, no new dependency — OKLCH → sRGB (channels
  clipped to the sRGB gamut) → WCAG 2 relative luminance and ratio. Every
  colour role must be a well-formed `oklch(L C H)` in both themes, or the
  build fails naming the role.
- **Pairs checked** (core-owned list, from how the app uses each token):
  - 4.5:1 — text primary, secondary and muted on surface page, card, subtle,
    accent tint and met tint; accent, warning, alarm and met text on page,
    card, subtle and their own tint; text on accent on accent and on alarm;
    surface page on text primary (tooltips).
  - 3:1 — focus ring, accent, met, warning and alarm fills, and border
    input, each on surface page and card. No large-text exemption is used.
  - Border default and border strong are decorative (dividers, card
    outlines, grouping panels, dashed boxes, stepper dots) and not checked.
- **Form-control borders on a new border-input role:** inputs, selects,
  checkboxes and the other controls reading shadcn's `input` colour use
  border-input, oklch(0.60 0.018 164.5) light and oklch(0.54 0.027 159.1)
  dark (3.33:1 and 3.32:1 on a card) — WCAG 1.4.11. Mockup option B.
  Border-strong keeps its values, so grouping panels, chips, dashed boxes
  and stepper dots look as before (post-implementation review, border
  option B). shadcn's own `dark:bg-input/30` fills are kept, so dark
  fields are a little lighter than before.
- **Destructive button:** `bg-destructive text-primary-foreground`
  (text on accent on alarm), no dark-mode opacity — light unchanged, dark a
  solid lighter red with dark text (6.70:1). Mockup option B.
- **Failure message** lists every failing pair at once, e.g.
  `Brand pack contrast: textMuted (light) on surfaceSubtle is 3.21:1, needs 4.5:1`.
- Out of scope: the typeface and radius stay in `index.css` (not colours;
  057 adds the typeface); dialog scrim, magic-bar shadow and
  `teamColors.ts` (057 F20) keep their literals — none is text on a surface.

## Acceptance criteria

- [x] Given a changed colour in the brand pack only, then the running app
      shows it in light and dark.
- [x] Given a text token below 4.5:1 on its surface (3:1 for large text and
      UI), then `npm run build` and the unit test fail naming the token.
- [x] Given the default pack, then it passes in both themes.
- [x] Given `src/index.css`, then it holds no colour literals.
- [x] Given the strict CSP in the production build, then the e2e CSP test
      still passes.
- [x] Given a text field, select or checkbox on a card, then its border is
      border-input at 3:1 or more in both themes.
- [x] Given the destructive button, then its colours are brand tokens
      (alarm and text on accent) with no opacity in dark.

## Flags and compromises

None.

## Open decisions

None — settled in review (see Scope).
