---
slice_id: "057"
title: "Visual refresh: type scale, surfaces, status badges and team colours"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["046", "047", "055"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Theme and tokens' plus the review's visual-design lens (type, fewer boxes, shadcn components, motion, test both themes): F04, F12, F14, F19, F20. Look-and-feel decisions settled with the user from mockups: Geist typeface, soft layers, neutral dot status with outline track badge, theme icon button with a menu (§9.1 updated), brand-pack team swatches, subtle motion; then zinc greys with forest accent, graphite dark theme, top bar kept, no extra themes. Component decisions moved to slice 059. Backlog reshuffle (3 Oct 2026): F14 moved to 052 with the locale formats decision; the motion item moved into 059's motion list; now after 047, so the palette and team colours land in the brand pack once it is the single colour source. On 3 Oct 2026 the user moved F04 (the theme control, as decided here) to 046, which builds it once. Pre-implementation review (3 Oct 2026): six-step type scale with Tailwind's default sizes removed, typeface files kept in the brand folder, status glyphs (dot, CirclePause, Ban, CircleCheck) used everywhere, full track badge on cards, team swatch only where a team is the subject; spec §2, §9.5, §9.8, §9.10 and §10.7 updated."
recommended_model: "Claude Opus 5.5"
model_rationale: "Changes tokens every screen reads and adds a brand-pack field (typeface, team palette); hard to reverse once screens are built on it."
spec_sections: ["§2 What the build fixes (brand pack)", "§9.1 Theming", "§9.5 Accessibility", "§9.8 Visual design", "§9.10 Icons", "§10.1 Framework and UI foundations", "§10.7 Distribution, build and deploy", "§10.9 Security"]
---

# Visual refresh: type scale, surfaces, status badges and team colours

## Intent

**Problem statement:** The app uses a 14 px system font with no type
scale, every block is a bordered box, status and approval track look the
same, and team colours sit outside the brand palette.

**Outcome statement:** A modern, calm, consistent look built on tokens:
one type scale and one surface system are used everywhere in both themes
(switched by 046's control), and colour still only carries meaning (§9.8).

## Scope

1. **F12 Type.** A brand-pack typeface (bundled, never fetched from a
   third party: outbound requests go only to GitHub) with tabular figures;
   15 px body; six type tokens in `@theme`; a shared `PageHeader` and
   `SectionHeader`; table rows `h-10` (§9.8).
2. **Surfaces.** Cards only for objects; sections separated by spacing and
   a heading; shadows only on floating layers; page and card surfaces
   tuned so cards stand apart without borders.
3. **F19 Badges.** Status and approval track use distinct shadcn Badge
   variants, sentence case.
4. **F20 Team colours.** Brand-pack categorical tokens for light and dark,
   checked by the existing contrast check, shown as a small swatch.
5. **Both themes tested.** The e2e axe pass runs in light and dark.

## Execution path

1. Portfolio, detail, People, Teams and Settings use the new type scale and
   surfaces in both themes.

## Value

- **Desirable:** Answers the user's ask for a more modern, higher-quality,
  more appealing look (review lens D).
- **Usable:** Consistent type, surfaces and badges make screens faster to read.
- **Valuable:** Makes later screens cheaper to build on shared tokens.

## Acceptance criteria

- [ ] Given body text, then it is 15 px in the brand-pack typeface, and
      every font size in `src/` is one of the six type tokens (a unit test
      fails on any Tailwind default size such as `text-sm`).
- [ ] Given the brand pack, then its typeface's font files live in the
      brand folder and the build fails when one is missing.
- [ ] Given figures in tables and the cost summary, then they use tabular
      figures.
- [ ] Given status and approval track side by side, then status is a
      neutral glyph plus sentence-case text ("On hold") and the track an
      outline badge ("E Elevated"; "No approval track" dashed, no letter),
      on board cards too.
- [ ] Given team colours, then they come from brand-pack tokens that pass
      the contrast check (3:1 on page and card) in both themes, shown as a
      square swatch on the Teams overview, the team page title and the
      person panel (memberships and split bar) only.
- [ ] Given the e2e axe scan, then every screen passes in light and dark.
- [ ] Given the production build, then no request leaves for any host but
      the GitHub API (fonts are bundled).

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
  `prefers-reduced-motion: reduce`. Built in 059 since the 3 Oct 2026
  reshuffle.
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
  "€395k" (no space); date fields display "1 Oct 2026" (both now carried
  by 052's formats decision); the §9.10 icon vocabulary table from 055 is
  reused.

Settled with the user on 3 Oct 2026 in the pre-implementation review, from
rendered mockups:

- **Type scale (D1):** six `@theme` tokens: label 12, caption 13, body 15,
  heading 16, title 18, display 24 (px); tables at body 15 with 40 px rows.
  Tailwind's default font-size scale is reset so only these exist, and a
  unit test fails on any leftover `text-xs`/`text-sm`/… class. Semibold
  and bold become medium.
- **Typeface (D2):** the brand pack gets `typeface: { family, files,
  fallback }`; the Geist variable woff2 files (latin, latin-ext; taken once
  from `@fontsource-variable/geist`) and the OFL licence live in
  `src/brand/fonts/`; the brand plugin emits `@font-face` and `--font-sans`.
  No npm font dependency, so a fork changes fonts in its brand folder only.
- **Status glyphs (D3):** one set everywhere, neutral grey: filled dot
  (Active), `CirclePause` (On hold), `Ban` (Cancelled, the Cancel action's
  glyph), `CircleCheck` (Closed). Board cards stay icon-only and show
  nothing for Active (§5.2); header, tables and search show glyph plus
  sentence-case text. The stored value stays `On Hold`.
- **Track badge (D4):** shadcn Badge, outline, "E Elevated" everywhere
  including board cards; "No approval track" dashed outline with no letter;
  tooltip stays the requirement text.
- **Team swatch (D5):** only where a team is the subject: Teams overview
  rows, team page title, person panel memberships and split bar. Not in the
  Initiatives or People tables, board cards or the detail header. Six
  muted colours that avoid the Alarm, Warning and Met hues: violet, blue,
  teal, magenta, sand, slate.
- **Assumptions (not asked):** neutral roles move to zinc (light) and
  graphite (dark) in `defaultBrand.ts`, accent and state roles unchanged;
  two core shadow tokens (card, floating), none on dark cards; strips on
  the neutral subtle band; team colour = position in the teams file,
  inactive teams included, so it never shifts; `PageHeader` (title,
  optional description, actions) and `SectionHeader` (h2, actions);
  both themes' axe scans cover the same full screen list; an e2e test
  checks the production build requests nothing beyond its origin and the
  GitHub API.
