---
slice_id: "042"
title: "A frozen phase refuses every edit in the data layer"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["008", "015"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review finding: only the UI and copyAllocations check isPhaseFrozen; editPhase checks the initiative-level freeze only."
recommended_model: "Claude Sonnet 5"
model_rationale: "One predicate added to one private method, but the interleavings (undo, in-flight edit, pulled gate pass) need careful tests."
spec_sections: ["§8.1 Passing a gate", "§8.4 Closing and cancelling", "§5.11 Suggestions and shortcuts (Undo)"]
---

# A frozen phase refuses every edit in the data layer

## Intent

**Problem statement:** A passed gate freezes its phase (§8.1), but only the
screens and `copyAllocations` enforce it. `Repository.editPhase` checks the
Closed/Cancelled freeze only. Remove an allocation, pass the gate inside the
10-second undo window, click Undo: the allocation returns to the frozen phase,
and capacity, the phase summary and rate-impact counts (which read the live
plan) disagree with the frozen snapshot the cost figures show.

**Outcome statement:** One guard in the data layer refuses any edit to a
frozen phase, so no path (Undo, an in-flight edit, a pulled gate pass) can make
the live plan diverge from `frozenSnapshot`.

## Scope

- `editPhase` returns false when `isPhaseFrozen(initiative, phaseId)`; the
  `allowFrozen` path (recorded actuals, §8.4) stays exempt.
- A gate pass dismisses any open "Removed. Undo" toast for that initiative.
- An edit already queued for a phase that a pull then freezes is dropped, with
  the failed-edit message the writer already uses.

## Execution path

1. User removes an allocation in Validation, passes the gate within 10 s.
2. Undo is clicked, or an edit made just before the pass is flushed.
3. The data layer refuses; the live plan stays equal to the snapshot.

## Value

- **Desirable:** A passed gate is a record people rely on (§8.1).
- **Usable:** No visible change in normal use.
- **Valuable:** Capacity and the cost figures cannot disagree after a pass.

## Acceptance criteria

- [ ] Given a passed gate, when `setPhaseDate`, `addAllocation`,
      `updateAllocation`, `removeAllocation`, `restoreAllocation`,
      `addCostItem`, `updateCostItem`, a cost-item remove or restore, or
      `extendPhase` targets that phase, then nothing changes and no commit is
      made.
- [ ] Given a frozen phase, when `setActual` is called, then it is accepted.
- [ ] Given Undo is available and the gate is then passed, then the toast is
      gone and a late `restoreAllocation` does nothing.
- [ ] Given an edit queued for a phase a pull freezes, then it is not
      written and the user sees the failed-edit message.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Open decisions (settle with the user before implementation)

- Silent refusal versus a message when the UI offers an edit the layer then
  refuses (only reachable through the races above). Recommended: silent for
  Undo, failed-edit message for a queued edit.
