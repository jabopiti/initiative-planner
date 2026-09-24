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
recommended_model: "Claude Sonnet 5"
model_rationale: "Moderate-complexity aggregation across months and teams with two distinct ceiling types; not as rule-dense as gate passing but more than simple CRUD. Escalate to Opus 5 only if the multi-team aggregation misbehaves in testing."
change_summary: "Decided in the pre-implementation review: the slice also carries the orphaned capacity warnings (the allocation-row warning slice 005 deferred, the Teams overview marker slice 004d left out) and the rest of §5.8's capacity view (Provisional figure, Copy, Team FTE %-sum line, stranded allocations on their own row). Detail opens below the grid; the two ceilings use the Lucide chart-pie and gauge icons."
spec_sections: ["§5.8 Team detail view (Capacity view)", "§5.4 Initiative detail view (allocation rows)", "§5.7 Teams overview (warning marker)", "§7.2 Capacity, rates, and the three percentages", "§9.2 Copy", "§9.8 Visual design (Warning colour)", "§9.10 Icons"]
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

- Decided in review (pre-implementation):
  - Each cell shows the number only; the Team FTE % sits under the name (§5.8).
    An empty cell reads `–`.
  - Allocations on Provisional phases appear as a lighter `+20%` beside the
    number and are not counted toward either flag; a legend line under the
    grid says so.
  - A cell can carry both icons. Over Team FTE % = Lucide `ChartPie`, over
    Capacity % = `Gauge`; the detail names the ceiling in words.
  - Selecting a cell or a person's name opens the detail **below the grid**:
    the ceiling(s) exceeded in words, the counted initiatives (other teams'
    named), the Provisional ones not counted, and the other §7.2 warnings
    for that person: Team FTE %s adding up to more than Capacity %, and
    allocations that outlived the membership.
  - A person allocated on the team's Active initiatives who is no longer an
    active member gets their own row, "No longer a member" in place of a
    Team FTE %.
  - The grid has a **Copy** button (§9.2): cells as `70%`, with markers in
    words (`70% (over Team FTE %)`, `50% +20% provisional`).
  - Allocation rows on the initiative page (§5.4) warn, in words, when the
    person is over their Team FTE % or Capacity % in any month of a
    Confirmed phase, or is no longer a member of the team.
  - The Teams overview (§5.7) marks a team, icon-only with a tooltip, when
    any of its members has a capacity warning.
  - Empty states: no members, "No members yet. Add members to see their
    capacity."; no allocations, "Nothing allocated yet. Allocate members to
    an initiative's phase and their months appear here."
  - Until slice 008 the current phase is always the process's first phase
    (`currentPhaseId`), which is Discovery and not costed, so a costed phase
    counts as Confirmed only by its start date (this or next month).

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

- [x] Given a member allocated above their Team FTE % in a given month,
      when the grid is viewed, then that cell is tinted with the Warning
      colour and an icon distinct from the over-Capacity-% icon.
- [x] Given a member's total allocation across all their teams exceeds
      their Capacity % in a given month, when the grid is viewed, then
      that cell shows the over-Capacity-% warning.
- [x] Given a warned cell, when it is selected, then the contributing
      initiatives are listed.
- [x] Given no member is over either ceiling, when the grid is viewed,
      then no cell is tinted.
- [x] Given an allocation on a Provisional phase, when the grid is viewed,
      then it shows as a lighter figure beside the number and is not counted
      toward either warning.
- [x] Given a member whose Team FTE %s add up to more than their Capacity %,
      or an allocation that outlived its membership, when their cell or row
      is selected, then the detail names that warning; the outlived
      allocation sits on a "No longer a member" row.
- [x] Given the grid, when Copy is used, then the shown months, figures and
      warning markers are copied as text and a table.
- [x] Given an allocation row on the initiative page whose person is over a
      ceiling in a month of a Confirmed phase, or no longer on the team,
      then the row says so in words.
- [x] Given a team with a member who has a capacity warning, when the Teams
      overview is viewed, then that team carries the warning marker.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
