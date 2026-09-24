---
slice_id: "005h"
title: "Merge initiative files by path"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005g"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Refactor found in the review of slices 003 to 005d. The initiative merge names each mergeable field in code (top-level fields, then each phase's two dates, then allocations), and rebuilds a merged phase from only those fields, so any field added later, such as cost items, actuals or gate records, would be dropped from a merged file without a conflict. The list merge and the initiative merge also report conflicts in two shapes, and the banner shows raw JSON."
recommended_model: "Claude Opus 5"
model_rationale: "The merge rules (§10.5) are exact and small, but a generic version must keep every case of the current one, and the invariants that matter (a frozen snapshot never changes, a same-field conflict is never auto-resolved) are easy to break in a general algorithm. Fixture-driven tests written from §10.5 first, then the rewrite."
spec_sections: ["§10.5 Merging", "§3 Storage & sync (Conflict edge cases)", "§6 Data model (Initiative, Phase data)", "§8.1 Gates and frozen snapshots", "§9.9 Interface states (Same-field conflict)"]
---

# Merge initiative files by path

## Intent

**Problem statement:** Two people edit the same initiative at the same time:
one changes a phase's end date, the other adds a cost item. The merge only
knows the fields it was told about, so as the initiative page grows (cost
items, actuals, checklist state, gate records) each new field would need
merge code, and a field that was forgotten would be silently lost from the
merged file. When a real conflict occurs, the banner shows both values as
raw data.

**Outcome statement:** This slice contributes to the principle that when
two users change different things, both changes are kept, and when they
change the same thing, the tool says exactly what, by making the merge
follow the shape of the document instead of a list of known fields.

## Scope

- **One path-addressed three-way merge** for every document. Objects merge
  by key, recursively. Lists whose items have an `id` merge by id, as §10.5
  step 4 says (an item added on one side is kept, one removed on one side
  and unchanged on the other is removed, one on both sides is merged by the
  same rule). Everything else is a value: changed on one side only takes that
  side, changed on both to the same value keeps it, changed on both to
  different values is a **conflict**, never resolved automatically.
- A field that no code has heard of merges by default. A field present on
  only one side is kept.
- **One conflict shape:** `{ path, base, mine, theirs }`, where the path is
  the document's key path with list items named by id. Resolving sets the
  chosen side's value at the path, and only there, so the clean part of the
  merge is untouched.
- The master files (teams, people, memberships) use the same merge, and the
  list merge and the per-field merge functions are removed.
- **The banner reads like a person would:** it names the initiative or the
  person and the field in words, and shows both values as they appear on
  screen ("Validation end date: yours 30 Nov 2026, theirs 15 Dec 2026"), not
  as JSON. Copy is agreed in chat before it is built.
- **Frozen phases never merge.** A phase frozen by a passed gate (§8.1)
  keeps its snapshot whatever either side holds. Until gates exist (slice
  008) this is covered by a test that marks a phase frozen; slice 008 makes
  the marker real.

**Explicitly excluded:** The writer's retry, debounce and status (slice 005g);
showing a conflict inline under the field instead of in the banner (§9.9),
which needs the field-level display of a later slice.

## Execution path

1. User triggers: edits a field while a colleague has saved another change.
2. Data: the save is refused (409); the file is re-read and merged by path
   with the version the user started from as the base.
3. Data: independent changes are written together; a change to the same
   field is shown, not written.
4. User receives: their edit and the colleague's both in place, or the
   banner naming the field with both values.

## Value

- **Desirable:** Working in the same initiative at once should just work.
- **Usable:** A conflict names the thing in words, so the choice is
  informed.
- **Valuable:** New fields in later slices are protected without writing
  merge code for each.

## Acceptance criteria

- [ ] Given every merge case §10.5 steps 3 and 4 describe, when the fixture
      tests written from them run against the new merge, then each passes,
      and every case the current merge tests pin still passes.
- [ ] Given a field the merge has no code for (a new top-level field, a new
      phase field), when it changes on one side, then the merged file holds
      it, and when it changes on both sides differently, then a conflict
      names its path.
- [ ] Given a person changes a phase's end date and another adds an
      allocation to the same phase, when both save, then both changes are in
      the file and there is no conflict.
- [ ] Given a conflict, when Use mine or Keep theirs is chosen, then only
      that path takes the chosen value and the rest of the merge is written
      as it was.
- [ ] Given a conflict, when the banner renders, then it names the
      initiative or person and the field in words and shows both values in
      the form they have on screen, not as JSON.
- [ ] Given a phase marked frozen, when either side changed anything in it,
      then the merged file keeps the frozen snapshot unchanged.
- [ ] Given the master files, when a shared item is edited on both sides,
      then it merges by the same function, and the per-shape merge functions
      no longer exist.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

§10.5 describes the rules; this slice keeps them and generalises how they
are applied, so the spec text stays. The frozen-phase rule cannot be
exercised against real frozen phases until slice 008; slice 008 carries the
obligation to replace the test's marker with the real one, as slice 005e
does for its locked-phase predicate.
