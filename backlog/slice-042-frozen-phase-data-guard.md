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
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review finding: only the UI and copyAllocations check isPhaseFrozen; editPhase checks the initiative-level freeze only. Backlog reshuffle (3 Oct 2026): merged with 051 (freezePhase stores resolved figures only), since both change how a passed gate freezes its phase (§8.1) in the same Repository code and tests; one session reads them once. Review (3 Oct 2026): late Undo silent, toast withdrawn on freeze; an edit a freeze overtakes shows an inline lost-edit message; snapshot extended with per-month days counted and day rate plus person, role and country names; the frozen table shows them; coverage counts period months only."
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
- An edit already queued for a phase that a pull then freezes is dropped, and
  the phase shows the lost-edit message (see Decided in review).

**Snapshot (from 051)**

- `FrozenAllocation` gains per-month working days, day rate, cost factor,
  person name, role and country at pass time.
- Snapshots already on the `data` branch are untouched (§8.1: never edited,
  including by migrations); readers treat the new fields as optional.
- The history/Reopen displays are unchanged, except the frozen allocations
  table, which shows the snapshot's name and role.
- Phase coverage counts the period's months only (§4).

**Decided in review (pre-implementation)**

- **Refusal feedback (D1).** A late Undo is refused silently: its toast is
  already gone, since each "Removed. Undo" toast is dismissed once its
  phase is frozen or the initiative is Closed or Cancelled, whether that
  happened here or arrived in a pull (§5.11). Any other edit lost to a
  freeze shows a message: one still waiting to save when a pull brings
  the gate pass (today the merge keeps the frozen version and drops it
  without a word, `merge.ts`), or one committed after the freeze arrived
  (a field committed on blur).
- **Lost-edit message (D2).** Inline at the top of the frozen phase's body,
  a warning line with a dismiss button, kept in memory only (a reload
  clears it), per §9.9 (no toast stack; the message appears where the
  action happened): "G2 was passed while you were editing, so your last
  change to Validation wasn't saved." (`<gate> … <phase>`), following
  the existing "X was deleted, so your last change to it wasn't saved."
- **Snapshot (D3).** Extended, as §6 and §8.1 already say; the spec is
  not walked back.
- **Snapshot shape (D4).** Each `FrozenAllocation` gains `personName`,
  `roleName` (the custom label for a custom role), `countryName`,
  `costFactor` and `months: { [YYYY-MM]: { workingDays, dayRate } }`,
  where `workingDays` is the days counted after proration (§7.1) and
  `dayRate` is the rate for that year (the custom role's own rate for a
  custom role). Cost = Σ workingDays × Allocation % × dayRate × costFactor,
  with no calendar logic. All optional; a person missing at pass time
  gets none of them and cost 0, as today.
- **Frozen table (D5).** The frozen allocations table shows the
  snapshot's `personName` and `roleName`, falling back to live data for
  snapshots without them (so a deleted person no longer reads "Unknown
  person"). This replaces "the history/Reopen displays are unchanged" for
  this one table; nothing else on screen changes.
- **Coverage (D6).** `phaseCoverage` counts the period's months only (§4);
  out-of-period cost items and actuals still add to totals.
- Assumptions: `editPhase` refuses (no state change, no commit, returns
  false) when `isPhaseFrozen`, with `allowFrozen` (`setActual`) exempt;
  snapshot weight measured in a test (about 60 B per allocation-month);
  the guard and the snapshot ship as two commits, the last one
  `Slice 042:`.

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

- [x] Given a passed gate, when `setPhaseDate`, `addAllocation`,
      `updateAllocation`, `removeAllocation`, `restoreAllocation`,
      `addCostItem`, `updateCostItem`, a cost-item remove or restore, or
      `extendPhase` targets that phase, then nothing changes and no commit is
      made.
- [x] Given a frozen phase, when `setActual` is called, then it is accepted.
- [x] Given Undo is available and the gate is then passed, then the toast is
      gone and a late `restoreAllocation` does nothing.
- [x] Given an edit queued for a phase a pull freezes, then it is not
      written and the phase shows "<gate> was passed while you were
      editing, so your last change to <phase> wasn't saved." until
      dismissed.
- [x] Given a frozen phase whose person later changed role or was deleted,
      then the frozen table shows the snapshot's name and role.
- [x] Given a Jan–Feb phase with a one-month cost item or an actual in June
      and no actual in Jan or Feb, then its coverage is Estimate.
- [x] Given a gate passed, then its snapshot holds rate, factor, working days,
      person, role and country per allocation, and the estimate recomputed
      from those equals the stored estimate.
- [x] Given a later rate or person change, then the snapshot is unchanged.
- [x] Given an old snapshot without the new fields, then everything renders.

## Flags and compromises

The extended snapshot adds weight to every initiative file (§3 Storage
limits); measure it. If the session finds the slice too large, the guard
and the snapshot can be committed separately as two `Slice 042:` commits.

## Open decisions

All settled on 3 Oct 2026; see Decided in review under Scope.
