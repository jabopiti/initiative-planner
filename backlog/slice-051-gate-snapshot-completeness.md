---
slice_id: "051"
title: "Frozen snapshot keeps the rates, roles, countries and person data"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["008"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review finding: freezePhase stores resolved figures only; §8.1 and §6 say the snapshot includes the rates, roles, countries and person data behind them."
recommended_model: "Claude Opus 5.5"
model_rationale: "Changes a stored data shape that frozen records depend on; needs a decision on old snapshots and cannot be verified by simple tests."
spec_sections: ["§8.1 Passing a gate", "§6 Data model (Gate record)", "§7.1 Time granularity and cost of an allocation"]
---

# Frozen snapshot keeps the rates, roles, countries and person data

## Intent

**Problem statement:** §8.1 and §6 say a passed gate freezes the period,
allocations and cost items "with the rates, roles, countries and person data
behind them". `freezePhase` stores the monthly estimate and each allocation's
total only. The displayed figures cannot move, but nobody can later see why a
figure was what it was (a rate changed, a person moved country).

**Outcome statement:** A gate's snapshot lets an auditor reconstruct its
estimate, or the spec states plainly that resolved figures are all it keeps.

## Scope

- `FrozenAllocation` gains per-month working days, day rate, cost factor,
  person name, role and country at pass time.
- Snapshots already on the `data` branch are untouched (§8.1: never edited,
  including by migrations); readers treat the new fields as optional.
- The history/Reopen displays are unchanged.

## Acceptance criteria

- [ ] Given a gate passed, then its snapshot holds rate, factor, working days,
      person, role and country per allocation, and the estimate recomputed
      from those equals the stored estimate.
- [ ] Given a later rate or person change, then the snapshot is unchanged.
- [ ] Given an old snapshot without the new fields, then everything renders.

## Flags and compromises

Adds weight to every initiative file (§3 Storage limits); measure it.

## Open decisions

- Extend the snapshot (recommended, matches the spec) or amend §8.1 and §6 to
  say only resolved figures are kept.
- Phase coverage counts months outside the period (a one-month cost item in
  June makes a Jan–Feb phase Forecast); decide count-period-only (recommended,
  matches §4) and fix in this slice.
