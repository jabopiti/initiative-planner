---
slice_id: "005"
title: "Plan a costed phase and see its cost calculated"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["001", "004"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Opus 5"
model_rationale: "The core financial correctness of the whole product lives here (§7.1's exact formula). If slice 001 confirmed the prototype's cost function is directly reusable, Sonnet 5 is sufficient for the wiring; if the formula must be written or corrected from the spec, use Opus 5 for that part."
spec_sections: ["§4 Core definitions (Phase, Allocation %)", "§5.4 Initiative detail view (Phases section, allocation table)", "§6 Data model (Phase data)", "§7.1 Time granularity and cost of an allocation", "§7.2 Capacity (only a team's members may be allocated)"]
---

# Plan a costed phase and see its cost calculated

## Intent

**Problem statement:** An initiative owner cannot see what an initiative
will cost when they have staffed a team, because there is no way yet to
set a phase's period, allocate people to it, and have the cost calculated
from that.

**Outcome statement:** This slice contributes to the core principle that
cost falls out of planning the work by enabling an initiative owner to set
a phase's period, add allocations, and see the phase's cost computed
automatically from working days, day rate, role factor, and Allocation %.

## Scope

- The current phase's period as two date fields (§9.11 date input,
  simplified to a working control for this slice; the popover polish can
  follow).
- An allocation table: pick a person from the initiative's team, set
  Allocation %, see their computed cost for the phase.
- The phase header shows the phase total, summing allocations.
- Only a team's members may be allocated (§7.2); attempting otherwise is
  refused with the reason.
- The cost formula from §7.1, using the audited/reused engine code from
  slice 001 where confirmed reusable.

**Explicitly excluded:** Cost items (slice 007), capacity warnings on
allocation rows (slice 009 territory), and the availability suggestion in
the person picker (slice 006) — none of these are required for cost to
correctly fall out of a manually chosen allocation, which is the core
behaviour this slice proves.

## Execution path

1. User triggers: opens an initiative's page and sets the current phase's
   start and end date.
2. UI: the allocation table becomes editable; user picks a team member and
   sets Allocation %.
3. Engine: computes working days × Allocation % × country day rate × role
   cost factor per month (§7.1), summed into the phase total.
4. Data: the phase's period and allocations are committed to the
   initiative's file (§10.2).
5. User receives: a phase total and a per-person cost, updating as
   allocations change.

## Value

- **Desirable:** An initiative owner planning real work would seek this
  immediately after staffing a team — it is the tool's central promise.
- **Usable:** A user can set dates, add a person, set a percentage, and
  see a cost appear, without being told the formula.
- **Valuable:** After this slice, an initiative owner has a real,
  automatically derived cost estimate for a phase of work, replacing a
  manually maintained spreadsheet figure.

## Acceptance criteria

- [ ] Given a phase with a set period and one allocation, when the
      Allocation % is set, then the phase total updates to working days ×
      Allocation % × country day rate × role cost factor for each month of
      the period, summed.
- [ ] Given a phase whose start or end date falls mid-month, when the total
      is computed, then that month's working days are prorated by the share
      of the month's weekdays the period covers (§7.1), rather than counting
      the whole month or excluding it.
- [ ] Given a person who is not a member of the initiative's team, when
      an attempt is made to allocate them, then it is refused with the
      reason (§7.2).
- [ ] Given a person with a custom role, when they are allocated, then
      their cost uses their custom day rate and the role cost factor does
      not apply.
- [ ] Given the phase's allocations are saved, when the page is reloaded,
      then the same period, allocations and total appear.

## Delivery gate

- [ ] Deployed to production-equivalent environment
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner)

## Flags and compromises

None.
