---
slice_id: "006"
title: "Availability suggestion in the person picker"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Haiku 4.5"
model_rationale: "A bounded, well-specified read-only computation over already-correct data from slice 005; a cheap model is sufficient. Escalate to Sonnet 5 only if the multi-month minimum calculation proves fiddly to get right first try."
spec_sections: ["§5.11 Suggestions and shortcuts (Availability in the person picker)", "§7.2 Capacity (both ceilings)"]
---

# Availability suggestion in the person picker

## Intent

**Problem statement:** A team lead cannot quickly staff a phase without
manually checking each person's remaining capacity when adding an
allocation, because the person picker introduced in slice 005 lists
members with no indication of who has room.

**Outcome statement:** This slice contributes to minimum time in the tool
by enabling the person picker to list members by free capacity and
prefill an Allocation % that never causes a warning by default.

## Scope

- Add-person control lists the initiative's team's active members sorted
  by free capacity (most free first).
- Free capacity per person: the lower of their unused Team FTE % on this
  team and their unused Capacity % across all teams, taken as the minimum
  over the phase's months, excluding Provisional phases and initiatives
  that don't count toward capacity (§7.2).
- Allocation % is prefilled with that free-capacity figure; still fully
  editable.

**Explicitly excluded:** Capacity warnings on the allocation row itself
(that's slice 009, since it needs the fuller capacity-warning display) —
this slice only affects what the picker suggests before an allocation
exists, not what's shown after.

## Execution path

1. User triggers: opens the add-person control on a phase.
2. Engine: computes each active member's free capacity for the phase's
   months per the §7.2 rule.
3. UI: lists members sorted by free capacity, most free first.
4. User triggers: selects a person; Allocation % is prefilled with their
   free capacity.
5. User receives: an allocation that, if accepted unchanged, cannot cause
   an over-capacity or over-Team-FTE state.

## Value

- **Desirable:** A team lead staffing several people onto a phase would
  seek this to avoid manually cross-checking capacity for each candidate.
- **Usable:** A user opens the picker and sees the most available people
  first, with a percentage already filled in — no calculation needed.
- **Valuable:** After this slice, a team lead staffs a phase faster and
  with fewer accidental over-commitments than with slice 005 alone.

## Acceptance criteria

- [ ] Given a team with members at varying capacity, when the add-person
      picker opens, then members are listed most-free-capacity first.
- [ ] Given a selected person, when they are added, then Allocation % is
      prefilled with their computed free capacity for the phase's months.
- [ ] Given a person is fully committed elsewhere, when the picker opens,
      then they appear with a free capacity of 0% rather than being
      hidden.
- [ ] Given the prefilled Allocation % is accepted unchanged, when the
      allocation is saved, then it does not exceed the person's Team FTE %
      or Capacity % for any month of the phase.

## Delivery gate

- [ ] Deployed to production-equivalent environment
- [ ] Demonstrated to at least one external stakeholder (user, customer,
      or business owner)

## Flags and compromises

None.
