---
slice_id: "025"
title: "Duplicate an initiative"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005c", "007", "014"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Duplicate an initiative, §5.11). §5.11 specifies it fully; no open decisions were found in review, only assumptions."
recommended_model: "Claude Sonnet 5"
model_rationale: "One data-layer function re-chaining periods (reusing 005c's rule), mapping allocations and cost items to new ids and keeping one-month items' position within their phase; the date arithmetic needs careful tests, the rest is straightforward."
spec_sections: ["§5.11 Suggestions and shortcuts (Duplicate, Default plan)", "§5.4 Initiative detail view (Actions menu)", "§6 Data model", "§10.3 Writing", "§10.6 Identifiers and links"]
---

# Duplicate an initiative

## Intent

**Problem statement:** Platform runs a checkout change every year with much the
same team and cost structure. Planning the next one means creating it from a
name and re-entering every phase, person and cost item by hand.

**Outcome statement:** Duplicate creates a new initiative from an existing
one's shape — team, owner, description, phase lengths, allocations and cost
items — re-planned from today, with none of the original's history (§5.11).

## Scope

- **Menu item (§5.4).** **Duplicate** (Lucide Copy icon) in the Actions menu,
  in every status — one entry in 014's action list. Reading a frozen
  (Closed or Cancelled) initiative to copy it is allowed by 015's freeze.
- **The copy (§5.11).** A new initiative (new id), Active, named "<name> copy",
  with the same team, owner (only if still active) and description. For each
  costed phase with a valid period: the **same length**, re-chained from today
  by 005c's rule; allocations of **active team members only**, same
  Allocation %; cost items with the same label, amount and timing, a one-month
  item keeping its **position within the phase** (the 3rd month stays the
  3rd). Values come from a frozen phase's snapshot where one exists. No gate
  records, checklist state or actuals. Not marked as a default plan (it
  carries user data, so it is not untouched, §8.2).
- **Name clash.** If "<name> copy" exists, "<name> copy 2", then 3, and so on.
- **Opens in place (§5.11).** The new initiative's page opens in the same
  tab as a normal navigation (a new history entry), so Back returns to the
  original. One commit: "Checkout
  Redesign copy: created from Checkout Redesign".
- **Failure.** Same as a failed create today: nothing opens, the read-only
  banner shows.

**Explicitly excluded:** choosing a starting phase for the copy (it starts in
the first phase); duplicating to another team.

## Execution path

1. User triggers: Checkout Redesign (Closed) → ⋯ Actions → **Duplicate**.
2. Data: a new initiative file with Validation 3 months from today,
   Development 6 months after it, the same people and cost items.
3. UI: "Checkout Redesign copy" opens in Discovery.
4. User receives: next year's plan in one click, ready to adjust.

## Value

- **Desirable:** Recurring work is common; nobody wants to re-type it.
- **Usable:** One menu item; the result is an ordinary initiative.
- **Valuable:** Turns past plans into templates without a template feature.

## Acceptance criteria

- [ ] Given any status, then the Actions menu lists Duplicate.
- [ ] Given Duplicate on Checkout Redesign, then a new Active initiative
      "Checkout Redesign copy" with the same team, description and (active)
      owner opens in place, in one commit.
- [ ] Given Validation lasted 3 months and Development 6, then the copy's
      Validation starts today and lasts 3 months, and Development follows for
      6 (005c's chaining rule).
- [ ] Given allocations of an active and an inactive/non-member person, then
      only the active member's allocation is copied, with the same %.
- [ ] Given a one-month cost item in the 3rd month of Development, then the
      copy's item is in the 3rd month of the copy's Development; a spread item
      stays spread.
- [ ] Given a passed phase, then its frozen snapshot's values are copied.
- [ ] Given the original has gate records, checklist state and actuals, then
      the copy has none.
- [ ] Given "Checkout Redesign copy" exists, then the new one is named
      "Checkout Redesign copy 2".
- [ ] Given Back after duplicating, then the original opens.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

**Assumptions stated in review:** a deactivated owner is not carried over; the
name-clash suffix ("copy 2") is not in §5.11; a costed phase without a valid
period is copied without a period.

## Decided in review (pre-implementation)

No open decisions: §5.11 specifies the behaviour; the assumptions above apply.
