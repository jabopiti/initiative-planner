---
slice_id: "025"
title: "Extend an overrun phase by one month"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["008"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Found while slicing the backlog tail: §5.11's Extend on overrun suggestion was never built and was missing from the tail."
recommended_model: "Claude Haiku 4.5"
model_rationale: "One action on an existing magic bar state, reusing the default plan's month arithmetic; fully specified."
spec_sections: ["§5.11 Suggestions and shortcuts (Extend on overrun, Default plan)", "§5.4 Initiative detail view (magic bar)", "§8.1 Passing a gate", "§10.3 Writing"]
---

# Extend an overrun phase by one month

## Intent

**Problem statement:** When Development runs past its end date, the magic bar
turns to the Alarm state and stays there. Often the honest answer is "it
needs another month", but saying so means finding the end date field and
working out the new date.

**Outcome statement:** The overrun state offers one click that moves the
current phase's end a month later, keeping its allocations and moving nothing
else (§5.11), so a known delay is recorded in a second.

## Scope

- **Offer (§5.11).** In the magic bar's overrun state (Active initiative,
  current costed phase past its end, gate not passed), a text action
  **Extend Development by one month** under the overrun message. Not in the
  Needs attention strip.
- **Effect.** The end date moves one calendar month later by the default
  plan's rule (same day next month; a day the month lacks is its last day:
  31 Jan → 28/29 Feb). Allocations and cost items unchanged; later phases do
  not move — an overlap shows the existing "starts on or before" warning.
  Clears the default-plan marker like any plan edit. Commit: "Checkout
  Redesign: Development extended to 30 Oct 2026".
- If the phase is still overrun after one extension, the action stays.

**Explicitly excluded:** moving later phases; extending from the strip.

## Execution path

1. Development ended 30 Sep 2026; today is 12 Oct; the bar shows the overrun.
2. User clicks **Extend Development by one month**.
3. End date becomes 30 Oct 2026; the bar leaves the overrun state; Rollout is
   unchanged.

## Value

- **Desirable:** Delays are normal; recording them should be trivial.
- **Usable:** Right where the alarm is.
- **Valuable:** Keeps the Overrun signal meaningful by making it easy to clear
  honestly.

## Acceptance criteria

- [ ] Given the overrun state, then the bar shows "Extend <phase> by one
      month"; in any other state, it does not.
- [ ] Given it is clicked on a phase ending 30 Sep 2026, then the end date is
      30 Oct 2026, in one commit naming the new date.
- [ ] Given a phase ending 31 Jan 2027, then it ends 28 Feb 2027.
- [ ] Given later phases, then their dates are unchanged, and an overlap shows
      the existing warning.
- [ ] Given the phase is still past its end after extending, then the overrun
      state and the action remain.
- [ ] Given On Hold (014), then the action is not offered (no overrun shows).

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Placement:** the magic bar's overrun state only, not the Needs attention
  strip.
