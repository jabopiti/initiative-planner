---
slice_id: "061b"
title: "Phase editing: cost item month strip, actuals that record in one click"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["056", "057", "059b", "060"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Split from 061 in the backlog reshuffle of 3 Oct 2026, as 061's own flag proposed: items 4 and 5 (cost item month strip, actuals). Chosen by the user on 2 Oct 2026 from the 'Fewer steps, same plan' proposals 3 and 4. Takes over the review's F15 (from 056) so the actuals table isn't changed twice. The bulk 'Record all as estimated' button was withdrawn (non-goal: bulk actual-cost entry). Waits on 059b for the shared month cells and on 060 for the amount field; the allocation work (061) no longer waits on either."
recommended_model: "Claude Sonnet 5"
model_rationale: "Builds on 059b's month cells and 060's AmountInput; the timing and recording rules are table-driven and cheap to test first."
spec_sections: ["§5.4 Initiative detail view", "§7.1 Time granularity and cost of an allocation", "§7.3 Actuals default to the estimate once a month closes", "§9.5 Accessibility", "§9.11 Lists, filters, inputs and amounts"]
---

# Phase editing: cost item month strip, actuals that record in one click

## Intent

**Problem statement:** A cost item's timing is a toggle plus a separate
month field; and every closed month in actuals shows a check icon, the
estimate twice and an empty box, while future months take a row each.

**Outcome statement:** Tap a month to time a cost, and record a month with
one button.

## Scope

1. **Cost item month strip** (§5.4): the period's months as one strip
   (059b's month cells); **Spread over the phase** by default; each month
   shows what it receives; month input beside it for a month outside the
   period; no valid period → today's toggle. Amount uses 060's
   `AmountInput`.
2. **Actuals** (§5.4, §7.3, F15 from 056): unrecorded closed month → the
   estimate in the "using the estimate" style, **Record <estimate>** and
   **Different amount** (060's `AmountInput`, placeholder "Actual");
   recorded → the actual, its difference, **Change**; months not yet closed
   fold into one line with their estimated total. One month at a time; no
   bulk record (§1 Non-goals).

## Execution path

1. Add cost item "Load-testing licences", "12k" → tap Nov → Add → €12,000
   in Nov only.
2. Validation actuals → Jul **Record €25,760** → recorded; Aug **Different
   amount** "24.1k" → recorded €24,100, "+€580 vs estimate".

## Value

- **Desirable:** The phase reads like a plan, not a form.
- **Usable:** One click for the common action in each table.
- **Valuable:** Faster month-end recording, and two tables changed once
  instead of twice.

## Acceptance criteria

- [ ] Given a cost item of €12,000 on a six-month period, then Spread shows
      €2,000 in each month; tapping Nov shows €12,000 in Nov alone, and Add
      saves timing one-month Nov.
- [ ] Given a phase without a valid period, then the timing is the One
      month / Spread toggle with the month input.
- [ ] Given an unrecorded closed month, then **Record €25,760** records it
      in one write; **Different amount** "24.1k" records 24100.
- [ ] Given six months not yet closed, then one line reads "Oct 2026 – Mar
      2027 · 6 months not closed yet" with their total.
- [ ] Given the e2e axe scan, then the detail page passes in both themes.

## Flags and compromises

061 (allocations) and 061b touch the same phase editor but different
tables; they can run in either order.

## Decided in review (pre-implementation)

User picked proposals 3 and 4 on 2 Oct 2026 from rendered mockups ("Fewer
steps, same plan"), while this was part of 061.
