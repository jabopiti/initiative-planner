---
slice_id: "039"
title: "Commit messages describe the net effect of grouped edits"
type: "bugfix"
status: "valid"
criteria_failures: []
depends_on: ["005g"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Commit-message notes). Notes are keyed so a later edit replaces an earlier note: several edits to one allocation inside the 1-second window keep only the last ('added' is lost), and a double rename reads as a single one."
recommended_model: "Claude Sonnet 5"
model_rationale: "A small change to how the file writer combines notes, needing a note shape that carries before/after values; each combination is a direct unit test."
spec_sections: ["§10.3 Writing"]
---

# Commit messages describe the net effect of grouped edits

## Intent

**Problem statement:** Adding Mara Voss to Development and then setting the
percentage within a second commits as "Mara Voss set to 60% in Development" —
the history never says Mara Voss was added. Renaming A → B → C in one window reads
"renamed from B to C", naming a name that was never saved.

**Outcome statement:** A grouped commit's message describes what actually
changed between the saved state before and after it — the net effect.

## Scope

- **Net-effect rules**, per entity and field within one commit:
  - added, then changed → "Mara Voss added to Development at 60%";
  - added, then removed → no note (nothing changed); if no note remains, no
    commit;
  - changed, then changed → one note from the saved value to the last one
    ("renamed from A to C");
  - changed back to the saved value → no note;
  - removed → "Mara Voss removed from Development".
- **Mechanics.** Every repository write passes a structured note: the
  entity as `{ kind, id }` (initiative, person, team, membership, role,
  country — slice 038 renders it as a trailer), the field, and the saved
  value it started from and the new value. The writer combines notes per
  entity and field on flush from the first "from" and the last "to", then
  words them. This replaces today's keyed notes in every repository method,
  so build it when few other slices are editing `Repository.ts` (see the
  build plan in `slices-overview.md`).

## Execution path

1. Within 1 s: add Mara Voss to Development, set 60%.
2. Commit: "Checkout Redesign: Mara Voss added to Development at 60%".

## Value

- **Desirable:** A readable, true change log.
- **Usable:** Invisible in the app.
- **Valuable:** The history never names states that were never saved.

## Acceptance criteria

- [ ] Given add then change in one window, then the message reads "<person>
      added to <phase> at <final %>".
- [ ] Given add then remove in one window, then no commit is made.
- [ ] Given rename A → B → C in one window, then the message reads "renamed
      from A to C".
- [ ] Given a change and a change back to the saved value, then no note for it
      remains (and no commit if nothing else changed).
- [ ] Given edits to two different entities, then both notes appear, joined as
      today.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

Touches every repository write method. Run it after the feature slices that
add repository methods, or rebase them onto it; it is the first of two
back-to-back slices (039, then 038) on the same note shape.

## Decided in review (pre-implementation)

- **Combination:** net effect, not every step.
