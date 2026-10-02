---
slice_id: "054"
title: "Small fixes from the review"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: []
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Low-severity review findings."
recommended_model: "Claude Haiku 4.5"
model_rationale: "Independent one-line fixes with obvious tests."
spec_sections: ["§5.5 People overview", "§5.8 Team detail view", "§9.9 Interface states", "§9.5 Accessibility", "§9.8 Visual design"]
---

# Small fixes from the review

## Intent

**Problem statement:** A set of small, independent defects from the review.

**Outcome statement:** Each is fixed with a test, in separate commits.

## Scope

- Teams overview: the team-name input gets `aria-label="Team name"`.
- People quick-add and `TeamDetail.createInline`: when no country or role is
  active, the button is disabled with a message naming Settings (§9.4).
- `CustomRoleFields`: reject a cost factor of 0 ("Enter a cost factor above
  0.", as the Roles section) and show an inline message for a rejected cost
  factor or day rate instead of reverting silently (§9.9).
- `PersonPanel`: the Capacity label's `htmlFor` matches an id on the field.
- `teamHasCapacityWarning`: an inactive team shows no overview warning (§7.2).
- Portfolio: a stale Year pick is validated against the available years as
  the other filters are.
- Global search: `/` ignores an open menu or listbox, not only dialogs.
- Initiative not found: the page offers one action back (§9.4).
- Draft page: Esc works when focus is on the body.
- Replace raw pixel values (`text-[15px]`, `text-[11px]`, `text-[22px]`,
  `max-w-[720px]`, `max-w-[560px]`, `rounded-[10px]`, `size-[18px]`) with
  `@theme` tokens (AGENTS.md).
- Backlog hygiene: tick the satisfied criteria of 002, 038, 039, 040; remove
  the stale `DebouncedFileWriter.test.ts` reference in 003; correct 005j's
  Retry text (hidden for a rejected token, per §3); add the missing test for
  the PATCH on a slashed ref (040).

## Acceptance criteria

- [ ] Given each item, then a test or an axe check demonstrates the fix.
- [ ] Given `grep` for the pixel utilities above in `src/ui`, then none
      remain.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Open decisions

- Copy for the disabled-add message and the custom-role refusals, drafted in
  place against §9.2.
