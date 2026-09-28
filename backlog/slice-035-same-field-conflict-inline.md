---
slice_id: "035"
title: "Same-field conflict shown inline under the field"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005h", "005j"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Same-field conflict shown inline under the field, §9.9). 005h shows every conflict in a top banner as a first step; §9.9 puts it under the field."
recommended_model: "Claude Opus 5.5"
model_rationale: "Moves conflict display into the two shared field primitives (as 005j did for failed edits) while keeping the banner for conflicts whose field isn't rendered; must interleave correctly with a failed edit on the same path, a field being edited, and a pull that resolves the conflict remotely."
spec_sections: ["§9.9 Interface states (Same-field conflict)", "§3 Storage & sync (Conflict edge cases)", "§10.5 Merging", "§9.5 Accessibility"]
---

# Same-field conflict shown inline under the field

## Intent

**Problem statement:** When Mara and Jonas both change Felix Brandt's
Allocation % in Development, the conflict appears in a banner at the top of
the page, away from the field. On a page with many allocations, the user has
to work out which field the banner means before they can decide.

**Outcome statement:** A same-field conflict shows directly under the field
it concerns, with both values and Keep theirs / Use mine (§9.9); the top
banner only points to conflicts whose field isn't on screen.

## Scope

- **Inline (§9.9).** Wired once into `CommitInput` and `PopoverTextField`
  (like 005j's failed state): a field whose path has an open conflict shows
  under it "Changed by someone else while you edited", "Theirs: 60% · Yours:
  80%" (formatted as the field formats values, 005h's `describeConflict`),
  **Keep theirs** and **Use mine**. Accessible names name the field ("Keep
  theirs for Felix Brandt's Allocation %").
- **Banner for off-screen conflicts.** ConflictBanner shows only conflicts
  whose field isn't rendered (collapsed phase, another page, closed panel), as
  one line per initiative/person: "1 unresolved change on Checkout Redesign —
  Show", where Show navigates and expands to the field (the Needs attention
  jump mechanism). With none off-screen, no banner.
- **Precedence.** A path under a conflict never shows 005j's failed-edit
  state too (005j's rule, now inline). Read-only banner stays above.
- **Resolution** unchanged (005h): choosing saves; a failed save keeps the
  conflict open with its message.

**Explicitly excluded:** conflicts on list items as a whole (merged by id,
§3) — only same-field conflicts.

## Execution path

1. Jonas saves Felix Brandt at 60%; Mara, editing, commits 80%.
2. Mara's field shows "Theirs: 60% · Yours: 80%" with Keep theirs / Use mine
   under it; no top banner.
3. Mara collapses Development: the banner shows "1 unresolved change on
   Checkout Redesign — Show".

## Value

- **Desirable:** Decide where the value is, not in a banner.
- **Usable:** Both values and both choices beside the field.
- **Valuable:** Fewer wrong choices in conflict resolution.

## Acceptance criteria

- [ ] Given a same-field conflict on a rendered field, then under it show
      "Changed by someone else while you edited", both values formatted as the
      field does, Keep theirs and Use mine; no top banner for it.
- [ ] Given Keep theirs or Use mine, then 005h's resolution runs and the inline
      block disappears once saved.
- [ ] Given the save fails, then the block stays with the failure message.
- [ ] Given the conflicted field isn't rendered, then the top banner reads
      "<n> unresolved change(s) on <entity> — Show", and Show brings the
      field into view with its inline block.
- [ ] Given a conflicted path that also failed to save, then only the conflict
      block shows.
- [ ] Given two conflicts on one screen, then each inline block's buttons have
      distinct accessible names naming their field, and each block is
      announced (`role="alert"`).
- [ ] Given another user's pull settles the conflict remotely (theirs equals
      mine), then the block disappears.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Banner:** kept only as a pointer to conflicts whose field isn't on screen,
  with Show; inline everywhere else.
