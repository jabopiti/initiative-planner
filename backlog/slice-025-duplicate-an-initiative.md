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
change_summary: "Promoted from the backlog tail (Duplicate an initiative, §5.11). Review settled: a toast names people left out of the copy, a period's length is whole months or else its exact day count, and the other behaviours §5.11 leaves open (see Decided in review)."
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
- [ ] Given an owner who is deactivated, then the copy has no owner.
- [ ] Given a costed phase without a valid period, then the copy's phase has
      no period but keeps its allocations and cost items, and is left out of the chaining.
- [ ] Given a period that is not a whole number of months (1 Jan to 20 Mar),
      then the copy's period has the same number of days.
- [ ] Given a one-month item outside its phase's period, then it keeps its
      distance in months from the period's start in the copy.
- [ ] Given someone was left out of the copy's allocations, then a toast on
      the new page reads "Not copied: Lucía Ramos, no longer on Platform."
      (names joined with commas); with nobody left out, no toast.
- [ ] Given Duplicate on a Closed, Cancelled or On Hold initiative, then it
      works and the copy is Active.
- [ ] Given the save fails, then nothing opens and the read-only banner shows.

## Flags and compromises

**Assumptions stated in review:** a deactivated owner is not carried over; the
name-clash suffix ("copy 2") is not in §5.11; a costed phase without a valid
period is copied without a period.

## Decided in review (pre-implementation)

User decisions:

- **Skipped people.** When anyone is left out of the copy's allocations, a
  toast on the new page reads "Not copied: <names>, no longer on <team>."
  (the wording of §5.11 Copy allocations, §9.2); no toast when nobody was left out.

Assumptions confirmed:

- **Length.** A period that is a whole number of months (its end day plus one
  equals its start plus n months) is copied as n months, chained by 005c's
  rule. Any other period keeps its exact day count.
- **One-month items.** The month's distance from the period's start month is
  kept, also for an item outside the period (it still counts) and for a spread
  item's remembered month.
- **Frozen phases** are copied from the gate's snapshot (period, allocations,
  cost items). Actuals, gates, checklist state and the default-plan flag are not copied;
  the copy starts in the first phase.
- **Phases without a valid period** are copied with their allocations and cost
  items but no period, and are left out of the chaining; the others chain from today in
  process order.
- **Owner and team.** The owner carries over only if still active; the team is
  kept even if deactivated.
- **Menu.** Duplicate (Lucide Copy) sits after Cancel and before Reopen
  (§5.4's order), in every status.
- **Name clash.** Checked against all initiatives, trimmed and case-insensitive:
  "X copy", then "X copy 2", "X copy 3". Duplicating "X copy" gives "X copy copy".
- **Opening.** A new history entry, only after the file is saved; a second
  click while saving is ignored. One commit "<copy name>: created from <name>".
