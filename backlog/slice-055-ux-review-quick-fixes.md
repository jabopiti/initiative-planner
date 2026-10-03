---
slice_id: "055"
title: "UX review quick fixes: fields, focus, row actions and small copy"
type: "bugfix"
status: "valid"
criteria_failures: []
depends_on: ["036"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "From the October 2026 UX review (docs/ux-review-2026-10.md), roadmap group 'Quick fixes'. Small, independent findings: F01, F03, F10, F18, F21, F22, F23, F24, F28, F29, F31. F18 was missing from the review's roadmap and is added here. F02 (allocation table errors) moved to 061, which rebuilds that table. Backlog reshuffle (3 Oct 2026): F09 (long names) moved to 056 with the other header fields, F13 (Copy button) to 058's shared toolbar row; eleven findings remain."
recommended_model: "Claude Sonnet 5"
model_rationale: "Many small, local fixes, each with a cheap test to write first; no new shared pattern beyond one focus token and one row-actions menu."
spec_sections: ["§9.5 Accessibility", "§9.8 Visual design", "§9.10 Icons", "§9.2 Copy", "§5.1 Navigation (sync indicator)", "§5.4 Initiative detail view", "§5.6 Person detail view", "§5.8 Team detail view"]
---

# UX review quick fixes: fields, focus, row actions and small copy

## Intent

**Problem statement:** The October 2026 UX review found small defects that
people hit every day: percent fields cut off "100", focus on buttons is
hard to see, and row actions are unlabelled icons whose meaning changes
from screen to screen.

**Outcome statement:** Every field shows its whole value, one clearly
visible focus ring is used everywhere, and every row action says what it
does.

## Scope

Each item names its finding in `docs/ux-review-2026-10.md`, which has the
screenshots.

1. **F01 Percent fields.** `PercentInput` fits "100" plus the % suffix in
   every place it is used (allocation table, Team detail, person panel);
   the % sits inside the field.
2. **F03 One focus ring.** Button, input, select, checkbox and toggle
   variants use the same `--focus-ring` outline (2 px, 2 px offset) as the
   base `:focus-visible` rule; `ring/50` is removed.
3. **F10 Row actions.** Row actions on People, Team detail and Settings
   lists move into a "⋯" DropdownMenu with text labels ("Remove from team",
   "Deactivate person", "Delete"). §9.10 gains an icon vocabulary table:
   one meaning per Lucide icon.
4. **F18 Sync status and nav badge.** The synced check shows "Saved" on
   hover and focus; while writes are pending it reads "Saving…". The nav
   badge gets a tooltip ("1 needs attention").
5. **F21 Person panel focus.** Opening the panel moves focus to its heading
   without selecting text.
6. **F22 Tentative note.** The field is labelled "Why tentative?". (The
   checklist toggles' tooltips are left alone: 059 replaces the toggles
   with a labelled control.)
7. **F23 Landmarks.** Routed content sits in `<main>`; the magic bar is a
   labelled region; each screen has one h1 (visually hidden where the
   design has none). The e2e axe scan turns on `region` and
   `landmark-one-main`.
8. **F24 Table alignment.** Cells are vertically centred; numeric headers
   are right-aligned with their columns. The allocation table and the
   capacity grid are rebuilt in 061 and 062, so they are left out here.
9. **F28 Filter options** sorted alphabetically, selected ones first.
10. **F29 Actions menu.** "Cancel" reads "Cancel initiative…"; a separator
    sits before the destructive items.
11. **F31 Actions tooltip** doesn't reopen when the menu returns focus to
    its button.

## Execution path

1. Onboarding Flow v2 → set an allocation to 100 → "100 %" fully visible.
2. Tab through the page → every focused control has the same visible ring.
3. People → a row's ⋯ → "Deactivate person".

## Value

- **Desirable:** Removes the friction found on every screen.
- **Usable:** Labels instead of guessed icons; stable layout while typing.
- **Valuable:** Closes the review's P1 field and focus findings cheaply.

## Acceptance criteria

- [ ] Given an allocation of 100 % at 1280 px, then the whole value and the
      % are visible in every percent field.
- [ ] Given keyboard focus on a primary button, an input and a select, then
      each shows the same 2 px `--focus-ring` outline.
- [ ] Given People, Team detail and Settings rows, then every row action has
      a text label in a ⋯ menu; no icon-only row action remains.
- [ ] Given synced, hovering or focusing the indicator shows "Saved"; given
      a pending write, it reads "Saving…".
- [ ] Given the person panel opens, then no text is selected and focus is on
      its heading.
- [ ] Given a Tentative item, then its note field has the label "Why
      tentative?".
- [ ] Given the e2e axe scan with `region` and `landmark-one-main` on, then
      every screen passes.
- [ ] Given filters, then options are sorted A–Z with selected ones first.
- [ ] Given the Actions menu, then it reads "Cancel initiative…" after a
      separator.
- [ ] Given the Actions menu closes, then its tooltip stays closed.

## Flags and compromises

Copy strings above are drafts from the review; the next-slice session
confirms them with the user in place (§9.2). The ⋯ row menu is a new
shared pattern: 057 and 058 reuse it.

## Decided in review (pre-implementation)

(none yet)
