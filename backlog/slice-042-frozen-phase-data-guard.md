---
slice_id: "042"
title: "Frozen phases: the data layer refuses every edit, and the snapshot keeps what its figures came from"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["008", "015"]
verification_status: null
superseded_by: null
supersedes: "051"
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review finding: only the UI and copyAllocations check isPhaseFrozen; editPhase checks the initiative-level freeze only. Backlog reshuffle (3 Oct 2026): merged with 051 (freezePhase stores resolved figures only), since both change how a passed gate freezes its phase (§8.1) in the same Repository code and tests; one session reads them once."
recommended_model: "Claude Opus 5.5"
model_rationale: "The guard is one predicate, but its interleavings (undo, in-flight edit, pulled gate pass) need careful tests, and the snapshot change alters a stored shape that frozen records depend on and cannot be verified by simple tests."
spec_sections: ["§8.1 Passing a gate", "§8.4 Closing and cancelling", "§5.11 Suggestions and shortcuts (Undo)", "§6 Data model (Gate record)", "§7.1 Time granularity and cost of an allocation"]
---

# Frozen phases: the data layer refuses every edit, and the snapshot keeps what its figures came from

## Intent

**Problem statement:** A passed gate freezes its phase (§8.1), but only the
screens and `copyAllocations` enforce it. `Repository.editPhase` checks the
Closed/Cancelled freeze only. Remove an allocation, pass the gate inside the
10-second undo window, click Undo: the allocation returns to the frozen phase,
and capacity, the phase summary and rate-impact counts (which read the live
plan) disagree with the frozen snapshot the cost figures show.

Separately (from 051), §8.1 and §6 say a passed gate freezes the period,
allocations and cost items "with the rates, roles, countries and person data
behind them". `freezePhase` stores the monthly estimate and each allocation's
total only. The displayed figures cannot move, but nobody can later see why a
figure was what it was (a rate changed, a person moved country).

**Outcome statement:** One guard in the data layer refuses any edit to a
frozen phase, so no path (Undo, an in-flight edit, a pulled gate pass) can make
the live plan diverge from `frozenSnapshot`; and a gate's snapshot lets an
auditor reconstruct its estimate, or the spec states plainly that resolved
figures are all it keeps.

## Scope

**Guard**

- `editPhase` returns false when `isPhaseFrozen(initiative, phaseId)`; the
  `allowFrozen` path (recorded actuals, §8.4) stays exempt.
- A gate pass dismisses any open "Removed. Undo" toast for that initiative.
- An edit already queued for a phase that a pull then freezes is dropped, with
  the failed-edit message the writer already uses.

**Snapshot (from 051)**

- `FrozenAllocation` gains per-month working days, day rate, cost factor,
  person name, role and country at pass time.
- Snapshots already on the `data` branch are untouched (§8.1: never edited,
  including by migrations); readers treat the new fields as optional.
- The history/Reopen displays are unchanged.

## Execution path

1. User removes an allocation in Validation, passes the gate within 10 s.
2. Undo is clicked, or an edit made just before the pass is flushed.
3. The data layer refuses; the live plan stays equal to the snapshot, and
   the snapshot holds the rates, roles, countries and person data behind
   its estimate.

## Value

- **Desirable:** A passed gate is a record people rely on (§8.1).
- **Usable:** No visible change in normal use.
- **Valuable:** Capacity and the cost figures cannot disagree after a pass,
  and a frozen figure can be explained later.

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
- [ ] Given a gate passed, then its snapshot holds rate, factor, working days,
      person, role and country per allocation, and the estimate recomputed
      from those equals the stored estimate.
- [ ] Given a later rate or person change, then the snapshot is unchanged.
- [ ] Given an old snapshot without the new fields, then everything renders.

## Flags and compromises

The extended snapshot adds weight to every initiative file (§3 Storage
limits); measure it. If the session finds the slice too large, the guard
and the snapshot can be committed separately as two `Slice 042:` commits.

## Open decisions (settle with the user before implementation)

- Silent refusal versus a message when the UI offers an edit the layer then
  refuses (only reachable through the races above). Recommended: silent for
  Undo, failed-edit message for a queued edit.
- Extend the snapshot (recommended, matches the spec) or amend §8.1 and §6 to
  say only resolved figures are kept.
- Phase coverage counts months outside the period (a one-month cost item in
  June makes a Jan–Feb phase Forecast); decide count-period-only (recommended,
  matches §4) and fix in this slice.
