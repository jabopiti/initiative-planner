---
slice_id: "061"
title: "Phase editing: allocation load bar and team roster"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["056", "057"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Chosen by the user on 2 Oct 2026 from the 'Fewer steps, same plan' proposals 1 to 4. The current phase's three tables are rebuilt once, together: allocations (load bar, roster chips), cost items (month strip) and actuals (Record / Different amount, future months folded). Takes over the review's F02 (from 055) and F15 (from 056) so those tables aren't changed twice. The bulk 'Record all as estimated' button was withdrawn (non-goal: bulk actual-cost entry). §5.4, §5.11 and §9.5 updated. Backlog reshuffle (3 Oct 2026): split as the flag below proposed; the cost item month strip and actuals (with F15) are 061b, so this slice no longer waits on 059 or 060. Review (5 Oct 2026): free capacity checks the months from the current month on, like the warnings; Fill free is the reduce fix on allocation rows; bar colours, ceiling lines, controls, the not-counted look and the chip copy settled from mockups. §5.4, §5.11 updated."
recommended_model: "Claude Opus 5.5"
model_rationale: "A new accessible slider with segments in the hottest component, with load calculations shared with the capacity grid."
spec_sections: ["§5.4 Initiative detail view", "§5.11 Suggestions and shortcuts", "§7.2 Capacity, rates, and the three percentages", "§9.5 Accessibility"]
---

# Phase editing: allocation load bar and team roster

## Intent

**Problem statement:** In the current phase, an Allocation % is typed
blind and over-capacity shows only afterwards, an inline error pushes the
table out of shape, and people are added one per dropdown trip.

**Outcome statement:** The allocation table shows the data the decision
needs and takes one direct action: drag or pick an allocation against the
person's real load, and click a teammate to staff them.

## Scope

1. **Allocation load bar** (§5.4): replaces the % box. Segments for this
   allocation, the person's other counted allocations (§7.2) and overflow
   past a ceiling, with a line at each ceiling; the load is the highest
   month of the phase, the months the warnings check. Drag, arrow keys
   (±5%, Home, End), type once focused, or stops 25/50/75/100% and **Fill
   free <n>%**. Saves once on release or Enter. Uses the person-load
   calculation the capacity grid uses (`personLoad.ts`); no second copy.
2. **F02** (from 055): fixed column widths; a row's warnings and fix
   buttons in a full-width row under it.
3. **Team roster** (§5.4, §5.11): unallocated active members as chips with
   free capacity, most free first, "0% free" shown; a chip adds the person
   at their free capacity; **Copy from <previous costed phase>** in the
   same row; over 12 members → the searchable **Add person** picker.
   Removal keeps "Removed. Undo".

## Execution path

1. Checkout Redesign → Development → Jonas's load bar shows 50% here and
   60% elsewhere with overflow → **Fill free 40%** → one commit, warning
   gone.
2. Onboarding Flow v2 → Validation → chip "Sofia Molina · 50% free" →
   added at 50%.

## Value

- **Desirable:** The phase reads like a plan, not a form.
- **Usable:** Capacity is visible before a number is set; one click to
  staff a teammate.
- **Valuable:** Fewer capacity warnings created, faster staffing, and the
  allocation table changed once.

## Acceptance criteria

- [ ] Given Jonas at 50% here and 60% elsewhere (cap 100%), then the bar
      shows the three segments, the ceiling line and a hatched 10%, and its
      accessible value reads "50%, total load 110% of 100%".
- [ ] Given arrow-right on a focused bar, then the value steps by 5%; Home
      gives 0%, End 100%; typing "40" sets 40%.
- [ ] Given a drag from 50% to 70%, then exactly one write and one commit
      record 70% on release.
- [ ] Given **Fill free**, then the value equals §5.11's free capacity
      (from the current month on, this allocation left out) and no warning
      remains; a row with a capacity warning shows no "Set to <n>%" button.
- [ ] Given a Provisional phase, then the bar shows this allocation
      outlined, nothing hatched, and the load line reads "Provisional, not
      counted · …".
- [ ] Given a person at 30% here with Team FTE 80% and Capacity 100%, then
      two labelled ceiling lines show; with both at 100%, one line
      "Capacity and Team FTE 100%".
- [ ] Given a row with a warning, then it renders in its own full-width
      row and no column width changes.
- [ ] Given two unallocated members (50% and 0% free), then both chips
      show, 50% first; clicking it adds an allocation of 50%.
- [ ] Given 13 unallocated members, then the searchable picker shows
      instead of chips.
- [ ] Given the e2e axe scan, then the detail page passes in both themes.

## Flags and compromises

Cost items and actuals are 061b; the two can run in either order. The
load bar's
"highest month" choice follows the warning rule; showing the average was
considered and dropped.

## Decided in review (pre-implementation)

User picked proposals 1–4 on 2 Oct 2026 (3 and 4 now in 061b) from rendered mockups ("Fewer
steps, same plan").

Settled with the user on 5 Oct 2026, from rendered mockups:

- **Months.** §5.11 free capacity (chips, Fill free) checks the phase's
  months from the current month on, the same months as the warnings and
  fixes, so the bar, Fill free, the chips and the fixes always agree.
- **Bar look (option A).** This allocation in Accent; other counted work
  on this team, then on other teams, in two neutral shades; overflow
  hatched in Warning. A labelled line per ceiling: "Team FTE 80%" against
  the end of this team's work, "Capacity 100%" against the whole bar,
  merged as "Capacity and Team FTE 100%" when equal. No Team FTE line for a
  non-member or unknown person; no Capacity line for an inactive person.
- **Controls (option A).** Value as text beside the bar ("50%"); stops
  25 · 50 · 75 · 100 under the bar, clickable; under them the load line
  "110% of 100% in Nov 2026" and the text button **Fill free 40%**. All
  always visible. No 0 stop (Home gives 0%).
- **Fill free is the row's reduce fix (option A).** Allocation rows no
  longer show "Set to <n>%"; the warning row keeps only "Raise Team FTE %
  to <n>%". The capacity grid keeps its reduce. Fill free is shown when its
  value differs from the current one.
- **Not counted (option A).** On a Provisional phase, an initiative or team
  that doesn't count, or for an inactive person: same bar, this allocation
  as a dashed Accent outline, never hatched; the load line gives the reason
  in place of the ceiling ("Provisional, not counted · 60% elsewhere in Apr
  2027", "On hold, not counted …"); Fill free still offered.
- **Chips (option A).** "Sofia Molina · 50% free" for everyone, "0% free"
  in Warning text, with a Plus icon. Tooltip and accessible name add the
  role and where the load is ("Developer · 100% on Checkout Redesign
  (Platform) in Oct 2026"). Copy from <phase> sits at the row's end.

Assumptions (stated, not asked):

- Loads come from `capacity.ts` (`activeLoads`, the warnings' and grid's
  source); free capacity from `personLoad.ts`. No second calculation.
- Shown month: the highest-load month among the warning months; when a
  ceiling is exceeded, the month with the largest overflow. Ties: earliest.
- Saving: a drag saves once on release; arrows, Home, End and digits change
  the value locally and save on Enter or blur, Esc reverts; a stop or Fill
  free saves on click. One write each. A digit that would pass 100 is
  ignored.
- Scale 0–150%; the value stops at 100%; load past 150% is clipped with an
  end mark. Accessible value: "50%, total load 110% of 100%"; not counted:
  "60%, provisional, not counted".
- Built on shadcn `slider` (radix-ui installed) and, for the >12 picker,
  shadcn `command` (cmdk installed). No new dependency.
- The bar is used in every editable allocation table (current and future
  phases); frozen and read-only phases keep plain text. Without a valid
  period there is no load line and no Fill free; the stops still work.
- F02: fixed column widths (Person, Allocation %, Days, Cost, Remove);
  warnings, the raise fix, a failed save and a conflict sit in a full-width
  row under the row.
- Chips also replace the select in the "Who works on …" empty box. Copy
  from stays only while the phase has no allocations (§5.11). A 0% chip adds
  at 0%. Without a valid period, chips show the name only, add at the Team
  FTE % (as today) and "Set the period to see who has room." stays.
- Unchanged: "Removed. Undo", "Only members of <team> can be allocated.".
