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
change_summary: "Decided in review: €0-estimate kept spec-literal (always shows 'using the estimate'); actuals row shows the confirm check and an always-visible editable field side by side; the phase header total/pill become coverage-aware (Estimate/Forecast/Actual, blended total); deviation ships as a data function only, with no Cost summary UI yet; phaseMonths sources from the phase period and recorded actualMonths keys only, cost-item months joining once slice 007 lands."
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

**Decided in review (pre-implementation):**
- The €0-estimate call from engine-audit.md: kept spec-literal. A closed
  month with no recorded actual always shows "using the estimate," even
  when the estimate is exactly €0 — §7.3's wording carries no exception,
  and AC #1 states none either.
- The actuals row's confirm check and editable field sit side by side and
  are both always visible for a closed, unrecorded month (no click-to-edit
  step), matching the app's existing inline-editing convention
  (PercentInput, DateInput). The check records the estimate; typing in the
  field and committing (blur/Enter) records an override — either is the
  slice's single act. Once a month has a recorded actual, its row keeps
  only the editable field (no check), since there is nothing left to
  confirm; the field stays open to correction at any time (§6).
- The phase header's total and coverage pill (currently a hardcoded
  "Estimate" label predating actuals, PhasesSection.tsx:212-215) become
  coverage-aware in this slice: the total is the blended figure (recorded
  actual where present, estimate otherwise) and the pill reads Estimate /
  Forecast / Actual per §4. Needed for the slice's own outcome — otherwise
  recording an actual would change nothing visible above the actuals
  table.
- Deviation (§4) ships as a data-layer function only (no Cost summary
  section exists yet to show it in — that lands with a later slice, per
  slice-008's "approved at" scope). "Becomes available" is satisfied by
  the calculation being correct and ready for that slice to consume.
- `phaseMonths` sources from the phase period and recorded `actualMonths`
  keys only (per engine-audit.md's call), since cost items (slice 007)
  are not yet in the data model; slice 007 extends it with cost-item
  months when it lands.

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

- [x] Given a closed month with no recorded actual, when the phase is
      viewed, then it shows "using the estimate" with the estimate value.
- [x] Given the confirm check on such a month, when clicked, then the
      estimate is recorded as the actual in one action.
- [x] Given a different amount is typed for a closed month, when
      submitted, then it is recorded as the actual, overriding the
      estimate.
- [x] Given a month that has not yet ended, when the phase is viewed, then
      it shows "not closed yet" with no actual field.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
