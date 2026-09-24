---
slice_id: "009"
title: "View team capacity grid with warnings"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: null
recommended_model: "Claude Sonnet 5"
model_rationale: "Moderate-complexity aggregation across months and teams with two distinct ceiling types; not as rule-dense as gate passing but more than simple CRUD. Escalate to Opus 5 only if the multi-team aggregation misbehaves in testing."
spec_sections: ["§5.8 Team detail view (Capacity view)", "§7.2 Capacity, rates, and the three percentages", "§9.8 Visual design (Warning colour)"]
---

# View team capacity grid with warnings

## Intent

**Problem statement:** A team lead cannot see whether their team is
over-committed across the months of active work when allocations exist
(slice 005), because there is no view yet showing load per person per
month against their capacity ceilings.

**Outcome statement:** This slice contributes to the tool's promise of
answering "who is committed to what, and by how much" by enabling a team
lead to see a month-by-month capacity grid for their team, with warnings
for both ceiling types.

## Scope

- The month-by-month grid on the team detail (§5.8): one row per member,
  one column per month from the current month through the last month with
  an allocation.
- Each cell shows the member's Allocation % on the team's Active
  initiatives against their Team FTE %.
- A cell is tinted with the Warning colour and an icon when it exceeds the
  Team FTE %, and likewise (different icon) when the member's total across
  all teams exceeds their Capacity %.
- Selecting a cell or row shows the contributing initiatives.
- Only Confirmed allocations count toward either ceiling (§7.2, §4); per
  engine-audit.md, port `isPhaseConfirmed` with a month-key comparison for
  its current-or-next-month threshold, not date-object arithmetic (the
  prototype's `setUTCMonth` shift is subject to day-31 overflow).

**Explicitly excluded:** The two-fix capacity suggestion (§5.11) — seeing
the warning and its cause is the core value; suggesting a specific fix is
a separate, later enhancement on top of an already-correct warning
display.

## Execution path

1. User triggers: opens a team's detail page.
2. Engine: for each active member and each relevant month, sums Allocation
   % across the team's Active initiatives and compares to Team FTE %, and
   sums across all teams to compare to Capacity %.
3. UI: renders the grid with tinted, iconed cells where a ceiling is
   exceeded.
4. User triggers: selects a cell.
5. User receives: the list of initiatives contributing to that cell's
   figure.

## Value

- **Desirable:** A team lead responsible for a team's workload would seek
  this as soon as more than one initiative is drawing on the same people.
- **Usable:** A user can see at a glance which cells are a problem, and
  one click reveals why, without needing to cross-reference initiatives
  manually.
- **Valuable:** After this slice, a team lead can catch and address
  over-commitment before it becomes a real scheduling problem.

## Acceptance criteria

- [ ] Given a member allocated above their Team FTE % in a given month,
      when the grid is viewed, then that cell is tinted with the Warning
      colour and an icon distinct from the over-Capacity-% icon.
- [ ] Given a member's total allocation across all their teams exceeds
      their Capacity % in a given month, when the grid is viewed, then
      that cell shows the over-Capacity-% warning.
- [ ] Given a warned cell, when it is selected, then the contributing
      initiatives are listed.
- [ ] Given no member is over either ceiling, when the grid is viewed,
      then no cell is tinted.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
