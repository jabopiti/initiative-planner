---
slice_id: "027"
title: "Fix suggestions for capacity warnings"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["009", "023"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Fix suggestions for capacity warnings, §5.11). Review: fixes use the warnings' months (current month on), whole percents; the raise covers all upcoming months on the team; row fixes on one line under the warnings; grid detail shows the raise once and the reduce per allocation, in the cell and the row detail."
recommended_model: "Claude Opus 5.5"
model_rationale: "The 'value that fits for every month' is a minimum over months of two different headrooms, with Provisional phases and non-counting initiatives excluded, and the Team FTE % raise must itself stay within Capacity %; an off-by-one here produces a fix that doesn't fix. Needs exhaustive data-layer tests against 009's warning rules."
spec_sections: ["§5.11 Suggestions and shortcuts (Fix suggestions)", "§7.2 Capacity, rates, and the three percentages", "§5.4 Initiative detail view (allocation warnings)", "§5.8 Team detail view (Capacity view)", "§10.3 Writing"]
---

# Fix suggestions for capacity warnings

## Intent

**Problem statement:** Platform's capacity grid warns that Felix Brandt is over
their Team FTE % in November and December. The team lead now has to work out
by hand what Allocation % would fit in every month, or whether their Team FTE %
could simply go up — and then find the right field to change.

**Outcome statement:** Every capacity warning offers up to two exact,
one-click fixes that are guaranteed to clear it (§5.11), so resolving
over-allocation takes a click instead of arithmetic.

## Scope

- **Where (§5.11).** Under a capacity warning on an allocation row (§5.4) and
  in the capacity grid's row/cell detail (§5.8).
- **Fix 1 — reduce.** "Set to 60%": the highest Allocation % at which this
  allocation causes neither warning in any month of its phase (other loads
  unchanged; Provisional phases and non-counting initiatives excluded, §7.2).
  Offered when that value is above 0% and below the current one.
- **Fix 2 — raise Team FTE %.** "Raise Team FTE % to 80%": for an over Team
  FTE % warning only, the lowest Team FTE % on this team that covers the
  person's highest month on this team from the current month on, offered only when it fits within the person's Capacity %
  minus their other teams' Team FTE %s.
- **Presentation.** Small secondary buttons under the warning text, each
  naming the exact result. Each is one edit and one commit ("Checkout
  Redesign: Felix Brandt set to 60% in Development"; "Felix Brandt: Team FTE %
  on Platform raised to 80%"). The warning clears on its own.
- In the grid, a cell's or row's detail offers the reduce per contributing
  allocation of this team's initiatives and the raise once (other teams'
  allocations are named, not fixed from here).

**Explicitly excluded:** fixes for "Team FTE %s add up to more than Capacity %"
and for allocations that outlived a membership (§5.11 lists only the two).

## Execution path

1. Felix Brandt: 80% on Checkout Redesign's Development; Team FTE % 60%.
2. The row's warning shows **Set to 60%** and **Raise Team FTE % to 80%**
   (their Capacity % is 100%, no other team).
3. User clicks one; the warning disappears.

## Value

- **Desirable:** Leads want the answer, not the arithmetic.
- **Usable:** The exact result is on the button.
- **Valuable:** Turns 009's warnings from alarms into actions.

## Acceptance criteria

- [ ] Given an over Team FTE % warning where 60% fits every month, then "Set to
      60%" shows; clicking it sets 60% and the warning clears.
- [ ] Given the fitting value varies by month, then the button offers the
      minimum over the phase's months from the current month on, rounded
      down to a whole percent.
- [ ] Given the person is over Team FTE % in several phases on this team,
      then the raise covers the highest month of all of them (rounded up),
      and applying it clears every one of those warnings.
- [ ] Given an over Capacity % warning, then only the reduce fix is offered.
- [ ] Given raising Team FTE % to cover the peak would exceed Capacity % minus
      other teams' Team FTE %s, then the raise fix is not offered.
- [ ] Given no positive value fits (someone else fills the capacity), then the
      reduce fix is not offered.
- [ ] Given Provisional phases or On Hold initiatives among the loads, then they
      don't affect the suggested values.
- [ ] Given the capacity grid's cell or row detail, then the same fixes are offered for
      this team's contributing allocations, and applying one updates the grid.
- [ ] Given a frozen phase's allocation, then no reduce fix is offered for it.
- [ ] Given a row with both warnings, then one reduce fix shows, on one line
      under the warnings, and it clears both.
- [ ] Given each fix, then it is one commit with plain-words message.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Presentation:** secondary buttons under the warning text, each naming the
  exact result ("Set to 60%", "Raise Team FTE % to 80%").
- **Months (review, 2026-10-01):** the fixes look at the same months as the
  warnings — the current month on — so a fix always clears what is shown.
- **Rounding:** the reduce value rounds down to a whole percent, the raise
  rounds up; the rounded raise must still fit within Capacity % minus other
  teams' Team FTE %s. A reduce that rounds to 0% is not offered.
- **Reduce clears both ceilings:** one reduce fix per row, whichever warning
  shows. The raise is offered for any over Team FTE % warning it fits,
  even if an over Capacity % warning stays (the reduce covers that).
- **Raise scope (D1):** the person's highest month on this team's counted
  initiatives from the current month on — one value on every row and in the
  grid, clearing all their Team FTE % warnings on the team at once.
- **Row layout (D2, option A):** the fixes sit together on one line under all
  of the row's warnings.
- **Grid layout (D3, option A):** in the cell and the row detail, the raise
  shows once under the warnings; the reduce sits beside each of this team's
  counted, non-frozen allocations in the Counted list; other teams' lines
  get no button.
- **Not shown** on frozen phases (reduce only; the raise is a membership
  edit), in read-only mode, or where no warning shows.
- **Controls:** shadcn `Button` `variant="secondary"` `size="xs"`; accessible
  name adds context ("Set Felix Brandt to 60% in Development"). After a fix,
  focus moves to the row's Allocation % field, or the detail heading.
- **Writes:** existing `updateAllocation` / `updateMembership` edits, one
  commit each, with the existing messages ("Checkout Redesign: Felix Brandt
  set to 60% in Development"; "Felix Brandt: Team FTE % on Platform set to
  80%" — "set to", not "raised to", per §10.3's net-effect wording).
