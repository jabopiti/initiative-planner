---
slice_id: "057"
title: "Visual refresh: theme control, type scale, surfaces and status badges"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["055"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Theme and tokens' plus the review's visual-design lens (type, fewer boxes, shadcn components, motion, test both themes): F04, F12, F14, F19, F20. Look-and-feel decisions settled with the user from mockups: Geist typeface, soft layers, neutral dot status with outline track badge, theme icon button with a menu (§9.1 updated), brand-pack team swatches, subtle motion; then zinc greys with forest accent, graphite dark theme, top bar kept, no extra themes. Component decisions moved to slice 059."
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
   `localStorage`, chosen from an icon button with a menu, applied before
   first paint by the app's own module
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
   checked by the existing contrast check, shown as a small swatch.
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
      the contrast check in both themes, shown as a swatch beside the name.
- [ ] Given dates and compact amounts, then each appears in one format
      across all screens.
- [ ] Given `prefers-reduced-motion: reduce`, then no transition runs.
- [ ] Given the e2e axe scan, then every screen passes in light and dark.
- [ ] Given the production build, then no request leaves for any host but
      the GitHub API (fonts are bundled).

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

The page shell and two-column detail layout are slice 058, which builds on
these tokens. The mockups the user picked from are in the session that
created this slice (Geist; soft layers; dot + outline track; icon + menu;
small swatch).

## Decided in review (pre-implementation)

Settled with the user on 2 Oct 2026 from rendered mockups (typeface,
surfaces, badges, theme control, team colours).

- **Typeface:** Geist (variable), bundled from `@fontsource-variable/geist`
  and served with the build; set as the brand pack's typeface. Figures use
  `font-variant-numeric: tabular-nums` wherever amounts or percentages
  line up. Weights: regular and medium only (§9.8); the initiative name and
  page titles use the display size, not a heavier weight.
- **Surfaces: soft layers.** A slightly cooler page surface; white cards
  with a faint shadow and no border; strips (Needs attention, Getting
  started) are tinted bands; board columns and page sections have no box,
  only a heading and spacing. Popovers, menus, sheets and toasts keep a
  stronger shadow. Dark theme: cards are told apart by surface lightness,
  not shadow.
- **Status and approval track:** status is a dot plus plain text; the dot
  is **neutral** in every state (filled for Active, hollow for On hold,
  struck through for Cancelled, a check for Closed), so §9.8's colour roles
  are unchanged. Approval track is an outline badge with its letter and
  name ("E Elevated"). Sentence case.
- **Theme control:** an icon button at the right end of the top bar (after
  search and the sync indicator) opening a menu: System, Light, Dark, with
  a check on the current one; the button shows the current theme's icon
  (monitor, sun, moon) and has the accessible name "Theme: <current>".
  §9.1 updated from "cycled by" to "chosen from" one control.
- **Team colours:** six muted categorical tokens per theme in the brand
  pack (`team-1` … `team-6`), contrast-checked by the existing build check;
  shown only as a small square swatch beside the team name. Teams take
  tokens in creation order, wrapping after six.
- **Motion: subtle.** 120–180 ms on the phase accordion, toasts, the gate
  pass moment and a brief tint when a figure recalculates; none under
  `prefers-reduced-motion: reduce`.
- **Colour (round 2):** neutral zinc greys (no green tint) with the
  current forest-green accent, so the accent is the only colour that is not
  a state. Warning, Alarm and Met roles unchanged.
- **Dark theme:** neutral graphite (near-black greys) matching the zinc
  light theme; accent and roles keep today's dark values.
- **Navigation:** the top bar stays, restyled (no sidebar); built in 058.
- **Themes:** System, Light and Dark only; no high-contrast or density
  options for now.
- **Moved to 059:** the header key figures, the checklist control, the
  period range picker and the extra motion (hover lift, figure roll, page
  fade, gate pass celebration).
- **Assumptions (cheap to change, not asked):** radius stays 8 px (cards 10 px); compact amounts read
  "€395k" (no space); date fields display "1 Oct 2026"; the §9.10 icon
  vocabulary table from 055 is reused.
