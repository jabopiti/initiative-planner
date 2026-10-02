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
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review finding: nothing sets the .dark class, there is no control, and nothing honours prefers-reduced-motion."
recommended_model: "Claude Sonnet 5"
model_rationale: "A top-bar control, a persisted class on the document root, and a media-query rule; verification is mostly visual and via axe in both themes."
spec_sections: ["§9.1 Theming", "§5.1 Navigation", "§9.5 Accessibility", "§9.10 Icons", "§10.4 Browser storage"]
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

- One top-bar button cycles System → Light → Dark; Lucide Monitor/Sun/Moon;
  accessible name states the current mode and the next; tooltip.
- Stored in `localStorage` (never synced, §9.1), read before first paint to
  avoid a flash; storage errors fall back to System.
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
- [ ] Given the control, then its name reads e.g. "Theme: System. Switch to
      Light." and it works by keyboard.
- [ ] Given reduced motion, then the tint changes instantly.
- [ ] Given axe in dark mode on Portfolio, Initiatives, an initiative page
      and Settings, then there are no violations.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Open decisions

- Placement and look of the control in the top bar (shown as mockups, with
  the search and sync buttons).
- Accessible-name wording against §9.2.
