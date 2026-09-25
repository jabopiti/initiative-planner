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
change_summary: "Decided in the pre-implementation review: an item is added on an unsaved draft row that commits once, on Add; timing is a two-segment toggle; the empty state, the outside-the-period warning, the refusals and the no-period rule are worded and fixed; the month input (§9.11) is built here as a shared component, since it is specified but does not exist yet."
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

- Decided in review (pre-implementation):
  - **Data shape.** A phase plan gets an optional `costItems` list of
    `{ id, label, amount, timing: 'month' | 'spread', month? }`. The list is
    optional, so existing initiative files need no migration. The month is
    kept while the timing is "spread", so switching back restores it.
  - **Spread.** An equal share goes into every calendar month the period
    touches; the partial first and last months are not prorated (§7.1).
  - **Add flow.** **Add cost item** opens an unsaved draft row beneath the
    table with Label, Amount, the timing toggle, **Add** and **Cancel**. One
    commit when Add is pressed with a label and an amount; the item is then a
    normal row edited in place (commit on blur or Enter). Nothing blank is ever
    saved. Timing defaults to Spread over the phase.
  - **Timing control.** A segmented toggle, "One month" | "Spread over the
    phase"; the month input (§9.11) appears beside it while One month is
    selected.
  - **Month input.** Built here as a shared component from Popover, Input and
    Button: type "Sep 2026" or open a popover with a year stepper and the twelve
    months, operable by keyboard like the date input. The year filter (§5.2)
    reuses it later. A month outside the phase's period is accepted.
  - **Outside the period.** A one-month item whose month is outside the valid
    period shows the warning "Dec 2026 is outside the phase's period. It still
    counts." under its row (warning icon and text), and counts.
  - **No valid period** (unset or inverted). The phase isn't costed yet: its
    total stays "—" and items don't count, but they stay listed and editable,
    and no outside-the-period warning shows.
  - **Phase total.** Shown once the period is valid and the phase has people or
    cost items.
  - **Empty state (§9.4).** "No cost items yet — Add cost item".
  - **Refusals.** An empty label: "Enter a label." An empty, non-numeric or
    negative amount: "Enter an amount of 0 or more." (0 is allowed.) An
    unreadable month: "Enter a month such as Sep 2026."
  - **Removing.** The trash button on the row removes the item and shows
    "Removed." with Undo for 10 seconds, as for allocations; Undo restores it at
    its old position.
  - Frozen phases and Closed or Cancelled initiatives are not locked here, as
    for allocations today; slice 008 and §8.4 own that.

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

- [ ] Given a phase without a valid period, when a cost item is added, then
      it is listed and editable, the phase total stays "—", and no
      outside-the-period warning shows.
- [ ] Given the draft row, when Add is pressed with no label or with an amount
      that is empty, text or negative, then nothing is saved and the refusal
      is shown inline; with both valid, one item is committed and the draft
      closes.
- [ ] Given a cost item, when it is removed, then "Removed." with Undo shows,
      and Undo restores it at its old position.
- [ ] Given a phase with no cost items, then it reads "No cost items yet" with
      the Add cost item action.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
