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
change_summary: "Decided in review: one wording pattern, saved name as rename subject, commas within an entity. Promoted from the backlog tail (Commit-message notes). Notes are keyed so a later edit replaces an earlier note: several edits to one allocation inside the 1-second window keep only the last ('added' is lost), and a double rename reads as a single one."
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

- [x] Given add then change in one window, then the message reads "<person>
      added to <phase> at <final %>".
- [x] Given add then remove in one window, then no commit is made.
- [x] Given rename A → B → C in one window, then the message reads "renamed
      from A to C".
- [x] Given a change and a change back to the saved value, then no note for it
      remains (and no commit if nothing else changed).
- [x] Given a person added and a person renamed A → B → C in one window, each
      with the rename subject the saved name ("A: renamed to C").
- [x] Given a removal and its Undo in one window, then no note and no commit.
- [x] Given several fields of one person changed in one window, then one
      subject with the changes joined by commas.
- [x] Given edits to two different entities, then both notes appear, joined as
      today.

## Flags and compromises

Touches every repository write method. Run it after the feature slices that
add repository methods, or rebase them onto it; it is the first of two
back-to-back slices (039, then 038) on the same note shape.

## Decided in review (pre-implementation)

- **Combination:** net effect, not every step.
- **Wording (one pattern):** "<person> added to <phase> at <%>", "<person> set
  to <%> in <phase>", "<person> removed from <phase>"; cost items the same
  ("Licences added to Development at €4,000", "Licences removed from
  Development"). The initiative prefix stays: "Checkout Redesign: …".
- **Rename:** the saved name is the subject: "Ana Lee: renamed to Ana Berg"
  (initiatives, roles, people alike; people change from "<new>: renamed from
  <old>"). The criterion's "renamed from A to C" reads "A: renamed to C".
- **Several changes to one entity in a window:** one subject, changes joined
  by commas ("Ana Lee: renamed to Ana Berg, capacity set to 80%, role set
  to Designer"); different entities are joined with "; " as today.
- **Note shape:** `{ entity: {kind, id}, field, from, to, words(from, to) }`,
  `absent` for an entity or value that did not exist; the writer calls `words`
  once on flush with the first `from` and the last `to`. "Saved" is the state
  before the first edit in the batch; merged-in changes of another writer are
  not described.
- **No commit** only when the window had notes, all cancelled, and the pending
  document equals the synced one; creating a file is never skipped. Remove
  then Undo in one window cancels out. An added entity keeps its add note's
  fields with final values; later edits to other fields fold in silently. The
  conflict suffix stays a verbatim internal note.
