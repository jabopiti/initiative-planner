---
slice_id: "024"
title: "Copy allocations from the previous costed phase"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005", "006", "023"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Copy allocations from the previous phase, §5.11). Review: skipped-people note is an info callout; all-skipped wording and assumptions recorded."
recommended_model: "Claude Haiku 4.5"
model_rationale: "One button, one data-layer function over existing membership rules; the skipped-people list is the only branch, and all of it is directly testable."
spec_sections: ["§5.11 Suggestions and shortcuts (Copy allocations)", "§5.4 Initiative detail view (Page sections: Phases)", "§7.2 Capacity, rates, and the three percentages", "§9.3 Deletion rules", "§10.3 Writing"]
---

# Copy allocations from the previous costed phase

## Intent

**Problem statement:** When Checkout Redesign moves from Validation into
Development, the same five people usually carry on. Its owner re-adds each of
them by hand, with the same percentages, phase after phase.

**Outcome statement:** An empty costed phase offers to copy the previous
costed phase's allocations in one click, skipping — and naming — anyone no
longer on the team, so staffing a new phase starts from the last one instead
of from zero.

## Scope

- **Offer (§5.11).** On a costed, editable phase with **no allocations**, when
  the previous **costed** phase has at least one: a secondary button **Copy
  from Validation** beside the Add person picker. Absent otherwise (first
  costed phase, previous one empty, phase frozen or initiative frozen).
- **Copy.** Each allocation of the previous costed phase whose person is an
  **active member** of the initiative's team gets a new allocation (new id)
  with the same Allocation %. Its snapshot is the previous phase's frozen
  snapshot when it was passed, else its live plan. One commit: "Checkout
  Redesign: 4 people copied to Development from Validation".
- **Skipped (§5.11).** People not copied (no longer an active member, or
  deactivated) are named in a note under the table: "Not copied: Lucía Ramos,
  no longer on Platform." The note stays until the phase is next edited or
  the page is left; it is not stored.
- Warnings on the copied rows (§7.2) show as for any allocation; Copy never
  lowers a percentage to avoid one (fix suggestions are 027's).

**Explicitly excluded:** copying cost items; copying into a non-empty phase.

## Execution path

1. User triggers: Development (empty) → **Copy from Validation**.
2. Data: 4 allocations added to Development in one commit; Lucía Ramos, no
   longer a member, skipped.
3. UI: four rows appear with their costs; "Not copied: Lucía Ramos, no longer
   on Platform." under the table.
4. User receives: a staffed phase in one click, and knows whom to replace.

## Value

- **Desirable:** Teams mostly carry on between phases.
- **Usable:** One click where staffing starts.
- **Valuable:** Removes the most repetitive entry in phase planning.

## Acceptance criteria

- [ ] Given an empty costed phase whose previous costed phase has
      allocations, then "Copy from <phase>" shows beside Add person; given the
      previous one is empty, or it is the first costed phase, it doesn't.
- [ ] Given Copy, then each active team member of the previous phase gets an
      allocation with the same Allocation % in one commit.
- [ ] Given the previous phase was passed, then the frozen snapshot's
      allocations are copied, not later edits.
- [ ] Given someone no longer an active member, then they are not copied and
      the note "Not copied: <name>, no longer on <team>." lists them (several
      names comma-separated).
- [ ] Given the phase is then edited, then the note disappears.
- [ ] Given everyone was skipped, then nothing is written and the note says
      so.
- [ ] Given a frozen phase or a Cancelled/Closed initiative, then no Copy is
      offered.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Placement:** a secondary button beside Add person in the empty table; the
  skipped list as a note under the table until the next edit.
- **Note style:** a subtle callout with an info icon (like the Skipped-gate
  banner), under the table; when everyone was skipped it sits under the empty
  panel, the Copy button stays, and it reads "Nothing copied. Not copied:
  Lucía Ramos, no longer on Platform."
- **Assumptions:** the note is component state, cleared by any change to the
  phase's plan or by leaving the page; the commit reads "1 person copied" for
  one; a previous phase without a snapshot (skipped gate) copies its live plan;
  Copy is offered whenever the previous costed phase has an allocation, even if
  all would be skipped; rows keep the previous order; no Undo.
