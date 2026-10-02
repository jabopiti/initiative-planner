---
slice_id: "044"
title: "Visual refresh: theme control, type scale, surfaces and status badges"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["042"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Theme and tokens' plus the review's visual-design lens (type, fewer boxes, shadcn components, motion, test both themes): F04, F12, F14, F19, F20. Key look-and-feel decisions are settled with the user before implementation (see Decided in review)."
recommended_model: "Claude Opus 5.5"
model_rationale: "Changes tokens every screen reads and adds a brand-pack field (typeface, team palette); hard to reverse once screens are built on it."
spec_sections: ["§2 What the build fixes (brand pack)", "§9.1 Theming", "§9.5 Accessibility", "§9.8 Visual design", "§9.10 Icons", "§10.1 Framework and UI foundations", "§10.7 Distribution, build and deploy", "§10.9 Security"]
---

# Visual refresh: theme control, type scale, surfaces and status badges

## Intent

**Problem statement:** The dark theme exists but can't be reached (§9.1
names a System / Light / Dark control that was never built). The app uses
a 14 px system font with no type scale, every block is a bordered box,
numbers and dates are written several ways, status and approval track look
the same, and team colours sit outside the brand palette.

**Outcome statement:** A modern, calm, consistent look built on tokens:
one control switches the theme, one type scale and one surface system are
used everywhere, and colour still only carries meaning (§9.8).

## Scope

1. **F04 Theme control (§9.1).** System / Light / Dark, remembered in
   `localStorage`, applied before first paint by the app's own module
   script (no inline script, §10.9).
2. **F12 Type.** A brand-pack typeface (bundled, never fetched from a
   third party: outbound requests go only to GitHub) with tabular figures;
   15 px body; six type tokens in `@theme`; a shared `PageHeader` and
   `SectionHeader`; table rows `h-10` (§9.8).
3. **Surfaces.** Cards only for objects; sections separated by spacing and
   a heading; shadows only on floating layers; page and card surfaces
   tuned so cards stand apart without borders.
4. **F19 Badges.** Status and approval track use distinct shadcn Badge
   variants, sentence case.
5. **F20 Team colours.** Brand-pack categorical tokens for light and dark,
   checked by the existing contrast check — or team name only (decision).
6. **F14 Formats.** Compact amounts written one way; date fields displayed
   "1 Oct 2026".
7. **Motion.** 120–180 ms transitions on accordion, toast and the gate pass
   moment; all off under `prefers-reduced-motion` (§9.5).
8. **Both themes tested.** The e2e axe pass runs in light and dark.

## Execution path

1. Top bar → theme control → Dark → every screen repaints without reload.
2. Reload → still Dark. Choose System → follows the OS.
3. Portfolio, detail, People, Teams and Settings use the new type scale and
   surfaces in both themes.

## Value

- **Desirable:** Answers the user's ask for a more modern, higher-quality,
  more appealing look (review lens D).
- **Usable:** Consistent type, formats and badges make screens faster to read.
- **Valuable:** Ships a specified feature (§9.1) and makes later screens
  cheaper to build on shared tokens.

## Acceptance criteria

- [ ] Given the theme control, then it offers System, Light and Dark, the
      choice survives a reload, and no flash of the other theme shows on
      load under the production CSP.
- [ ] Given body text, then it is 15 px in the brand-pack typeface, and
      every heading uses one of the type tokens.
- [ ] Given figures in tables and the cost summary, then they use tabular
      figures.
- [ ] Given status and approval track side by side, then they use
      different badge variants.
- [ ] Given team colours, then they come from brand-pack tokens that pass
      the contrast check in both themes (or are removed, per decision).
- [ ] Given dates and compact amounts, then each appears in one format
      across all screens.
- [ ] Given `prefers-reduced-motion: reduce`, then no transition runs.
- [ ] Given the e2e axe scan, then every screen passes in light and dark.
- [ ] Given the production build, then no request leaves for any host but
      the GitHub API (fonts are bundled).

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

The page shell and two-column detail layout are slice 045, which builds on
these tokens. The look decisions below are settled with rendered mockups
before implementation.

## Decided in review (pre-implementation)

(open — settled with the user before implementation)
