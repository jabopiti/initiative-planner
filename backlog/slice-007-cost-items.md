---
slice_id: "007"
title: "Add cost items to a phase"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Sonnet 5"
model_rationale: "Straightforward CRUD plus one clear timing rule (one month vs. spread over the phase); no financial-formula risk since it adds to an already-correct phase total from slice 005."
spec_sections: ["§4 Core definitions (Cost item)", "§5.4 Initiative detail view (cost items table)", "§6 Data model (Cost items list)", "§7.1 Time granularity and cost of an allocation (cost item timing)"]
---

# Add cost items to a phase

## Intent

**Problem statement:** An initiative owner cannot capture a non-people
cost, such as a penetration test or hardware purchase, when planning a
phase, because slice 005 only accounts for allocated people.

**Outcome statement:** This slice contributes to a complete cost picture
by enabling an initiative owner to add named, priced cost items to a
phase, timed in one month or spread evenly across it.

## Scope

- A cost items table beneath the allocation table: label, amount, timing
  (one month within the phase, or spread over the phase).
- The phase total (header) includes cost items alongside allocation cost.
- Items whose one-off month falls outside a later-shortened period stay
  and keep counting, with a warning (§6).
- Per engine-audit.md, the prototype's `phaseOtherByMonth` only ever
  handles a single-month item — write the spread-timing split fresh from
  §7.1 rather than porting it. (When the excluded "Cost item suggestions"
  §5.11 is picked up in a later slice, `otherCostSuggestions` needs the
  same rework.)

**Explicitly excluded:** Cost item suggestions from prior initiatives
(§5.11) — a plain label field is sufficient for a cost item to exist and
count correctly; suggesting reused labels is a pure convenience addable
later without changing this slice's core behaviour.

## Execution path

1. User triggers: on a phase, clicks Add cost item.
2. UI: user enters a label, an amount, and chooses one month or spread.
3. Engine: adds the item's monthly share into the phase's monthly estimate
   (§7.1) — the full amount in its one month, or an equal share in each
   month of the phase if spread.
4. Data: the cost item is committed with the phase.
5. User receives: an updated phase total reflecting the new cost item.

## Value

- **Desirable:** An initiative owner planning a phase with a known
  external cost (a licence, a security review) would seek this
  immediately upon needing to include it.
- **Usable:** A user can add a labelled amount and choose its timing
  without needing to understand the underlying monthly math.
- **Valuable:** After this slice, an initiative's cost reflects real
  non-people spend, not just people time.

## Acceptance criteria

- [ ] Given a phase with a cost item timed to one month, when the phase
      total is viewed, then that month's estimate includes the full item
      amount and other months do not.
- [ ] Given a phase with a cost item spread over the phase, when the
      phase total is viewed, then each month of the period includes an
      equal share of the item's amount.
- [ ] Given a phase's period is later shortened past a cost item's month,
      when the phase is viewed, then the item still counts and a warning
      is shown.

## Delivery gate

- [ ] Deployed to production-equivalent environment
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner)

## Flags and compromises

None.
