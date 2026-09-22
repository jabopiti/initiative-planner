---
slice_id: "010"
title: "Record actuals for a closed month"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Sonnet 5"
model_rationale: "A bounded, well-specified rule (§7.3) with one edge case (the default-to-estimate display); viable as Haiku 4.5 once the phase-editing patterns from slice 005 are established in the codebase."
spec_sections: ["§4 Core definitions (Estimate, Forecast, Actual)", "§5.4 Initiative detail view (actuals table)", "§6 Data model (Actuals)", "§7.3 Actuals default to the estimate once a month closes"]
---

# Record actuals for a closed month

## Intent

**Problem statement:** An initiative owner cannot reconcile a phase's plan
against reality once a month has passed, because slice 005 only produces
estimates, with no way yet to record what was actually spent.

**Outcome statement:** This slice contributes to an accurate, current cost
picture by enabling an initiative owner to record an actual for a closed
month, with unrecorded closed months defaulting visibly to their estimate.

## Scope

- The actuals table row per month: the estimate, and the actual (§5.4).
- A closed month (one that has ended) with no recorded actual shows "using
  the estimate" and a check icon that records the estimate as the actual
  in one act; typing a different amount records that instead.
- A month not yet closed shows "not closed yet".
- Deviation (actual minus estimate) becomes available once at least one
  month has a recorded actual.
- Two calls from engine-audit.md to make deliberately here, not inherit
  silently: whether a closed month whose estimate is exactly 0 shows
  "using the estimate" (the prototype's `actualOrEstimate` hides it; §7.3
  reads as unconditional) — pick one and note it; and when porting
  `phaseMonths`, source a phase's months from its period, recorded
  `actualMonths` keys and cost-item months only — the prototype also folds
  in an `actualStartDate`/`actualEndDate` range that §6 has no field for.

**Explicitly excluded:** The Overdue item in Needs attention (slice 011)
— recording an actual correctly is the core behaviour here; surfacing that
one is missing is a separate, later aggregation on top of this data.

## Execution path

1. User triggers: opens a phase whose period includes a month that has
   ended.
2. UI: that month's row shows its estimate and "using the estimate", with
   a confirm check and an editable field.
3. User triggers: confirms the estimate, or types a different amount.
4. Data: the actual is committed to the phase (§6); recording is a single
   act with no separate confirmation step.
5. User receives: the month now shows its recorded actual, and deviation
   reflects it.

## Value

- **Desirable:** An initiative owner closing out a month's spend would
  seek this to keep the initiative's figures current.
- **Usable:** A user can confirm or override a defaulted estimate with one
  action, without a separate save step.
- **Valuable:** After this slice, an initiative's cost picture reflects
  real spend where it's known, instead of remaining a pure estimate
  forever.

## Acceptance criteria

- [ ] Given a closed month with no recorded actual, when the phase is
      viewed, then it shows "using the estimate" with the estimate value.
- [ ] Given the confirm check on such a month, when clicked, then the
      estimate is recorded as the actual in one action.
- [ ] Given a different amount is typed for a closed month, when
      submitted, then it is recorded as the actual, overriding the
      estimate.
- [ ] Given a month that has not yet ended, when the phase is viewed, then
      it shows "not closed yet" with no actual field.

## Delivery gate

- [ ] Deployed to production-equivalent environment
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner)

## Flags and compromises

None.
