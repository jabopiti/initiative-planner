---
slice_id: "046"
title: "Theme control (System, Light, Dark) and reduced motion"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: []
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review finding: nothing sets the .dark class, there is no control, and nothing honours prefers-reduced-motion. 3 Oct 2026: the user chose that this slice builds the theme control as decided for 057 on 2 Oct 2026 (an icon button with a menu, not a cycle button), with the dark-theme axe pass; 057 dropped F04 and builds on it."
recommended_model: "Claude Sonnet 5"
model_rationale: "A top-bar control, a persisted class on the document root, and a media-query rule; verification is mostly visual and via axe in both themes."
spec_sections: ["§9.1 Theming", "§5.1 Navigation", "§9.5 Accessibility", "§9.10 Icons", "§10.4 Browser storage", "§10.9 Security"]
---

# Theme control (System, Light, Dark) and reduced motion

## Intent

**Problem statement:** §9.1 and §5.1 specify a System / Light / Dark control at
the right of the top bar, remembered in the browser. The dark tokens exist in
`src/index.css` under `.dark`, but nothing sets that class and there is no
`prefers-color-scheme` fallback, so the app is light-only, whatever the OS
says. §9.5 says animations are skipped under reduced motion; the tint fades
(`duration-500` in seven components) ignore it.

**Outcome statement:** A user can choose how the app looks, the choice
survives a reload, and users who ask for less motion get none.

## Scope

- One icon button at the right end of the top bar (after search and the
  sync indicator) opens a menu: System, Light, Dark, with a check on the
  current one. The button shows the current theme's icon (Lucide Monitor,
  Sun, Moon), has the accessible name "Theme: <current>" and a tooltip.
- Stored in `localStorage` (never synced, §9.1), applied before first paint
  by the app's own module script (no inline script, §10.9) to avoid a
  flash; storage errors fall back to System.
- System resolves via `matchMedia('(prefers-color-scheme: dark)')` and follows
  OS changes live.
- The resolved theme toggles `.dark` on the document root.
- Tint fades use `motion-reduce:transition-none`.
- `e2e/a11y.spec.ts` scans the main screens in dark too.

## Acceptance criteria

- [ ] Given System with OS dark, then `.dark` is on the root; Light and Dark
      force it off and on.
- [ ] Given a chosen mode and a reload, then it is restored; with storage
      blocked, System is used.
- [ ] Given the control, then its name reads "Theme: System", its menu
      offers System, Light and Dark with a check on the current one, and it
      works by keyboard.
- [ ] Given the production build under the strict CSP, then a reload in
      Dark shows no flash of Light.
- [ ] Given reduced motion, then the tint changes instantly.
- [ ] Given axe in dark mode on Portfolio, Initiatives, an initiative page
      and Settings, then there are no violations.

## Flags and compromises

None.

## Open decisions

- Placement and look: decided for 057 from mockups on 2 Oct 2026 (icon
  button with a menu at the right end of the top bar; §9.1 reads "chosen
  from" one control). Accessible-name wording against §9.2 is still
  confirmed in place.
